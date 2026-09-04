import { and, eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import * as schema from "@/lib/db/schema";
import { amendments, proposals, subscriptions, users } from "@/lib/db/schema";
import {
  createSeedData,
  DEFAULT_SEED_EMAIL,
  SEED_SUBSCRIPTION_IDS,
  SEED_USER_ID,
} from "@/lib/db/seed-data";
import { rollNextRenewal } from "@/lib/subscriptions/dates";
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

const { POST: scanRoute } = await import("@/app/api/jobs/lapse-scan/route");
const { POST: acceptRoute } = await import("@/app/api/proposals/[id]/accept/route");

const SECOND_USER = {
  id: "00000000-0000-4000-8000-0000000000f3",
  email: "other@example.com",
  subscriptionId: "00000000-0000-4000-8000-00000000f601",
  amendmentId: "00000000-0000-4000-8000-00000000f602",
};

/** Relative to the run, because the seed's dates are too. */
function dayOffset(days: number) {
  const date = new Date();

  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

type ScanBody = {
  scanned: number;
  proposed: unknown[];
  rolled: { subscriptionId: string; provider: string; from: string; to: string }[];
  skipped: { subscriptionId: string; reason: string }[];
};

async function scan() {
  const response = await scanRoute();

  return { status: response.status, body: (await response.json()) as ScanBody };
}

async function accept(id: string) {
  const response = await acceptRoute(
    new Request(`http://localhost/api/proposals/${id}/accept`, { method: "POST" }),
    { params: Promise.resolve({ id }) },
  );

  return { status: response.status, body: await response.json() };
}

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.runIf(hasDatabase)("lapse scan API", () => {
  let client: Client;
  let db: NodePgDatabase<typeof schema>;

  async function headspace() {
    const [row] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, SEED_SUBSCRIPTION_IDS.headspace));

    return row;
  }

  async function lapseProposals(userId = SEED_USER_ID) {
    return db
      .select()
      .from(proposals)
      .where(and(eq(proposals.user_id, userId), eq(proposals.kind, "lapsed")));
  }

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

    await db.insert(users).values([
      seed.user,
      { id: SECOND_USER.id, name: "Other user", email: SECOND_USER.email },
    ]);
    await db.insert(subscriptions).values([
      ...seed.subscriptions,
      {
        id: SECOND_USER.subscriptionId,
        user_id: SECOND_USER.id,
        provider_canonical: "hulu",
        provider_display: "Hulu",
        status: "active",
        currency: "GBP",
        cadence: "monthly",
        amount_minor: 1200,
        next_renewal: dayOffset(-40),
        provider_field_status: "confirmed",
        amount_field_status: "confirmed",
        cadence_field_status: "confirmed",
        renewal_field_status: "confirmed",
        status_field_status: "confirmed",
      },
    ]);
    await db.insert(amendments).values([
      ...seed.amendments,
      {
        id: SECOND_USER.amendmentId,
        user_id: SECOND_USER.id,
        subscription_id: SECOND_USER.subscriptionId,
        effective_from: dayOffset(-400),
        amount_minor: 1200,
        currency: "GBP",
        cadence: "monthly",
      },
    ]);

    state.email = DEFAULT_SEED_EMAIL;
  });

  afterAll(async () => {
    await client.query("rollback");
    await client.end();
  });

  it("refuses to run for a visitor who is not signed in", async () => {
    state.email = null;

    expect((await scan()).status).toBe(401);
    expect(await lapseProposals()).toHaveLength(0);

    state.email = DEFAULT_SEED_EMAIL;
  });

  it("rolls a stale due date to inferred and does not propose a lapse", async () => {
    const before = await headspace();
    const rolledTo = rollNextRenewal(before.next_renewal!, "monthly", today());
    const { status, body } = await scan();

    expect(status).toBe(200);
    expect(body.proposed).toEqual([]);
    expect(body.rolled).toMatchObject([
      {
        subscriptionId: SEED_SUBSCRIPTION_IDS.headspace,
        provider: "Headspace",
        from: before.next_renewal,
        to: rolledTo,
      },
    ]);
    expect(await headspace()).toMatchObject({
      status: "active",
      status_field_status: "confirmed",
      ends_on: null,
      next_renewal: rolledTo,
      renewal_field_status: "inferred",
    });
    expect(await lapseProposals()).toHaveLength(0);
  });

  it("never touches another user's overdue subscription", async () => {
    expect(await lapseProposals(SECOND_USER.id)).toHaveLength(0);
    const [row] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, SECOND_USER.subscriptionId));

    expect(row).toMatchObject({
      status: "active",
      next_renewal: dayOffset(-40),
      renewal_field_status: "confirmed",
    });
  });

  it("does not roll a due date that is already current", async () => {
    const { body } = await scan();

    expect(body.proposed).toEqual([]);
    expect(body.rolled).toEqual([]);
    expect(body.scanned).toBe(0);
  });

  it("still lets the user accept a lapse they said happened", async () => {
    const [raised] = await db
      .insert(proposals)
      .values({
        user_id: SEED_USER_ID,
        subscription_id: SEED_SUBSCRIPTION_IDS.headspace,
        kind: "lapsed",
        state: "pending",
        payload: {
          subscriptionStatus: { value: "lapsed", status: "proposed", confidence: "medium" },
          endsOn: dayOffset(-21),
        },
      })
      .returning();

    expect(await headspace()).toMatchObject({ status: "active" });
    expect((await accept(raised.id)).status).toBe(200);
    expect(await headspace()).toMatchObject({ status: "lapsed", ends_on: dayOffset(-21) });
  });
});
