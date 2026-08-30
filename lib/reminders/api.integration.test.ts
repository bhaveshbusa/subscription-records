import { eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { deferQuestion, DEFERRAL_DAYS } from "@/lib/capture/questions";
import * as schema from "@/lib/db/schema";
import { amendments, captureQuestions, reminders, subscriptions, users } from "@/lib/db/schema";
import {
  createSeedData,
  DEFAULT_SEED_EMAIL,
  SEED_SUBSCRIPTION_IDS,
  SEED_USER_ID,
} from "@/lib/db/seed-data";
import type { ReminderView } from "@/lib/reminders/projection";

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

const { POST: scanRoute } = await import("@/app/api/jobs/reminder-scan/route");
const { GET: listRoute } = await import("@/app/api/reminders/route");
const { POST: dismissRoute } = await import("@/app/api/reminders/[id]/dismiss/route");

const SECOND_USER = {
  id: "00000000-0000-4000-8000-0000000000f5",
  email: "other-reminders@example.com",
  subscriptionId: "00000000-0000-4000-8000-00000000f701",
  amendmentId: "00000000-0000-4000-8000-00000000f702",
};

/** Relative to the run, because the seed's dates are too. */
function dayOffset(days: number) {
  const date = new Date();

  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

type ScanBody = {
  leadDays: number;
  renewalHorizon: string;
  scanned: number;
  raised: { subscriptionId: string; provider: string; kind: string; dueOn: string }[];
  skipped: { subscriptionId: string; kind: string; reason: string }[];
};

async function scan() {
  const response = await scanRoute();

  return { status: response.status, body: (await response.json()) as ScanBody };
}

async function list(search = "?state=pending") {
  const response = await listRoute(new Request(`http://localhost/api/reminders${search}`));

  return {
    status: response.status,
    body: (await response.json()) as { items?: ReminderView[] },
  };
}

async function dismiss(id: string) {
  const response = await dismissRoute(
    new Request(`http://localhost/api/reminders/${id}/dismiss`, { method: "POST" }),
    { params: Promise.resolve({ id }) },
  );

  return {
    status: response.status,
    body: (await response.json()) as { error?: string; reminder?: ReminderView },
  };
}

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.runIf(hasDatabase)("reminder API", () => {
  let client: Client;
  let db: NodePgDatabase<typeof schema>;

  async function notion() {
    const [row] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, SEED_SUBSCRIPTION_IDS.notion));

    return row;
  }

  function providers(items: ReminderView[] = []) {
    return items.map((item) => item.subscriptionProvider);
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
        next_renewal: dayOffset(2),
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

  it("refuses to run or read for a visitor who is not signed in", async () => {
    state.email = null;

    expect((await scan()).status).toBe(401);
    expect((await list()).status).toBe(401);
    expect(await db.select().from(reminders)).toHaveLength(0);

    state.email = DEFAULT_SEED_EMAIL;
  });

  it("raises the deferred terms and the renewals inside the week", async () => {
    const { status, body } = await scan();

    expect(status).toBe(200);
    expect(body.leadDays).toBe(7);
    expect(body.renewalHorizon).toBe(dayOffset(7));
    expect(body.raised).toMatchObject([
      {
        subscriptionId: SEED_SUBSCRIPTION_IDS.netflix,
        provider: "Netflix",
        kind: "upcoming_renewal",
        dueOn: dayOffset(3),
      },
      {
        subscriptionId: SEED_SUBSCRIPTION_IDS.notion,
        provider: "Notion",
        kind: "upcoming_renewal",
        dueOn: dayOffset(6),
      },
      {
        subscriptionId: SEED_SUBSCRIPTION_IDS.disneyPlus,
        provider: "Disney+",
        kind: "deferred_terms",
        dueOn: dayOffset(-2),
      },
    ]);
  });

  it("leaves every subscription exactly as trusted as it was", async () => {
    expect(await notion()).toMatchObject({
      status: "trial",
      next_renewal: dayOffset(6),
      renewal_field_status: "proposed",
      amount_field_status: "empty",
    });

    const [row] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, SEED_SUBSCRIPTION_IDS.disneyPlus));

    expect(row).toMatchObject({
      amount_field_status: "deferred",
      amount_minor: null,
      renewal_field_status: "empty",
    });
  });

  it("says the renewal is not confirmed when the ledger does not say it is", async () => {
    const { body } = await list();
    const notionReminder = body.items?.find((item) => item.subscriptionProvider === "Notion");

    expect(notionReminder?.body).toContain("proposed and stays that way until you confirm");

    const netflix = body.items?.find((item) => item.subscriptionProvider === "Netflix");

    expect(netflix?.body).toContain("the date you confirmed");
  });

  it("lists the user's pending reminders, soonest first", async () => {
    const { status, body } = await list();

    expect(status).toBe(200);
    expect(providers(body.items)).toEqual(["Disney+", "Netflix", "Notion"]);
    expect(body.items?.every((item) => item.state === "pending")).toBe(true);
  });

  it("never raises or lists another user's reminders", async () => {
    const others = await db
      .select()
      .from(reminders)
      .where(eq(reminders.user_id, SECOND_USER.id));

    expect(others).toHaveLength(0);

    state.email = SECOND_USER.email;

    expect((await list()).body.items).toEqual([]);

    state.email = DEFAULT_SEED_EMAIL;
  });

  it("does not remind twice about the same day", async () => {
    const { body } = await scan();

    expect(body.raised).toHaveLength(0);
    expect(body.skipped).toHaveLength(3);
    expect(body.skipped.every((entry) => entry.reason === "already_reminded")).toBe(true);
    expect(await db.select().from(reminders)).toHaveLength(3);
  });

  it("dismisses a reminder without touching the subscription", async () => {
    const before = await notion();
    const pending = (await list()).body.items?.find(
      (item) => item.subscriptionProvider === "Notion",
    );
    const { status, body } = await dismiss(pending!.id);

    expect(status).toBe(200);
    expect(body.reminder).toMatchObject({ state: "dismissed" });
    expect(providers((await list()).body.items)).toEqual(["Disney+", "Netflix"]);
    expect(await notion()).toMatchObject({
      next_renewal: before.next_renewal,
      renewal_field_status: before.renewal_field_status,
      amount_minor: before.amount_minor,
      amount_field_status: before.amount_field_status,
      status: before.status,
    });
  });

  it("still shows a dismissed reminder when asked for one", async () => {
    const { body } = await list("?state=dismissed");

    expect(providers(body.items)).toEqual(["Notion"]);
  });

  it("does not raise a dismissed reminder again", async () => {
    const { body } = await scan();

    expect(body.raised).toHaveLength(0);
    expect(body.skipped).toHaveLength(3);
  });

  it("refuses to dismiss a reminder twice, or one that is not yours", async () => {
    const [dismissed] = await db
      .select()
      .from(reminders)
      .where(eq(reminders.state, "dismissed"));

    expect((await dismiss(dismissed.id)).status).toBe(409);

    const [mine] = await db.select().from(reminders).where(eq(reminders.state, "pending"));

    state.email = SECOND_USER.email;

    expect((await dismiss(mine.id)).status).toBe(404);
    expect((await dismiss("not-a-uuid")).status).toBe(404);

    state.email = DEFAULT_SEED_EMAIL;

    const [unchanged] = await db.select().from(reminders).where(eq(reminders.id, mine.id));

    expect(unchanged).toMatchObject({ state: "pending", dismissed_at: null });
  });

  it("rejects a query it does not understand", async () => {
    expect((await list("?state=snoozed")).status).toBe(400);
  });

  /**
   * The other end of the loop: putting a question off is what gives the row a
   * day to be reminded on, and the reminder waits until that day arrives.
   */
  it("gives a deferred question a day to come due, and waits for it", async () => {
    const now = new Date();
    const [question] = await db
      .insert(captureQuestions)
      .values({
        user_id: SEED_USER_ID,
        subscription_id: SEED_SUBSCRIPTION_IDS.disneyPlus,
        provider_canonical: "disney",
        provider_display: "Disney+",
        reason: "renewal",
        state: "asked",
        question: "When does Disney+ renew?",
      })
      .returning();

    await deferQuestion(db, { userId: SEED_USER_ID, question, now });

    const [row] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, SEED_SUBSCRIPTION_IDS.disneyPlus));

    expect(row).toMatchObject({ renewal_field_status: "deferred", next_renewal: null });
    expect(row.deferred_until?.toISOString().slice(0, 10)).toBe(dayOffset(DEFERRAL_DAYS));

    const { body } = await scan();

    expect(body.raised).toHaveLength(0);
  });
});
