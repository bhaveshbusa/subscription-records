import { and, eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import * as schema from "@/lib/db/schema";
import { amendments, events, proposals, subscriptions, users } from "@/lib/db/schema";
import {
  createSeedData,
  DEFAULT_SEED_EMAIL,
  SEED_PROPOSAL_IDS,
  SEED_SUBSCRIPTION_IDS,
  SEED_USER_ID,
} from "@/lib/db/seed-data";

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

const { GET: listRoute } = await import("@/app/api/proposals/route");
const { POST: acceptRoute } = await import("@/app/api/proposals/[id]/accept/route");
const { POST: rejectRoute } = await import("@/app/api/proposals/[id]/reject/route");

const SECOND_USER = {
  id: "00000000-0000-4000-8000-0000000000f2",
  email: "second@example.com",
  proposalId: "00000000-0000-4000-8000-00000000f501",
};

/** Relative to the run, because the seed's dates are too. */
function dayOffset(days: number) {
  const date = new Date();

  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

const UPDATE_PROPOSAL_ID = "00000000-0000-4000-8000-00000000f502";
const REACTIVATE_PROPOSAL_ID = "00000000-0000-4000-8000-00000000f503";
const BROKEN_PROPOSAL_ID = "00000000-0000-4000-8000-00000000f504";
const CHARGED_PROPOSAL_ID = "00000000-0000-4000-8000-00000000f505";

type ListBody = { items: { id: string; kind: string; payload: unknown }[] };

async function list(search = "") {
  const response = await listRoute(new Request(`http://localhost/api/proposals${search}`));

  return { status: response.status, body: (await response.json()) as ListBody };
}

async function decide(decision: "accept" | "reject", id: string) {
  const route = decision === "accept" ? acceptRoute : rejectRoute;
  const response = await route(
    new Request(`http://localhost/api/proposals/${id}/${decision}`, { method: "POST" }),
    { params: Promise.resolve({ id }) },
  );

  return { status: response.status, body: await response.json() };
}

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.runIf(hasDatabase)("proposals API", () => {
  let client: Client;
  let db: NodePgDatabase<typeof schema>;

  async function netflixAmendments() {
    return db
      .select()
      .from(amendments)
      .where(eq(amendments.subscription_id, SEED_SUBSCRIPTION_IDS.netflix))
      .orderBy(amendments.effective_from);
  }

  async function providerRows(provider: string) {
    return db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.user_id, SEED_USER_ID),
          eq(subscriptions.provider_canonical, provider),
        ),
      );
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
      { id: SECOND_USER.id, name: "Second user", email: SECOND_USER.email },
    ]);
    await db.insert(subscriptions).values(seed.subscriptions);
    await db.insert(amendments).values(seed.amendments);
    await db.insert(proposals).values([
      ...seed.proposals,
      {
        id: SECOND_USER.proposalId,
        user_id: SECOND_USER.id,
        kind: "create",
        payload: { provider: { value: "Private Co", status: "confirmed" } },
      },
      {
        id: UPDATE_PROPOSAL_ID,
        user_id: SEED_USER_ID,
        subscription_id: SEED_SUBSCRIPTION_IDS.netflix,
        kind: "update",
        payload: {
          plan: "Premium",
          amountMinor: { value: 1799, status: "proposed", confidence: "medium" },
          nextRenewal: { value: "2026-12-01", status: "proposed" },
        },
        rationale: "A receipt suggested a price rise.",
      },
      {
        id: REACTIVATE_PROPOSAL_ID,
        user_id: SEED_USER_ID,
        subscription_id: SEED_SUBSCRIPTION_IDS.athletic,
        kind: "reactivated",
        payload: { subscriptionStatus: { value: "active", status: "proposed" } },
      },
      {
        id: BROKEN_PROPOSAL_ID,
        user_id: SEED_USER_ID,
        kind: "create",
        payload: { amountMinor: { value: 300, status: "confirmed" } },
      },
      {
        id: CHARGED_PROPOSAL_ID,
        user_id: SEED_USER_ID,
        subscription_id: SEED_SUBSCRIPTION_IDS.disneyPlus,
        kind: "charged",
        payload: {
          charge: {
            paidOn: dayOffset(-3),
            amountMinor: 949,
            currency: "GBP",
            idempotencyKey: "legacy-disney-charge",
          },
        },
      },
    ]);

    state.email = DEFAULT_SEED_EMAIL;
  });

  afterAll(async () => {
    await client.query("rollback");
    await client.end();
  });

  it("lists only the signed-in user's pending proposals", async () => {
    const { status, body } = await list();

    expect(status).toBe(200);
    expect(body.items.map((item) => item.id)).toEqual([
      BROKEN_PROPOSAL_ID,
      REACTIVATE_PROPOSAL_ID,
      UPDATE_PROPOSAL_ID,
      SEED_PROPOSAL_IDS.substack,
    ]);
  });

  it("reports a payload that no longer validates instead of hiding the row", async () => {
    const { body } = await list();
    const broken = body.items.find((item) => item.id === BROKEN_PROPOSAL_ID);

    expect(broken).toMatchObject({ payload: null });
    expect((await decide("accept", BROKEN_PROPOSAL_ID)).status).toBe(422);
  });

  it("starts a cancelled subscription again on the record it already had", async () => {
    const decision = await decide("accept", REACTIVATE_PROPOSAL_ID);

    expect(decision.status).toBe(200);
    expect(decision.body.subscriptionId).toBe(SEED_SUBSCRIPTION_IDS.athletic);
    expect(await providerRows("the-athletic")).toMatchObject([
      { id: SEED_SUBSCRIPTION_IDS.athletic, status: "active", ends_on: null },
    ]);

    const history = await db
      .select()
      .from(amendments)
      .where(eq(amendments.subscription_id, SEED_SUBSCRIPTION_IDS.athletic))
      .orderBy(amendments.effective_from);
    const logged = await db
      .select()
      .from(events)
      .where(
        and(
          eq(events.subscription_id, SEED_SUBSCRIPTION_IDS.athletic),
          eq(events.type, "reactivated"),
        ),
      );

    expect(history).toMatchObject([
      { amount_minor: 799, effective_to: expect.any(String) },
      { amount_minor: 799, effective_to: null },
    ]);
    expect(logged).toHaveLength(1);
  });

  it("requires a session, and never touches another user's proposal", async () => {
    state.email = null;
    const anonymous = await decide("accept", SEED_PROPOSAL_IDS.substack);
    const listed = await list();

    state.email = DEFAULT_SEED_EMAIL;

    expect(anonymous.status).toBe(401);
    expect(listed.status).toBe(401);
    expect((await decide("accept", SECOND_USER.proposalId)).status).toBe(404);
    expect((await decide("accept", "not-a-uuid")).status).toBe(404);
    expect(await providerRows("private-co")).toHaveLength(0);
  });

  it("rejects an invalid list query", async () => {
    expect((await list("?state=maybe")).status).toBe(400);
    expect((await list("?limit=500")).status).toBe(400);
  });

  it("rejecting leaves the ledger untouched", async () => {
    const { status, body } = await decide("reject", UPDATE_PROPOSAL_ID);
    const [netflix] = await providerRows("netflix");

    expect(status).toBe(200);
    expect(body.proposal).toMatchObject({ state: "rejected" });
    expect(netflix).toMatchObject({ plan: "Standard", amount_minor: 1599 });
    expect((await decide("reject", UPDATE_PROPOSAL_ID)).status).toBe(409);
    expect((await decide("accept", UPDATE_PROPOSAL_ID)).status).toBe(409);
  });

  it("accepting a create writes the subscription with proposed terms", async () => {
    const { status, body } = await decide("accept", SEED_PROPOSAL_IDS.substack);
    const [created] = await providerRows("substack");

    expect(status).toBe(200);
    expect(body).toMatchObject({
      proposal: { state: "accepted" },
      subscriptionId: created.id,
      conflicts: [],
    });
    expect(created).toMatchObject({
      provider_display: "Substack",
      amount_minor: 500,
      amount_field_status: "proposed",
      cadence_field_status: "proposed",
      renewal_field_status: "proposed",
      status_field_status: "proposed",
      provider_field_status: "confirmed",
    });

    const openAmendments = await db
      .select()
      .from(amendments)
      .where(eq(amendments.subscription_id, created.id));

    expect(openAmendments).toMatchObject([{ amount_minor: 500, effective_to: null }]);
  });

  it("accepting a leftover charged card writes terms, not a payment", async () => {
    const { status, body } = await decide("accept", CHARGED_PROPOSAL_ID);
    const [disney] = await providerRows("disney-plus");
    const chargedEvents = await db
      .select()
      .from(events)
      .where(
        and(
          eq(events.subscription_id, SEED_SUBSCRIPTION_IDS.disneyPlus),
          eq(events.type, "charged"),
        ),
      );

    expect(status).toBe(200);
    expect(body).toMatchObject({
      proposal: { state: "accepted", kind: "charged" },
      subscriptionId: SEED_SUBSCRIPTION_IDS.disneyPlus,
    });
    expect(disney).toMatchObject({
      amount_minor: 949,
      amount_field_status: "proposed",
    });
    expect(chargedEvents).toHaveLength(0);
  });

  it("does not create a second row when the same proposal is accepted twice", async () => {
    expect((await decide("accept", SEED_PROPOSAL_IDS.substack)).status).toBe(409);
    expect(await providerRows("substack")).toHaveLength(1);
  });

  it("accepting an update keeps confirmed fields and flags the conflict", async () => {
    const id = "00000000-0000-4000-8000-00000000f505";

    await db.insert(proposals).values({
      id,
      user_id: SEED_USER_ID,
      subscription_id: SEED_SUBSCRIPTION_IDS.netflix,
      kind: "update",
      payload: {
        plan: "Premium",
        amountMinor: { value: 1799, status: "proposed", confidence: "medium" },
      },
    });

    const { body } = await decide("accept", id);
    const [netflix] = await providerRows("netflix");

    expect(body.conflicts).toEqual(["amount"]);
    expect(netflix).toMatchObject({
      plan: "Premium",
      amount_minor: 1599,
      amount_field_status: "conflicted",
    });
  });

  it("rejecting a price rise leaves the recorded price alone", async () => {
    const id = "00000000-0000-4000-8000-00000000f506";

    await db.insert(proposals).values({
      id,
      user_id: SEED_USER_ID,
      subscription_id: SEED_SUBSCRIPTION_IDS.netflix,
      kind: "terms_changed",
      payload: { amountMinor: { value: 1899, status: "proposed" } },
    });

    const { status } = await decide("reject", id);
    const [netflix] = await providerRows("netflix");

    expect(status).toBe(200);
    expect(netflix).toMatchObject({ amount_minor: 1599 });
    expect(await netflixAmendments()).toMatchObject([
      { amount_minor: 1599, effective_to: null },
    ]);
  });

  it("accepting a cancellation keeps the row and its identity, and ends the terms", async () => {
    const id = "00000000-0000-4000-8000-00000000f508";
    const [before] = await providerRows("spotify");

    await db.insert(proposals).values({
      id,
      user_id: SEED_USER_ID,
      subscription_id: SEED_SUBSCRIPTION_IDS.spotify,
      kind: "cancelled",
      payload: { subscriptionStatus: { value: "cancelled", status: "proposed" } },
    });

    const { status, body } = await decide("accept", id);
    const rows = await providerRows("spotify");
    const [after] = rows;

    expect(status).toBe(200);
    expect(body).toMatchObject({
      subscriptionId: before.id,
      lifecycle: { status: "cancelled", stillBilling: false },
    });
    expect(rows).toHaveLength(1);
    expect(after).toMatchObject({
      id: before.id,
      provider_canonical: "spotify",
      status: "cancelled",
      next_renewal: null,
    });
    expect(after.ends_on).not.toBeNull();

    const logged = await db
      .select()
      .from(events)
      .where(
        and(
          eq(events.subscription_id, before.id),
          eq(events.type, "cancelled"),
        ),
      );

    expect(logged).toHaveLength(1);

    const history = await db
      .select()
      .from(amendments)
      .where(eq(amendments.subscription_id, before.id));

    expect(history.every((amendment) => amendment.effective_to !== null)).toBe(true);
    expect((await decide("accept", id)).status).toBe(409);

    const again = await db
      .select()
      .from(events)
      .where(and(eq(events.subscription_id, before.id), eq(events.type, "cancelled")));

    expect(again).toHaveLength(1);
  });

  it("accepting a period-end cancellation keeps it billing until the end date", async () => {
    const id = "00000000-0000-4000-8000-00000000f509";
    const endsOn = dayOffset(20);

    await db.insert(proposals).values({
      id,
      user_id: SEED_USER_ID,
      subscription_id: SEED_SUBSCRIPTION_IDS.netflix,
      kind: "cancel_scheduled",
      payload: {
        subscriptionStatus: { value: "cancel_scheduled", status: "proposed" },
        endsOn,
      },
    });

    const { status, body } = await decide("accept", id);
    const [netflix] = await providerRows("netflix");

    expect(status).toBe(200);
    expect(body).toMatchObject({
      lifecycle: { status: "cancel_scheduled", stillBilling: true, endsOn },
    });
    expect(netflix).toMatchObject({
      status: "cancel_scheduled",
      ends_on: endsOn,
      status_field_status: "confirmed",
    });
    expect(netflix.next_renewal).not.toBeNull();
    expect(await netflixAmendments()).toMatchObject([{ effective_to: null }]);
  });

  it("accepting a price rise opens a new amendment and keeps the old one", async () => {
    const id = "00000000-0000-4000-8000-00000000f507";
    const effectiveFrom = dayOffset(-30);
    const closedOn = dayOffset(-31);

    await db.insert(proposals).values({
      id,
      user_id: SEED_USER_ID,
      subscription_id: SEED_SUBSCRIPTION_IDS.netflix,
      kind: "terms_changed",
      payload: {
        effectiveFrom,
        amountMinor: { value: 1899, status: "proposed" },
      },
    });

    const { status, body } = await decide("accept", id);
    const [netflix] = await providerRows("netflix");
    const history = await netflixAmendments();

    expect(status).toBe(200);
    expect(body.termsChange).toMatchObject({ effectiveFrom });
    expect(netflix).toMatchObject({ amount_minor: 1899 });
    expect(history).toMatchObject([
      { amount_minor: 1599, effective_to: closedOn },
      { amount_minor: 1899, effective_from: effectiveFrom, effective_to: null },
    ]);

    const logged = await db
      .select()
      .from(events)
      .where(
        and(
          eq(events.subscription_id, SEED_SUBSCRIPTION_IDS.netflix),
          eq(events.type, "terms_changed"),
        ),
      );

    expect(logged).toHaveLength(1);
  });
});
