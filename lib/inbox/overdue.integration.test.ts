import { and, eq, isNull } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import * as schema from "@/lib/db/schema";
import { amendments, events, subscriptions, users } from "@/lib/db/schema";
import {
  createSeedData,
  DEFAULT_SEED_EMAIL,
  SEED_SUBSCRIPTION_IDS,
  SEED_USER_ID,
} from "@/lib/db/seed-data";
import { advanceByCadence } from "@/lib/subscriptions/dates";
import { today } from "@/lib/subscriptions/query";

const state = vi.hoisted(() => ({
  email: null as string | null,
  db: null as unknown,
}));

vi.mock("@/auth", () => ({
  auth: async () => (state.email ? { user: { email: state.email } } : null),
}));

vi.mock("@/lib/db", () => ({
  getDb: () => state.db,
  closeDb: async () => {},
}));

const { POST: stillHoldingRoute } = await import(
  "@/app/api/inbox/overdue/[id]/still-holding/route"
);
const { POST: cancelRoute } = await import("@/app/api/inbox/overdue/[id]/cancel/route");
const { GET: inboxRoute } = await import("@/app/api/inbox/route");

const SECOND_USER = {
  id: "00000000-0000-4000-8000-0000000000f5",
  email: "other-overdue@example.com",
  subscriptionId: "00000000-0000-4000-8000-00000000f801",
  amendmentId: "00000000-0000-4000-8000-00000000f802",
};

/** Overdue, and with no cadence to roll the date by. */
const NO_CADENCE_ID = "00000000-0000-4000-8000-00000000f803";
/** Overdue, and cancelled from Inbox in its own test. */
const CANCEL_ID = "00000000-0000-4000-8000-00000000f804";
const CANCEL_AMENDMENT_ID = "00000000-0000-4000-8000-00000000f805";

function dayOffset(days: number) {
  const date = new Date();

  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

async function act(
  route: typeof stillHoldingRoute,
  id: string,
  path: string,
  body?: unknown,
) {
  const response = await route(
    new Request(`http://localhost/api/inbox/overdue/${id}/${path}`, {
      method: "POST",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );

  return { status: response.status, body: await response.json() };
}

const stillHolding = (id: string) => act(stillHoldingRoute, id, "still-holding");
const cancel = (id: string, body?: unknown) => act(cancelRoute, id, "cancel", body);

async function overdueProviders() {
  const response = await inboxRoute();
  const body = (await response.json()) as {
    overdue: { provider: { value: string } }[];
    renewingSoon: { provider: { value: string } }[];
  };

  return {
    overdue: body.overdue.map((item) => item.provider.value),
    renewingSoon: body.renewingSoon.map((item) => item.provider.value),
  };
}

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.runIf(hasDatabase)("inbox overdue actions", () => {
  let client: Client;
  let db: NodePgDatabase<typeof schema>;

  async function rowById(id: string) {
    const [row] = await db.select().from(subscriptions).where(eq(subscriptions.id, id));

    return row;
  }

  const headspace = () => rowById(SEED_SUBSCRIPTION_IDS.headspace);

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await client.query("begin");
    db = drizzle(client, { schema });

    /** The file shares one connection, so a route transaction reuses it. */
    state.db = new Proxy(db, {
      get(target, property) {
        if (property === "transaction") {
          return (run: (tx: NodePgDatabase<typeof schema>) => unknown) => run(target);
        }

        const value = Reflect.get(target, property, target);

        return typeof value === "function" ? value.bind(target) : value;
      },
    });

    const seed = createSeedData(new Date());
    const confirmed = {
      provider_field_status: "confirmed",
      amount_field_status: "confirmed",
      cadence_field_status: "confirmed",
      renewal_field_status: "confirmed",
      status_field_status: "confirmed",
    } as const;

    await db.insert(users).values([
      seed.user,
      { id: SECOND_USER.id, name: "Other user", email: SECOND_USER.email },
    ]);
    await db.insert(subscriptions).values([
      ...seed.subscriptions,
      {
        id: NO_CADENCE_ID,
        user_id: SEED_USER_ID,
        provider_canonical: "no-cadence",
        provider_display: "No Cadence",
        status: "active" as const,
        currency: "GBP",
        cadence: null,
        amount_minor: 400,
        next_renewal: dayOffset(-14),
        ...confirmed,
        cadence_field_status: "empty" as const,
      },
      {
        id: CANCEL_ID,
        user_id: SEED_USER_ID,
        provider_canonical: "gone-quiet",
        provider_display: "Gone Quiet",
        status: "active" as const,
        currency: "GBP",
        cadence: "monthly" as const,
        amount_minor: 800,
        next_renewal: dayOffset(-33),
        ...confirmed,
      },
      {
        id: SECOND_USER.subscriptionId,
        user_id: SECOND_USER.id,
        provider_canonical: "not-yours",
        provider_display: "Not Yours",
        status: "active" as const,
        currency: "GBP",
        cadence: "monthly" as const,
        amount_minor: 1200,
        next_renewal: dayOffset(-40),
        ...confirmed,
      },
    ]);
    await db.insert(amendments).values([
      ...seed.amendments,
      {
        id: CANCEL_AMENDMENT_ID,
        user_id: SEED_USER_ID,
        subscription_id: CANCEL_ID,
        effective_from: dayOffset(-400),
        amount_minor: 800,
        currency: "GBP",
        cadence: "monthly" as const,
      },
      {
        id: SECOND_USER.amendmentId,
        user_id: SECOND_USER.id,
        subscription_id: SECOND_USER.subscriptionId,
        effective_from: dayOffset(-400),
        amount_minor: 1200,
        currency: "GBP",
        cadence: "monthly" as const,
      },
    ]);

    state.email = DEFAULT_SEED_EMAIL;
  });

  afterAll(async () => {
    await client.query("rollback");
    await client.end();
  });

  it("refuses a visitor who is not signed in, and writes nothing", async () => {
    state.email = null;
    const before = await headspace();

    expect((await stillHolding(SEED_SUBSCRIPTION_IDS.headspace)).status).toBe(401);
    expect((await cancel(SEED_SUBSCRIPTION_IDS.headspace)).status).toBe(401);
    expect(await headspace()).toEqual(before);

    state.email = DEFAULT_SEED_EMAIL;
  });

  it("never acts on another user's row", async () => {
    const before = await rowById(SECOND_USER.subscriptionId);

    expect((await stillHolding(SECOND_USER.subscriptionId)).status).toBe(404);
    expect((await cancel(SECOND_USER.subscriptionId)).status).toBe(404);
    expect(await rowById(SECOND_USER.subscriptionId)).toEqual(before);
  });

  it("404s a missing id and a malformed one", async () => {
    expect((await stillHolding("00000000-0000-4000-8000-000000009999")).status).toBe(404);
    expect((await stillHolding("not-a-uuid")).status).toBe(404);
  });

  it("will not roll a row with no cadence to roll by", async () => {
    const before = await rowById(NO_CADENCE_ID);
    const { status, body } = await stillHolding(NO_CADENCE_ID);

    expect(status).toBe(409);
    expect(body).toMatchObject({ error: "no_cadence" });
    expect(await rowById(NO_CADENCE_ID)).toEqual(before);
  });

  it("rolls a passed due date forward by cadence, as inferred", async () => {
    const before = await headspace();
    const { status, body } = await stillHolding(SEED_SUBSCRIPTION_IDS.headspace);
    const after = await headspace();

    expect(status).toBe(200);
    expect(body).toMatchObject({
      action: "still_holding",
      provider: "Headspace",
      from: before.next_renewal,
    });

    /** Forward by whole cadence steps, landing today or later. */
    expect(after.next_renewal! >= today()).toBe(true);
    expect(after.next_renewal).toBe(body.to);
    expect(advanceByCadence(before.next_renewal!, "monthly") <= after.next_renewal!).toBe(
      true,
    );
  });

  it("marks that date inferred, never confirmed", async () => {
    const after = await headspace();

    expect(after.renewal_field_status).toBe("inferred");
  });

  it("leaves the money, the cadence and the status alone", async () => {
    const after = await headspace();

    expect(after).toMatchObject({
      status: "active",
      status_field_status: "confirmed",
      amount_minor: 999,
      amount_field_status: "confirmed",
      cadence: "monthly",
      cadence_field_status: "confirmed",
      ends_on: null,
    });
  });

  it("takes the row out of Overdue once it is rolled", async () => {
    const { overdue } = await overdueProviders();

    expect(overdue).not.toContain("Headspace");
  });

  it("refuses to roll the same row twice", async () => {
    const before = await headspace();
    const { status, body } = await stillHolding(SEED_SUBSCRIPTION_IDS.headspace);

    expect(status).toBe(409);
    expect(body).toMatchObject({ error: "not_overdue" });
    expect(await headspace()).toEqual(before);
  });

  it("does not treat a confirmed auto-renewing holding as overdue work", async () => {
    const before = await rowById(SEED_SUBSCRIPTION_IDS.cursor);
    const { status, body } = await stillHolding(SEED_SUBSCRIPTION_IDS.cursor);

    expect(status).toBe(409);
    expect(body).toMatchObject({ error: "not_overdue" });
    expect(await rowById(SEED_SUBSCRIPTION_IDS.cursor)).toEqual(before);
    expect((await overdueProviders()).overdue).not.toContain("Cursor");
  });

  it("does not roll a passed trial into a paid schedule", async () => {
    const before = await rowById(SEED_SUBSCRIPTION_IDS.calm);
    const { status, body } = await stillHolding(SEED_SUBSCRIPTION_IDS.calm);

    expect(status).toBe(409);
    expect(body).toMatchObject({ error: "no_renewal" });
    expect(await rowById(SEED_SUBSCRIPTION_IDS.calm)).toEqual(before);
    expect(before.status).toBe("trial");
    expect((await overdueProviders()).overdue).toContain("Calm");
  });

  it("refuses to cancel without reviewing the actual end date", async () => {
    const before = await rowById(CANCEL_ID);
    const { status, body } = await cancel(CANCEL_ID);
    const after = await rowById(CANCEL_ID);

    expect(status).toBe(409);
    expect(body).toMatchObject({ error: "needs_end_date" });
    expect(after).toEqual(before);
  });

  it("leaves the row unresolved when the end date is unknown, and stores a note", async () => {
    const before = await rowById(CANCEL_ID);
    const { status, body } = await cancel(CANCEL_ID, {
      unknownTiming: true,
      notes: "Not sure when it stopped.",
    });
    const after = await rowById(CANCEL_ID);

    expect(status).toBe(200);
    expect(body).toMatchObject({
      action: "unresolved",
      provider: "Gone Quiet",
      notesSaved: true,
    });
    expect(after.status).toBe("active");
    expect(after.next_renewal).toBe(before.next_renewal);
    expect(after.notes).toContain("Not sure when it stopped.");
    expect((await overdueProviders()).overdue).toContain("Gone Quiet");
  });

  it("ends a cancelled row on the date the user states, not a stale stored renewal", async () => {
    const before = await rowById(CANCEL_ID);
    const endsOn = dayOffset(-10);
    const { status, body } = await cancel(CANCEL_ID, { endsOn, notes: "Ended mid-cycle." });
    const after = await rowById(CANCEL_ID);

    expect(status).toBe(200);
    expect(body).toMatchObject({
      action: "cancelled",
      provider: "Gone Quiet",
      endsOn,
    });

    expect(after.ends_on).toBe(endsOn);
    expect(after.ends_on).not.toBe(before.next_renewal);
    expect(after.notes).toContain("Ended mid-cycle.");
  });

  it("keeps the subscription's identity and clears what cannot renew", async () => {
    const after = await rowById(CANCEL_ID);

    expect(after).toMatchObject({
      id: CANCEL_ID,
      provider_canonical: "gone-quiet",
      provider_display: "Gone Quiet",
      status: "cancelled",
      status_field_status: "confirmed",
      amount_minor: 800,
      next_renewal: null,
    });
  });

  it("closes the open amendment and logs the ending", async () => {
    const open = await db
      .select()
      .from(amendments)
      .where(
        and(eq(amendments.subscription_id, CANCEL_ID), isNull(amendments.effective_to)),
      );

    expect(open).toHaveLength(0);

    const logged = await db
      .select()
      .from(events)
      .where(and(eq(events.subscription_id, CANCEL_ID), eq(events.type, "cancelled")));

    expect(logged).toHaveLength(1);
    expect(logged[0].confirmed).toBe(true);
  });

  it("takes the cancelled row out of Overdue, and refuses a second cancel", async () => {
    const { overdue } = await overdueProviders();

    expect(overdue).not.toContain("Gone Quiet");
    expect((await cancel(CANCEL_ID, { endsOn: dayOffset(-1) })).status).toBe(409);
  });
});
