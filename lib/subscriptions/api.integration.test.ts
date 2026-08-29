import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import * as schema from "@/lib/db/schema";
import { amendments, charges, events, subscriptions, users } from "@/lib/db/schema";
import { createSeedData, DEFAULT_SEED_EMAIL, SEED_SUBSCRIPTION_IDS } from "@/lib/db/seed-data";

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

const { GET: listRoute } = await import("@/app/api/subscriptions/route");
const { GET: summaryRoute } = await import("@/app/api/subscriptions/summary/route");
const { GET: detailRoute } = await import("@/app/api/subscriptions/[id]/route");

const SECOND_USER = {
  id: "00000000-0000-4000-8000-0000000000f2",
  email: "second@example.com",
  subscriptionId: "00000000-0000-4000-8000-00000000f101",
};

type ListBody = {
  items: {
    id: string;
    provider: { value: string };
    status: { value: string };
    nextRenewal: { value: string | null };
    monthlyEquivalentMinor: number | null;
  }[];
  nextCursor: string | null;
};

async function list(search = "") {
  const response = await listRoute(
    new Request(`http://localhost/api/subscriptions${search}`),
  );

  return { status: response.status, body: (await response.json()) as ListBody };
}

async function detail(id: string) {
  const response = await detailRoute(new Request(`http://localhost/api/subscriptions/${id}`), {
    params: Promise.resolve({ id }),
  });

  return { status: response.status, body: await response.json() };
}

async function summary() {
  const response = await summaryRoute();

  return { status: response.status, body: await response.json() };
}

function providers(body: ListBody) {
  return body.items.map((item) => item.provider.value);
}

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.runIf(hasDatabase)("subscriptions API", () => {
  let client: Client;
  let db: NodePgDatabase<typeof schema>;

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await client.query("begin");
    db = drizzle(client, { schema });
    state.db = db;

    const seed = createSeedData(new Date());

    await db.insert(users).values([
      seed.user,
      { id: SECOND_USER.id, name: "Second user", email: SECOND_USER.email },
    ]);
    await db.insert(subscriptions).values([
      ...seed.subscriptions,
      {
        id: SECOND_USER.subscriptionId,
        user_id: SECOND_USER.id,
        provider_canonical: "netflix",
        provider_display: "Netflix",
        plan: "Premium",
        status: "active",
        amount_minor: 1799,
        currency: "GBP",
        cadence: "monthly",
        next_renewal: null,
        provider_field_status: "confirmed",
        amount_field_status: "confirmed",
        cadence_field_status: "confirmed",
        renewal_field_status: "empty",
        status_field_status: "confirmed",
      },
    ]);
    await db.insert(amendments).values(seed.amendments);
    await db.insert(events).values(seed.events);
    await db.insert(charges).values(seed.charges);

    state.email = DEFAULT_SEED_EMAIL;
  });

  afterAll(async () => {
    await client.query("rollback");
    await client.end();
  });

  it("searches provider text", async () => {
    const { body } = await list("?q=net");

    expect(providers(body)).toEqual(["Netflix"]);
    expect(providers(body)).not.toContain("Spotify");
  });

  it("matches plan and canonical name too, case-insensitively", async () => {
    expect(providers((await list("?q=CREATIVE")).body)).toEqual(["Adobe"]);
    expect(providers((await list("?q=the-athletic&status=cancelled")).body)).toEqual([
      "The Athletic",
    ]);
  });

  it("treats wildcards in the search text as literals", async () => {
    expect((await list("?q=%25")).body.items).toHaveLength(0);
  });

  it("filters by status and excludes cancelled rows from active", async () => {
    const { body } = await list("?status=active&limit=100");

    expect(body.items.every((item) => item.status.value === "active")).toBe(true);
    expect(providers(body)).not.toContain("The Athletic");
  });

  it("filters by renewal window", async () => {
    const soon = providers((await list("?renewingWithinDays=7&limit=100")).body);

    expect(soon).toContain("Netflix");
    expect(soon).not.toContain("Spotify");
    expect(soon).not.toContain("Disney+");

    expect(providers((await list("?renewingWithinDays=30&limit=100")).body)).toContain(
      "Spotify",
    );
  });

  it("sorts by next renewal with unknown renewals last", async () => {
    const { body } = await list("?sort=nextRenewal&order=asc&limit=100");
    const renewals = body.items.map((item) => item.nextRenewal.value);
    const firstNull = renewals.indexOf(null);

    expect(renewals[0]).not.toBeNull();
    expect(renewals.slice(firstNull).every((value) => value === null)).toBe(true);
  });

  it("sorts by monthly equivalent", async () => {
    const { body } = await list("?sort=monthlyEquivalent&order=desc&limit=100");

    expect(body.items[0].provider.value).toBe("Adobe");
  });

  it("paginates with an opaque cursor without repeating rows", async () => {
    const seen: string[] = [];
    let cursor: string | null = null;

    for (let page = 0; page < 10; page += 1) {
      const search: string = `?sort=provider&limit=3${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const { body } = await list(search);

      expect(body.items.length).toBeLessThanOrEqual(3);
      seen.push(...body.items.map((item) => item.id));
      cursor = body.nextCursor;

      if (!cursor) {
        break;
      }
    }

    expect(cursor).toBeNull();
    expect(seen).toHaveLength(11);
    expect(new Set(seen).size).toBe(11);
  });

  it("rejects a cursor from a different query", async () => {
    const { body } = await list("?sort=provider&limit=3");
    const response = await list(
      `?sort=updatedAt&limit=3&cursor=${encodeURIComponent(body.nextCursor ?? "")}`,
    );

    expect(response.status).toBe(400);
  });

  it("rejects invalid query params", async () => {
    expect((await list("?limit=500")).status).toBe(400);
    expect((await list("?status=retired")).status).toBe(400);
  });

  it("never returns another user's rows", async () => {
    const mine = (await list("?limit=100")).body;

    expect(mine.items.map((item) => item.id)).not.toContain(SECOND_USER.subscriptionId);

    state.email = SECOND_USER.email;
    const theirs = (await list("?limit=100")).body;
    state.email = DEFAULT_SEED_EMAIL;

    expect(theirs.items.map((item) => item.id)).toEqual([SECOND_USER.subscriptionId]);
  });

  it("returns detail with amendments, events and charges", async () => {
    const { status, body } = await detail(SEED_SUBSCRIPTION_IDS.netflix);

    expect(status).toBe(200);
    expect(body.provider.value).toBe("Netflix");
    expect(body.amendments).toHaveLength(1);
    expect(body.events).toHaveLength(1);
    expect(body.charges).toHaveLength(1);
  });

  it("404s on another user's subscription, a missing id and a malformed id", async () => {
    expect((await detail(SECOND_USER.subscriptionId)).status).toBe(404);
    expect((await detail("00000000-0000-4000-8000-000000009999")).status).toBe(404);
    expect((await detail("not-a-uuid")).status).toBe(404);
  });

  it("summarises the ledger using the documented cadence rules", async () => {
    const { body } = await summary();

    expect(body).toMatchObject({
      activeCount: 7,
      trialCount: 1,
      needsAttentionCount: 1,
      currency: "GBP",
      // 1599 + 1199 + 299 + 1800 + 2000 + round(9600/12) + 5999 + round(3599/12)
      monthlyEquivalentMinor: 13996,
    });
    expect(body.nextRenewal.provider).toBe("Netflix");
  });

  it("scopes the summary to the signed-in user", async () => {
    state.email = SECOND_USER.email;
    const { body } = await summary();
    state.email = DEFAULT_SEED_EMAIL;

    expect(body).toMatchObject({
      activeCount: 1,
      monthlyEquivalentMinor: 1799,
      nextRenewal: null,
    });
  });

  it("returns an empty ledger for a signed-in email with no user row", async () => {
    state.email = "ghost@example.com";
    const listed = await list();
    const summarised = await summary();
    const detailed = await detail(SEED_SUBSCRIPTION_IDS.netflix);
    state.email = DEFAULT_SEED_EMAIL;

    expect(listed.status).toBe(200);
    expect(listed.body.items).toEqual([]);
    expect(summarised.body).toMatchObject({ activeCount: 0, monthlyEquivalentMinor: 0 });
    expect(detailed.status).toBe(404);
  });

  it("requires a session", async () => {
    state.email = null;
    const listed = await list();
    const summarised = await summary();
    const detailed = await detail(SEED_SUBSCRIPTION_IDS.netflix);
    state.email = DEFAULT_SEED_EMAIL;

    expect(listed.status).toBe(401);
    expect(summarised.status).toBe(401);
    expect(detailed.status).toBe(401);
  });
});
