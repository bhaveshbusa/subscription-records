import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { ConversationTurn } from "@/lib/capture/conversation";
import type { ChatCaptureResult } from "@/lib/capture/record";
import type { TargetDescriptor } from "@/lib/capture/target-fields";
import * as schema from "@/lib/db/schema";
import { captures, proposals, subscriptions, users } from "@/lib/db/schema";
import type { InboxQuestion } from "@/lib/inbox/query";

import { jsonRequest, journeyId, journeyUser, shareConnection, type Db } from "../journeys/harness";

/**
 * SUB-61: the composer is about one thing at a time — all subscriptions, one
 * holding, one pending card, or one exact question — and the server owns what
 * each id means. A terse reply lands on the selected record, a foreign or
 * decided id is refused, the same turn sent twice is one turn, and what was
 * said about a record can be read back after a reload.
 */

const USER = journeyUser(0x61, "conversation");
const OTHER = journeyUser(0x62, "conversation-other");

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
const { POST: acceptRoute } = await import("@/app/api/proposals/[id]/accept/route");
const { GET: inboxRoute } = await import("@/app/api/inbox/route");
const { GET: conversationRoute } = await import("@/app/api/conversation/route");

type ChatResponse = ChatCaptureResult & {
  error?: string;
  message?: string;
  conflicting?: string[];
  issues?: { message: string }[];
};

async function send(body: unknown) {
  const response = await chatRoute(jsonRequest("http://localhost/api/chat", "POST", body));

  return { status: response.status, body: (await response.json()) as ChatResponse };
}

async function accept(id: string) {
  const response = await acceptRoute(
    jsonRequest(`http://localhost/api/proposals/${id}/accept`, "POST", {}),
    { params: Promise.resolve({ id }) },
  );

  return { status: response.status, body: await response.json() };
}

async function inbox() {
  const response = await inboxRoute();

  return (await response.json()) as { questions: InboxQuestion[] };
}

async function conversation(query: Record<string, string>) {
  const params = new URLSearchParams(query);
  const response = await conversationRoute(
    new Request(`http://localhost/api/conversation?${params.toString()}`),
  );

  return {
    status: response.status,
    body: (await response.json()) as {
      target?: TargetDescriptor;
      turns?: ConversationTurn[];
      error?: string;
    },
  };
}

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.runIf(hasDatabase)("persistent conversation targets", () => {
  let client: Client;
  let db: Db;
  let netflixId: string;
  let foreignId: string;

  async function ledgerRow(provider: string) {
    const [row] = await db
      .select()
      .from(subscriptions)
      .where(
        and(eq(subscriptions.user_id, USER.id), eq(subscriptions.provider_canonical, provider)),
      );

    return row;
  }

  beforeAll(async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await client.query("begin");
    db = drizzle(client, { schema });
    state.db = shareConnection(db);
    await db.insert(users).values([
      { id: USER.id, name: USER.name, email: USER.email },
      { id: OTHER.id, name: OTHER.name, email: OTHER.email },
    ]);

    state.email = OTHER.email;

    const theirs = await send({ message: "I subscribed to Spotify" });

    expect(theirs.status).toBe(201);
    expect((await accept(theirs.body.proposals[0].id)).status).toBe(200);

    const [spotify] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.user_id, OTHER.id));

    foreignId = spotify.id;
    state.email = USER.email;

    const created = await send({ message: "I subscribed to Netflix" });

    expect(created.status).toBe(201);
    expect((await accept(created.body.proposals[0].id)).status).toBe(200);
    netflixId = (await ledgerRow("netflix")).id;
  });

  afterAll(async () => {
    await client.query("rollback");
    await client.end();
    vi.unstubAllEnvs();
  });

  it("refuses a request that names more than one target", async () => {
    const { status, body } = await send({
      message: "£12 monthly",
      subscriptionId: netflixId,
      proposalId: journeyId(0x61, 9),
    });

    expect(status).toBe(400);
    expect(body.issues?.[0].message).toMatch(/one of subscriptionId/);
  });

  it("refuses another account's subscription and a card that does not exist", async () => {
    const foreign = await send({ message: "£12 monthly", subscriptionId: foreignId });

    expect(foreign.status).toBe(404);
    expect(foreign.body.error).toBe("target_not_found");

    const missing = await send({ message: "£12 monthly", proposalId: journeyId(0x61, 9) });

    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe("target_not_found");

    const rows = await db
      .select()
      .from(captures)
      .where(and(eq(captures.user_id, USER.id), eq(captures.subscription_id, foreignId)));

    expect(rows).toHaveLength(0);
  });

  it("lands a terse £12 monthly on the selected subscription and links the turn to it", async () => {
    const { status, body } = await send({
      message: "£12 monthly",
      subscriptionId: netflixId,
      clientTurnId: journeyId(0x61, 0x10),
    });

    expect(status).toBe(201);
    expect(body.proposals).toHaveLength(1);
    expect(body.proposals[0]).toMatchObject({
      kind: "update",
      state: "pending",
      subscriptionId: netflixId,
      payload: {
        amountMinor: { value: 1200, status: "proposed" },
        cadence: { value: "monthly", status: "proposed" },
      },
    });

    const [row] = await db
      .select()
      .from(captures)
      .where(and(eq(captures.user_id, USER.id), eq(captures.id, body.captureId)));

    expect(row.subscription_id).toBe(netflixId);
    expect(row.client_turn_id).toBe(journeyId(0x61, 0x10));
    expect((await ledgerRow("netflix")).amount_minor).toBeNull();
  });

  it("replays the same turn instead of reading it again", async () => {
    const before = await db
      .select()
      .from(proposals)
      .where(and(eq(proposals.user_id, USER.id), eq(proposals.state, "pending")));

    const again = await send({
      message: "£12 monthly",
      subscriptionId: netflixId,
      clientTurnId: journeyId(0x61, 0x10),
    });

    expect(again.status).toBe(200);
    expect(again.body.proposals.map((item) => item.id)).toEqual(before.map((row) => row.id));

    const turns = await db
      .select()
      .from(captures)
      .where(and(eq(captures.user_id, USER.id), eq(captures.client_turn_id, journeyId(0x61, 0x10))));

    expect(turns).toHaveLength(1);
  });

  it("does not let a message about Spotify land on the selected Netflix", async () => {
    const { status, body } = await send({
      message: "Spotify is £9.99 monthly",
      subscriptionId: netflixId,
    });

    expect(status).toBe(409);
    expect(body.error).toBe("target_mismatch");
    expect(body.conflicting).toEqual(["Spotify"]);
    expect(await ledgerRow("spotify")).toBeUndefined();
  });

  /**
   * SUB-66: a pasted billing excerpt says "your plan", not the service name.
   * With a subscription selected, those facts are about that subscription and
   * are proposed with their own trust; a different service still asks.
   */
  it("reads 'Your plan auto-renews' as being about the selected ChatGPT", async () => {
    const created = await send({ message: "I subscribed to ChatGPT" });

    expect(created.status).toBe(201);
    expect((await accept(created.body.proposals[0].id)).status).toBe(200);

    const chatgpt = await ledgerRow("chatgpt");
    const { status, body } = await send({
      message: "Your plan auto-renews on 2026-10-01.",
      subscriptionId: chatgpt.id,
    });

    expect(status).toBe(201);
    expect(body.proposals).toMatchObject([
      {
        kind: "update",
        state: "pending",
        subscriptionId: chatgpt.id,
        payload: {
          nextRenewal: { value: "2026-10-01", status: "proposed" },
          autoRenewal: { value: "yes", status: "proposed" },
        },
      },
    ]);

    const row = await ledgerRow("chatgpt");

    expect(row.next_renewal).toBeNull();
    expect(row.auto_renewal).not.toBe("yes");

    const other = await send({
      message: "Spotify your plan auto-renews on 2026-10-01.",
      subscriptionId: chatgpt.id,
    });

    expect(other.status).toBe(409);
    expect(other.body.error).toBe("target_mismatch");
    expect(other.body.conflicting).toEqual(["Spotify"]);
  });

  it("lands provider-free annual trial terms on the selected Warp draft without inventing a renewal", async () => {
    const created = await send({ message: "I subscribed to Warp" });
    const card = created.body.proposals[0];

    expect(created.status).toBe(201);
    expect(card).toMatchObject({ kind: "create", payload: { provider: { value: "Warp" } } });

    const { status, body } = await send({
      message:
        "Annual plan £180 per year. Trial ends 2026-09-20, next billing date 2026-09-20.",
      proposalId: card.id,
    });

    expect(status).toBe(201);
    expect(body.proposals).toMatchObject([
      {
        id: card.id,
        kind: "create",
        state: "pending",
        payload: {
          provider: { value: "Warp" },
          amountMinor: { value: 18000, status: "proposed" },
          cadence: { value: "yearly", status: "proposed" },
          trialEndsOn: { value: "2026-09-20", status: "proposed" },
          subscriptionStatus: { value: "trial" },
        },
      },
    ]);
    expect(body.proposals[0].payload?.nextRenewal?.value ?? null).toBeNull();
    expect(await ledgerRow("warp")).toBeUndefined();
  });

  it("reads the conversation about a subscription back, with the card's current state", async () => {
    const { status, body } = await conversation({ subscriptionId: netflixId });

    expect(status).toBe(200);
    expect(body.target).toMatchObject({ kind: "subscription", id: netflixId, provider: "Netflix" });
    expect(body.turns?.map((turn) => turn.content)).toEqual([
      "I subscribed to Netflix",
      "£12 monthly",
    ]);
    expect(body.turns?.[0].proposals).toMatchObject([{ state: "accepted" }]);
    expect(body.turns?.[1].proposals).toMatchObject([
      { state: "pending", subscriptionId: netflixId },
    ]);
  });

  it("revises the selected pending card rather than raising a second one", async () => {
    const created = await send({ message: "I subscribed to Strava" });
    const card = created.body.proposals[0];

    expect(created.status).toBe(201);
    expect(card).toMatchObject({ kind: "create", payload: { provider: { value: "Strava" } } });

    const revised = await send({ message: "£5 monthly", proposalId: card.id });

    expect(revised.status).toBe(201);
    expect(revised.body.proposals).toMatchObject([
      {
        id: card.id,
        state: "pending",
        payload: {
          provider: { value: "Strava" },
          amountMinor: { value: 500, status: "proposed" },
          cadence: { value: "monthly", status: "proposed" },
        },
      },
    ]);

    const about = await conversation({ proposalId: card.id });

    expect(about.status).toBe(200);
    expect(about.body.turns?.map((turn) => turn.content)).toEqual(["£5 monthly"]);

    expect((await accept(card.id)).status).toBe(200);

    const stale = await send({ message: "£6 monthly", proposalId: card.id });

    expect(stale.status).toBe(409);
    expect(stale.body.error).toBe("target_stale");

    const gone = await conversation({ proposalId: card.id });

    expect(gone.status).toBe(409);
  });

  it("answers the exact question named, not the latest one asked", async () => {
    const created = await send({ message: "Figma, Dropbox" });

    expect(created.status).toBe(201);

    for (const proposal of created.body.proposals) {
      expect((await accept(proposal.id)).status).toBe(200);
    }

    const open = (await inbox()).questions;
    const dropbox = open.find((item) => item.provider === "Dropbox" && item.reason === "amount");

    expect(dropbox).toBeDefined();

    const answered = await send({ message: "£8 yearly", questionId: dropbox?.id });

    expect(answered.status).toBe(201);
    expect(answered.body.proposals).toMatchObject([
      {
        subscriptionId: (await ledgerRow("dropbox")).id,
        payload: {
          amountMinor: { value: 800, status: "proposed" },
          cadence: { value: "yearly", status: "proposed" },
        },
      },
    ]);
    expect((await ledgerRow("figma")).amount_minor).toBeNull();

    const closed = await conversation({ questionId: dropbox?.id ?? "" });

    expect(closed.status).toBe(404);
  });

  it("refuses the other account's conversation and an unknown target", async () => {
    const foreign = await conversation({ subscriptionId: foreignId });

    expect(foreign.status).toBe(404);
    expect(foreign.body.error).toBe("target_not_found");

    const both = await conversation({ subscriptionId: netflixId, proposalId: journeyId(0x61, 9) });

    expect(both.status).toBe(400);

    state.email = null;

    const signedOut = await conversation({ subscriptionId: netflixId });

    expect(signedOut.status).toBe(401);
    state.email = USER.email;
  });
});
