import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import * as schema from "@/lib/db/schema";
import { amendments, events, subscriptions, users } from "@/lib/db/schema";
import { createSeedData, DEFAULT_SEED_EMAIL, SEED_USER_ID } from "@/lib/db/seed-data";

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

const { GET: inboxRoute } = await import("@/app/api/inbox/route");

const SECOND_USER = {
  id: "00000000-0000-4000-8000-0000000000f4",
  email: "other-inbox@example.com",
  subscriptionId: "00000000-0000-4000-8000-00000000f701",
  amendmentId: "00000000-0000-4000-8000-00000000f702",
};

/** Relative to the run, because the seed's dates are too. */
function dayOffset(days: number) {
  const date = new Date();

  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

type Section = { id: string; provider: { value: string }; nextRenewal: { value: string | null } }[];
type InboxBody = { overdue: Section; unfinished: Section; renewingSoon: Section };

async function inbox() {
  const response = await inboxRoute();

  return { status: response.status, body: (await response.json()) as InboxBody };
}

function providers(section: Section) {
  return section.map((item) => item.provider.value);
}

/** Boundary rows, so each window is tested on both sides of its edge. */
const FIXTURES = [
  { key: "yearly-in", provider: "Yearly At Thirty", cadence: "yearly", days: 30 },
  { key: "yearly-out", provider: "Yearly At ThirtyOne", cadence: "yearly", days: 31 },
  { key: "monthly-in", provider: "Monthly At Seven", cadence: "monthly", days: 7 },
  { key: "monthly-out", provider: "Monthly At Eight", cadence: "monthly", days: 8 },
  { key: "weekly-soon", provider: "Weekly Tomorrow", cadence: "weekly", days: 1 },
] as const;

const FIXTURE_IDS: Record<(typeof FIXTURES)[number]["key"], string> = {
  "yearly-in": "00000000-0000-4000-8000-00000000f711",
  "yearly-out": "00000000-0000-4000-8000-00000000f712",
  "monthly-in": "00000000-0000-4000-8000-00000000f713",
  "monthly-out": "00000000-0000-4000-8000-00000000f714",
  "weekly-soon": "00000000-0000-4000-8000-00000000f715",
};

/** Overdue *and* conflicted, to prove a row is listed in both sections. */
const BOTH_ID = "00000000-0000-4000-8000-00000000f716";
/** Cancelled with a past date: over, so never overdue. */
const CANCELLED_ID = "00000000-0000-4000-8000-00000000f717";

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.runIf(hasDatabase)("inbox API", () => {
  let client: Client;
  let db: NodePgDatabase<typeof schema>;

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
      ...FIXTURES.map((fixture) => ({
        id: FIXTURE_IDS[fixture.key],
        user_id: SEED_USER_ID,
        provider_canonical: fixture.key,
        provider_display: fixture.provider,
        status: "active" as const,
        currency: "GBP",
        cadence: fixture.cadence,
        amount_minor: 1000,
        next_renewal: dayOffset(fixture.days),
        ...confirmed,
      })),
      {
        id: BOTH_ID,
        user_id: SEED_USER_ID,
        provider_canonical: "both-sections",
        provider_display: "Both Sections",
        status: "active" as const,
        currency: "GBP",
        cadence: "monthly" as const,
        amount_minor: 500,
        next_renewal: dayOffset(-9),
        ...confirmed,
        amount_field_status: "conflicted" as const,
      },
      {
        id: CANCELLED_ID,
        user_id: SEED_USER_ID,
        provider_canonical: "long-gone",
        provider_display: "Long Gone",
        status: "cancelled" as const,
        currency: "GBP",
        cadence: "monthly" as const,
        amount_minor: 700,
        next_renewal: dayOffset(-60),
        ...confirmed,
      },
      {
        id: SECOND_USER.subscriptionId,
        user_id: SECOND_USER.id,
        provider_canonical: "someone-elses",
        provider_display: "Someone Elses",
        status: "active" as const,
        currency: "GBP",
        cadence: "monthly" as const,
        amount_minor: 1200,
        next_renewal: dayOffset(-40),
        ...confirmed,
      },
    ]);
    await db.insert(amendments).values(seed.amendments);

    state.email = DEFAULT_SEED_EMAIL;
  });

  afterAll(async () => {
    await client.query("rollback");
    await client.end();
  });

  it("refuses a visitor who is not signed in", async () => {
    state.email = null;

    expect((await inbox()).status).toBe(401);

    state.email = DEFAULT_SEED_EMAIL;
  });

  it("lists a holding row whose stored due date has passed, as stored", async () => {
    const { status, body } = await inbox();

    expect(status).toBe(200);
    expect(providers(body.overdue)).toContain("Headspace");
    expect(providers(body.overdue)).toContain("Calm");
    expect(providers(body.overdue)).not.toContain("Cursor");
    expect(body.overdue.every((item) => (item.nextRenewal.value ?? "") < dayOffset(0))).toBe(
      true,
    );
  });

  it("does not call a cancelled row overdue, however old its date", async () => {
    const { body } = await inbox();

    expect(providers(body.overdue)).not.toContain("Long Gone");
  });

  it("lists unknown rows and terms that conflict or came due", async () => {
    const { body } = await inbox();

    /** Disney+ is `unknown` and has a deferral whose day has arrived. */
    expect(providers(body.unfinished)).toContain("Disney+");
    expect(providers(body.unfinished)).toContain("Both Sections");
    expect(providers(body.unfinished)).not.toContain("Netflix");
  });

  it("keeps a row that is both overdue and unfinished in both sections", async () => {
    const { body } = await inbox();

    expect(providers(body.overdue)).toContain("Both Sections");
    expect(providers(body.unfinished)).toContain("Both Sections");
  });

  it("takes yearly renewals up to thirty days out, and no further", async () => {
    const { body } = await inbox();

    expect(providers(body.renewingSoon)).toContain("Yearly At Thirty");
    expect(providers(body.renewingSoon)).not.toContain("Yearly At ThirtyOne");
    /** The seed's own yearly row, comfortably inside the window. */
    expect(providers(body.renewingSoon)).toContain("The Guardian");
  });

  it("takes monthly renewals up to seven days out, and no further", async () => {
    const { body } = await inbox();

    expect(providers(body.renewingSoon)).toContain("Monthly At Seven");
    expect(providers(body.renewingSoon)).not.toContain("Monthly At Eight");
  });

  it("never puts a weekly renewal in renewing soon", async () => {
    const { body } = await inbox();

    expect(providers(body.renewingSoon)).not.toContain("Weekly Tomorrow");
    expect(providers(body.renewingSoon)).not.toContain("Oddbox");
  });

  it("leaves a past date to overdue rather than calling it soon", async () => {
    const { body } = await inbox();

    expect(providers(body.renewingSoon)).not.toContain("Headspace");
    expect(providers(body.renewingSoon)).not.toContain("Cursor");
    expect(body.renewingSoon.every((item) => (item.nextRenewal.value ?? "") >= dayOffset(0))).toBe(
      true,
    );
  });

  it("only glances at what is still billing", async () => {
    const { body } = await inbox();

    /** 1Password is yearly inside the window, but it is cancel-scheduled. */
    expect(providers(body.renewingSoon)).not.toContain("1Password");
  });

  it("orders every section by date, soonest first", async () => {
    const { body } = await inbox();

    for (const section of [body.overdue, body.unfinished, body.renewingSoon]) {
      const dated = section
        .map((item) => item.nextRenewal.value)
        .filter((value): value is string => value !== null);

      expect(dated).toEqual([...dated].sort());
    }
  });

  it("never shows another user's rows", async () => {
    state.email = SECOND_USER.email;
    const { body } = await inbox();
    state.email = DEFAULT_SEED_EMAIL;

    expect(providers(body.overdue)).toEqual(["Someone Elses"]);
    expect(body.unfinished).toEqual([]);
    expect(body.renewingSoon).toEqual([]);
  });

  it("writes nothing: the ledger is identical after a read", async () => {
    const before = await db.select().from(subscriptions).orderBy(subscriptions.id);
    const beforeAmendments = await db.select().from(amendments).orderBy(amendments.id);
    const beforeEvents = await db.select().from(events).orderBy(events.id);

    await inbox();

    expect(await db.select().from(subscriptions).orderBy(subscriptions.id)).toEqual(before);
    expect(await db.select().from(amendments).orderBy(amendments.id)).toEqual(beforeAmendments);
    expect(await db.select().from(events).orderBy(events.id)).toEqual(beforeEvents);
  });
});
