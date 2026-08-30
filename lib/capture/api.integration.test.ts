import { and, eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import * as schema from "@/lib/db/schema";
import {
  amendments,
  captures,
  charges,
  events,
  proposals,
  subscriptions,
  users,
} from "@/lib/db/schema";
import {
  createSeedData,
  DEFAULT_SEED_EMAIL,
  SEED_SUBSCRIPTION_IDS,
  SEED_USER_ID,
} from "@/lib/db/seed-data";
import type { ProposalView } from "@/lib/proposals/projection";
import { advanceByCadence } from "@/lib/subscriptions/dates";
import { today } from "@/lib/subscriptions/query";

import type { ChatCaptureResult } from "./record";

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

const { POST: chatRoute } = await import("@/app/api/chat/route");
const { POST: acceptRoute } =
  await import("@/app/api/proposals/[id]/accept/route");
const { POST: rejectRoute } =
  await import("@/app/api/proposals/[id]/reject/route");

async function send(body: unknown) {
  const response = await chatRoute(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

  return {
    status: response.status,
    body: (await response.json()) as ChatCaptureResult,
  };
}

async function accept(id: string, confirm?: Record<string, unknown>) {
  const response = await acceptRoute(
    new Request(`http://localhost/api/proposals/${id}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(confirm ? { confirm } : {}),
    }),
    { params: Promise.resolve({ id }) },
  );

  return { status: response.status, body: await response.json() };
}

async function reject(id: string) {
  const response = await rejectRoute(
    new Request(`http://localhost/api/proposals/${id}/reject`, {
      method: "POST",
    }),
    { params: Promise.resolve({ id }) },
  );

  return { status: response.status, body: await response.json() };
}

function providers(views: ProposalView[]) {
  return views.map((view) => view.payload?.provider?.value);
}

const hasDatabase = Boolean(process.env.DATABASE_URL);

/** No key in a test run, so the labelled development fixtures do the reading. */
describe.runIf(hasDatabase)("chat capture API", () => {
  let client: Client;
  let db: NodePgDatabase<typeof schema>;

  async function ledgerRows(provider: string) {
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

  async function spotifyCharges() {
    return db
      .select()
      .from(charges)
      .where(
        and(
          eq(charges.user_id, SEED_USER_ID),
          eq(charges.subscription_id, SEED_SUBSCRIPTION_IDS.spotify),
        ),
      );
  }

  async function spotifyEvents(type: "charged") {
    return db
      .select()
      .from(events)
      .where(
        and(
          eq(events.user_id, SEED_USER_ID),
          eq(events.subscription_id, SEED_SUBSCRIPTION_IDS.spotify),
          eq(events.type, type),
        ),
      );
  }

  beforeAll(async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await client.query("begin");
    db = drizzle(client, { schema });

    /** The file shares one connection, so a route transaction reuses it. */
    state.db = new Proxy(db, {
      get(target, property) {
        if (property === "transaction") {
          return (run: (tx: NodePgDatabase<typeof schema>) => unknown) =>
            run(target);
        }

        const value = Reflect.get(target, property, target);

        return typeof value === "function" ? value.bind(target) : value;
      },
    });

    const seed = createSeedData(new Date());

    await db.insert(users).values(seed.user);
    await db.insert(subscriptions).values(seed.subscriptions);
    await db.insert(amendments).values(seed.amendments);

    state.email = DEFAULT_SEED_EMAIL;
  });

  afterAll(async () => {
    await client.query("rollback");
    await client.end();
    vi.unstubAllEnvs();
  });

  it("turns one sentence into one pending proposal and stores the message", async () => {
    const { status, body } = await send({ message: "I subscribed to Linear" });
    const [capture] = await db
      .select()
      .from(captures)
      .where(eq(captures.id, body.captureId));

    expect(status).toBe(201);
    expect(providers(body.proposals)).toEqual(["Linear"]);
    expect(body.proposals[0]).toMatchObject({
      kind: "create",
      state: "pending",
    });
    expect(capture).toMatchObject({
      kind: "text",
      source: "chat",
      content: "I subscribed to Linear",
      user_id: SEED_USER_ID,
    });
    expect(await ledgerRows("linear")).toHaveLength(0);
  });

  it("turns a pasted list of four names into four proposals", async () => {
    const { status, body } = await send({
      message: "Figma\nDropbox\nDuolingo\nAudible",
    });

    expect(status).toBe(201);
    expect(providers(body.proposals)).toEqual([
      "Figma",
      "Dropbox",
      "Duolingo",
      "Audible",
    ]);
    expect(await ledgerRows("figma")).toHaveLength(0);
    expect(await ledgerRows("audible")).toHaveLength(0);
  });

  it("proposes money and dates without confirming them, and never fabricates one", async () => {
    const { body } = await send({
      message: "Substack £5 monthly renews 2026-10-01",
    });
    const [payload] = body.proposals.map((view) => view.payload);

    expect(payload).toMatchObject({
      amountMinor: { value: 500, status: "proposed" },
      cadence: { value: "monthly", status: "proposed" },
      nextRenewal: { value: "2026-10-01", status: "proposed" },
    });
    expect(payload?.provider).toMatchObject({ status: "proposed" });
  });

  it("asks at most one question, for the highest priority gap", async () => {
    const { body } = await send({
      message: "Strava\nAudible £8 monthly renews 2026-11-02",
    });

    expect(body.followUp).toMatchObject({
      reason: "amount",
      provider: "Strava",
    });
  });

  it("updates the Netflix already in the ledger instead of proposing a second one", async () => {
    const { body } = await send({
      message: "Netflix £15.99 monthly renews 2026-09-30",
    });

    expect(body.matches).toMatchObject([
      { provider: "Netflix", strength: "high" },
    ]);
    expect(body.proposals).toMatchObject([
      { kind: "update", subscriptionId: SEED_SUBSCRIPTION_IDS.netflix },
    ]);
    expect(body.proposals[0].payload?.provider).toBeUndefined();
    expect(await ledgerRows("netflix")).toHaveLength(1);
  });

  it("raises nothing when a mention repeats what the ledger already holds", async () => {
    const { body } = await send({ message: "I'm paying for Spotify" });

    expect(body.proposals).toEqual([]);
    expect(body.matches).toMatchObject([
      { provider: "Spotify", strength: "high", proposalId: null },
    ]);
    expect(await ledgerRows("spotify")).toHaveLength(1);
  });

  it("records a payment against the subscription it already has", async () => {
    const { body } = await send({ message: "paid Spotify £11.99 today" });

    expect(body.matches).toMatchObject([
      { provider: "Spotify", strength: "high", proposalKind: "charged" },
    ]);
    expect(body.proposals).toMatchObject([
      { kind: "charged", subscriptionId: SEED_SUBSCRIPTION_IDS.spotify },
    ]);

    const decision = await accept(body.proposals[0].id);

    expect(decision.body.charge).toMatchObject({ recorded: true });
    expect(await spotifyCharges()).toMatchObject([
      { amount_minor: 1199, currency: "GBP", paid_on: today() },
    ]);
    expect(await spotifyEvents("charged")).toHaveLength(1);
    expect(await ledgerRows("spotify")).toHaveLength(1);
  });

  it("does not record the same payment twice, or add a second subscription", async () => {
    const { body } = await send({ message: "paid Spotify £11.99 today" });
    const decision = await accept(body.proposals[0].id);

    expect(decision.body.charge).toMatchObject({ recorded: false });
    expect(await spotifyCharges()).toHaveLength(1);
    expect(await spotifyEvents("charged")).toHaveLength(1);
    expect(await ledgerRows("spotify")).toHaveLength(1);
  });

  it("keeps a confirmed price the payment disagrees with, and proposes the change", async () => {
    const { body } = await send({ message: "paid Spotify £10.99 today" });
    const decision = await accept(body.proposals[0].id);

    expect(decision.body.conflicts).toEqual(["amount"]);
    expect(await ledgerRows("spotify")).toMatchObject([
      { amount_minor: 1199, amount_field_status: "conflicted" },
    ]);

    const raised = await db
      .select()
      .from(proposals)
      .where(
        and(
          eq(proposals.user_id, SEED_USER_ID),
          eq(proposals.subscription_id, SEED_SUBSCRIPTION_IDS.spotify),
          eq(proposals.kind, "terms_changed"),
        ),
      );

    expect(raised).toMatchObject([
      { state: "pending", payload: { amountMinor: { value: 1099, status: "proposed" } } },
    ]);
  });

  it("infers the next renewal from the cadence rather than confirming it", async () => {
    const created = await send({ message: "I subscribed to Bandcamp" });

    await accept(created.body.proposals[0].id, {
      amountMinor: 500,
      currency: "GBP",
      cadence: "monthly",
    });

    const paid = await send({ message: "paid Bandcamp £5 today" });

    expect(paid.body.proposals).toMatchObject([{ kind: "charged" }]);

    await accept(paid.body.proposals[0].id);

    expect(await ledgerRows("bandcamp")).toMatchObject([
      {
        next_renewal: advanceByCadence(today(), "monthly"),
        renewal_field_status: "inferred",
        amount_minor: 500,
        amount_field_status: "confirmed",
      },
    ]);
  });

  it("leaves the ledger untouched when a proposal is rejected", async () => {
    const { body } = await send({ message: "I subscribed to Duolingo" });
    const decision = await reject(body.proposals[0].id);

    expect(decision.status).toBe(200);
    expect(await ledgerRows("duolingo")).toHaveLength(0);
  });

  it("keeps a quoted price unconfirmed when only the identity is accepted", async () => {
    const { body } = await send({ message: "Substack £5 monthly" });

    await accept(body.proposals[0].id);

    expect(await ledgerRows("substack")).toMatchObject([
      { amount_minor: 500, amount_field_status: "proposed" },
    ]);
  });

  it("confirms the money the person set on the card", async () => {
    const { body } = await send({ message: "I subscribed to Figma" });

    await accept(body.proposals[0].id, {
      amountMinor: 1200,
      currency: "GBP",
      cadence: "monthly",
    });

    expect(await ledgerRows("figma")).toMatchObject([
      {
        amount_minor: 1200,
        amount_field_status: "confirmed",
        cadence: "monthly",
        cadence_field_status: "confirmed",
        renewal_field_status: "empty",
      },
    ]);
  });

  it("rejects a confirmation it cannot read rather than guessing", async () => {
    const { body } = await send({ message: "I subscribed to Dropbox" });
    const decision = await accept(body.proposals[0].id, { amountMinor: -1 });

    expect(decision.status).toBe(400);
    expect(await ledgerRows("dropbox")).toHaveLength(0);
  });

  it("puts a question off instead of asking it again next turn", async () => {
    const first = await send({ message: "I subscribed to Audible" });

    expect(first.body.followUp).toMatchObject({
      reason: "amount",
      provider: "Audible",
    });

    const later = await send({ message: "I'll tell you the price later" });

    expect(later.body.deferred).toMatchObject({
      reason: "amount",
      provider: "Audible",
    });
    expect(later.body.proposals).toEqual([]);

    const next = await send({ message: "I subscribed to YouTube Premium" });

    expect(next.body.followUp).toMatchObject({
      reason: "amount",
      provider: "YouTube Premium",
    });
  });

  it("matches the same sentence typed twice about a name it has never seen", async () => {
    const first = await send({ message: "I have a subscription for ABC" });

    expect(providers(first.body.proposals)).toEqual(["ABC"]);

    await accept(first.body.proposals[0].id, {
      amountMinor: 999,
      currency: "GBP",
    });

    const second = await send({ message: "I have a subscription for ABC" });

    expect(second.body.matches).toMatchObject([
      { provider: "ABC", strength: "high" },
    ]);
    expect(second.body.proposals).toEqual([]);
    expect(await ledgerRows("abc")).toHaveLength(1);
  });

  it("labels the fixture extractor rather than passing it off as Claude", async () => {
    const { body } = await send({ message: "I subscribed to Cursor" });

    expect(body.mode).toBe("fixture");
    expect(body.notice).toMatch(/no Anthropic key/);
  });

  it("writes a ledger row only once a proposal is accepted", async () => {
    const { body } = await send({ message: "I subscribed to Todoist" });

    expect(await ledgerRows("todoist")).toHaveLength(0);

    const decision = await accept(body.proposals[0].id);

    expect(decision.status).toBe(200);
    expect(await ledgerRows("todoist")).toMatchObject([
      {
        provider_display: "Todoist",
        amount_minor: null,
        amount_field_status: "empty",
        provider_field_status: "proposed",
      },
    ]);
  });

  it("keeps a message with no subscription in it out of the inbox", async () => {
    const { status, body } = await send({ message: "hi" });

    expect(status).toBe(201);
    expect(body.proposals).toEqual([]);
    expect(body.followUp).toBeNull();
    expect(body.captureId).toBeTruthy();
  });

  it("rejects an empty or oversized message", async () => {
    expect((await send({ message: "   " })).status).toBe(400);
    expect((await send({ message: "x".repeat(4001) })).status).toBe(400);
    expect((await send({})).status).toBe(400);
  });

  it("requires a session, and writes nothing without one", async () => {
    state.email = null;
    const anonymous = await send({ message: "I subscribed to Notion" });

    state.email = DEFAULT_SEED_EMAIL;

    expect(anonymous.status).toBe(401);
    expect(
      await db
        .select()
        .from(proposals)
        .where(eq(proposals.user_id, SEED_USER_ID)),
    ).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rationale: "I subscribed to Notion" }),
      ]),
    );
  });
});
