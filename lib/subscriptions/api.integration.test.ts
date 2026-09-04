import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import * as schema from "@/lib/db/schema";
import { amendments, events, subscriptions, users } from "@/lib/db/schema";
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

const { GET: listRoute, POST: createRoute } = await import("@/app/api/subscriptions/route");
const { GET: summaryRoute } = await import("@/app/api/subscriptions/summary/route");
const { GET: detailRoute, PATCH: updateRoute } = await import(
  "@/app/api/subscriptions/[id]/route"
);

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

async function create(body: unknown) {
  const response = await createRoute(
    new Request("http://localhost/api/subscriptions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

  return { status: response.status, body: await response.json() };
}

async function patch(id: string, body: unknown) {
  const response = await updateRoute(
    new Request(`http://localhost/api/subscriptions/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );

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

  it("keeps a period-end cancellation among the active rows, with its end date", async () => {
    const active = (await list("?status=active,trial,cancel_scheduled&limit=100")).body;
    const scheduled = active.items.find((item) => item.provider.value === "1Password");

    expect(scheduled).toMatchObject({
      status: { value: "cancel_scheduled" },
      endsOn: expect.any(String),
    });
    expect(providers(active)).not.toContain("The Athletic");
  });

  it("still lists a cancelled row when no status is asked for", async () => {
    expect(providers((await list("?limit=100")).body)).toContain("The Athletic");
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

  it("filters to the needs-attention rows, matching the summary count", async () => {
    const flagged = (await list("?needsAttention=true&limit=100")).body;
    const rest = (await list("?needsAttention=false&limit=100")).body;
    const summarised = await summary();

    expect(flagged.items).toHaveLength(summarised.body.needsAttentionCount);
    expect(providers(flagged)).toEqual(["Headspace", "Disney+"]);
    expect(providers(rest)).not.toContain("Disney+");
    expect(providers(rest)).not.toContain("Headspace");
    expect(flagged.items.length + rest.items.length).toBe(12);
  });

  it("combines the needs-attention filter with search", async () => {
    expect(providers((await list("?needsAttention=true&q=net")).body)).toEqual([]);
    expect(providers((await list("?needsAttention=true&q=disney")).body)).toEqual(["Disney+"]);
  });

  it("sorts by next renewal with unknown renewals last", async () => {
    const { body } = await list("?sort=nextRenewal&order=asc&limit=100");
    const renewals = body.items.map((item) => item.nextRenewal.value);
    const firstNull = renewals.indexOf(null);

    expect(renewals[0]).not.toBeNull();
    expect(renewals.slice(firstNull).every((value) => value === null)).toBe(true);
  });

  it("sorts by next renewal descending with unknown renewals still last", async () => {
    const { body } = await list("?sort=nextRenewal&order=desc&limit=100");
    const renewals = body.items.map((item) => item.nextRenewal.value);

    expect(renewals[0]).not.toBeNull();
    expect(renewals.at(-1)).toBeNull();
  });

  it("sorts by monthly equivalent", async () => {
    const { body } = await list("?sort=monthlyEquivalent&order=desc&limit=100");

    expect(body.items[0].provider.value).toBe("Adobe");
  });

  it("reverses provider and updated-time sorts with order", async () => {
    const providersAsc = providers((await list("?sort=provider&order=asc&limit=100")).body);
    const providersDesc = providers((await list("?sort=provider&order=desc&limit=100")).body);
    const updatedAsc = (await list("?sort=updatedAt&order=asc&limit=100")).body;
    const updatedDesc = (await list("?sort=updatedAt&order=desc&limit=100")).body;

    expect(providersAsc).toHaveLength(12);
    expect(providersDesc).toEqual([...providersAsc].reverse());
    expect(updatedDesc.items.map((item) => item.id)).toEqual(
      updatedAsc.items.map((item) => item.id).reverse(),
    );
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
    expect(seen).toHaveLength(12);
    expect(new Set(seen).size).toBe(12);
  });

  it("pages the ledger at the UI page size of 5", async () => {
    const pages: string[][] = [];
    let cursor: string | null = null;

    do {
      const search: string = `?limit=5${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const { body }: { body: ListBody } = await list(search);

      pages.push(body.items.map((item) => item.id));
      cursor = body.nextCursor;
    } while (cursor);

    expect(pages.map((page) => page.length)).toEqual([5, 5, 2]);
    expect(new Set(pages.flat()).size).toBe(12);
  });

  it("rejects a cursor issued before the needs-attention filter changed", async () => {
    const { body } = await list("?limit=5");
    const response = await list(
      `?needsAttention=false&limit=5&cursor=${encodeURIComponent(body.nextCursor ?? "")}`,
    );

    expect(response.status).toBe(400);
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

  it("returns detail with amendments and events", async () => {
    const { status, body } = await detail(SEED_SUBSCRIPTION_IDS.netflix);

    expect(status).toBe(200);
    expect(body.provider.value).toBe("Netflix");
    expect(body.amendments).toHaveLength(1);
    expect(body.events).toHaveLength(1);
    expect(body).not.toHaveProperty("charges");
  });

  it("404s on another user's subscription, a missing id and a malformed id", async () => {
    expect((await detail(SECOND_USER.subscriptionId)).status).toBe(404);
    expect((await detail("00000000-0000-4000-8000-000000009999")).status).toBe(404);
    expect((await detail("not-a-uuid")).status).toBe(404);
  });

  it("summarises the ledger using the documented cadence rules", async () => {
    const { body } = await summary();

    expect(body).toMatchObject({
      activeCount: 8,
      trialCount: 1,
      needsAttentionCount: 2,
      currency: "GBP",
      // 1599 + 1199 + 299 + 1800 + 2000 + round(9600/12) + 5999 + 999 + round(3599/12)
      monthlyEquivalentMinor: 14995,
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

  /** These add rows, so they run after the tests that count the ledger. */
  describe("manual writes", () => {
    it("saves a provider-only record and lists it", async () => {
      const { status, body } = await create({ provider: "TestCo" });

      expect(status).toBe(201);
      expect(body).toMatchObject({
        provider: { value: "TestCo", status: "confirmed" },
        amount: { value: null, status: "empty" },
        cadence: { value: null, status: "empty" },
        nextRenewal: { value: null, status: "empty" },
        amendments: [],
      });
      expect(providers((await list("?q=testco")).body)).toEqual(["TestCo"]);
    });

    it("confirms an amount and cadence set on the edit form", async () => {
      const created = await create({ provider: "EditCo" });
      const { status, body } = await patch(created.body.id, {
        amountMinor: 999,
        cadence: "monthly",
        nextRenewal: "2026-09-12",
      });

      expect(status).toBe(200);
      expect(body).toMatchObject({
        amount: { value: { minor: 999, currency: "GBP" }, status: "confirmed" },
        cadence: { value: "monthly", status: "confirmed" },
        nextRenewal: { value: "2026-09-12", status: "confirmed" },
        monthlyEquivalentMinor: 999,
      });
      expect((await detail(created.body.id)).body.amount.status).toBe("confirmed");
    });

    it("confirms the terms typed on the create form", async () => {
      const { body } = await create({
        provider: "PriceyCo",
        status: "active",
        amountMinor: 9600,
        cadence: "yearly",
      });

      expect(body).toMatchObject({
        amount: { value: { minor: 9600 }, status: "confirmed", confidence: "high" },
        cadence: { value: "yearly", status: "confirmed" },
        status: { value: "active", status: "confirmed" },
      });
      expect(body.amendments).toHaveLength(1);
    });

    it("empties a term the user clears", async () => {
      const created = await create({ provider: "ClearCo", amountMinor: 500, cadence: "weekly" });
      const { body } = await patch(created.body.id, { amountMinor: null });

      expect(body).toMatchObject({
        amount: { value: null, status: "empty", confidence: null },
        cadence: { value: "weekly", status: "confirmed" },
      });
    });

    it("leaves fields absent from the request untouched", async () => {
      const created = await create({ provider: "PartialCo", amountMinor: 500, cadence: "monthly" });
      const { body } = await patch(created.body.id, { plan: "Family" });

      expect(body).toMatchObject({
        plan: { value: "Family" },
        amount: { value: { minor: 500 }, status: "confirmed" },
        cadence: { value: "monthly", status: "confirmed" },
      });
    });

    it("rejects an invalid body", async () => {
      expect((await create({})).status).toBe(400);
      expect((await create({ provider: "TestCo", cadence: "daily" })).status).toBe(400);
      expect((await create({ provider: "TestCo", amountMinor: 9.99 })).status).toBe(400);
      expect((await patch(SEED_SUBSCRIPTION_IDS.netflix, {})).status).toBe(400);
      expect(
        (await patch(SEED_SUBSCRIPTION_IDS.netflix, { nextRenewal: "2026-02-30" })).status,
      ).toBe(400);
    });

    it("cannot edit another user's record, a missing id or a malformed id", async () => {
      expect((await patch(SECOND_USER.subscriptionId, { amountMinor: 1 })).status).toBe(404);
      expect(
        (await patch("00000000-0000-4000-8000-000000009999", { amountMinor: 1 })).status,
      ).toBe(404);
      expect((await patch("not-a-uuid", { amountMinor: 1 })).status).toBe(404);

      state.email = SECOND_USER.email;
      const theirs = await detail(SECOND_USER.subscriptionId);
      state.email = DEFAULT_SEED_EMAIL;

      expect(theirs.body.amount.value.minor).toBe(1799);
    });

    it("requires a session, and a user row, to write", async () => {
      state.email = null;
      const anonymousCreate = await create({ provider: "NopeCo" });
      const anonymousPatch = await patch(SEED_SUBSCRIPTION_IDS.netflix, { amountMinor: 1 });

      state.email = "ghost@example.com";
      const ghostCreate = await create({ provider: "NopeCo" });
      const ghostPatch = await patch(SEED_SUBSCRIPTION_IDS.netflix, { amountMinor: 1 });
      state.email = DEFAULT_SEED_EMAIL;

      expect(anonymousCreate.status).toBe(401);
      expect(anonymousPatch.status).toBe(401);
      expect(ghostCreate.status).toBe(403);
      expect(ghostPatch.status).toBe(404);
      expect(providers((await list("?q=nopeco")).body)).toEqual([]);
    });
  });
});
