import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { holdingScope, type FollowUpReason } from "@/lib/capture/follow-up";
import type { ChatCaptureResult } from "@/lib/capture/record";
import * as schema from "@/lib/db/schema";
import { captureQuestions, subscriptions, users } from "@/lib/db/schema";
import type { InboxSections } from "@/lib/inbox/query";
import type { ProposalView } from "@/lib/proposals/projection";
import type { SubscriptionListItem } from "@/lib/subscriptions/projection";
import { buildSubscriptionEntries } from "@/lib/workspace/subscription-list";

import { jsonRequest, journeyUser, shareConnection, type Db } from "../journeys/harness";

/**
 * SUB-69. A question asked about a draft is about the holding that draft
 * becomes. Accepting a name-only card saves the row and leaves its price
 * question open on that row - not on a phantom "not added yet" draft. The
 * question closes only when the price is actually saved, by hand or by an
 * accepted card; a pending or rejected card, and questions about other fields
 * or other holdings, leave it be.
 */

const USER = journeyUser(0x69, "answered-fields");

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
const { POST: rejectRoute } = await import("@/app/api/proposals/[id]/reject/route");
const { POST: retargetRoute } = await import("@/app/api/proposals/[id]/retarget/route");
const { GET: proposalsRoute } = await import("@/app/api/proposals/route");
const { GET: listRoute } = await import("@/app/api/subscriptions/route");
const { PATCH: patchRoute } = await import("@/app/api/subscriptions/[id]/route");
const { GET: inboxRoute } = await import("@/app/api/inbox/route");

async function send(body: unknown) {
  const response = await chatRoute(jsonRequest("http://localhost/api/chat", "POST", body));

  return { status: response.status, body: (await response.json()) as ChatCaptureResult };
}

async function accept(id: string) {
  const response = await acceptRoute(
    jsonRequest(`http://localhost/api/proposals/${id}/accept`, "POST", {}),
    { params: Promise.resolve({ id }) },
  );

  return { status: response.status, body: await response.json() };
}

async function reject(id: string) {
  const response = await rejectRoute(
    jsonRequest(`http://localhost/api/proposals/${id}/reject`, "POST"),
    { params: Promise.resolve({ id }) },
  );

  return { status: response.status };
}

async function retarget(id: string, action: unknown) {
  const response = await retargetRoute(
    jsonRequest(`http://localhost/api/proposals/${id}/retarget`, "POST", action),
    { params: Promise.resolve({ id }) },
  );

  return { status: response.status, body: await response.json() };
}

async function patch(id: string, body: unknown) {
  const response = await patchRoute(
    jsonRequest(`http://localhost/api/subscriptions/${id}`, "PATCH", body),
    { params: Promise.resolve({ id }) },
  );

  return { status: response.status, body: await response.json() };
}

/** What the workspace joins, exactly as the page reads it: inventory, pending cards, inbox. */
async function workspace() {
  const [page, cards, inbox] = await Promise.all([
    listRoute(jsonRequest("http://localhost/api/subscriptions?limit=100", "GET")),
    proposalsRoute(jsonRequest("http://localhost/api/proposals?state=pending", "GET")),
    inboxRoute(),
  ]);
  const items = ((await page.json()) as { items: SubscriptionListItem[] }).items;
  const proposals = ((await cards.json()) as { items: ProposalView[] }).items;
  const sections = (await inbox.json()) as InboxSections;

  return { sections, entries: buildSubscriptionEntries({ items, proposals, sections }) };
}

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.runIf(hasDatabase)("questions follow the draft into its holding", () => {
  let client: Client;
  let db: Db;

  beforeAll(async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await client.query("begin");
    db = drizzle(client, { schema });
    state.db = shareConnection(db);
    await db.insert(users).values({ id: USER.id, name: USER.name, email: USER.email });
    state.email = USER.email;
  });

  afterAll(async () => {
    await client.query("rollback");
    await client.end();
    vi.unstubAllEnvs();
  });

  async function rowFor(canonical: string) {
    const [row] = await db
      .select()
      .from(subscriptions)
      .where(
        and(eq(subscriptions.user_id, USER.id), eq(subscriptions.provider_canonical, canonical)),
      );

    return row;
  }

  async function questionsFor(canonical: string, reason: FollowUpReason = "amount") {
    return db
      .select()
      .from(captureQuestions)
      .where(
        and(
          eq(captureQuestions.user_id, USER.id),
          eq(captureQuestions.provider_canonical, canonical),
          eq(captureQuestions.reason, reason),
        ),
      );
  }

  it("keeps the price question open on the saved holding after a name-only accept", async () => {
    const lovable = await send({ message: "I subscribed to Lovable" });
    const notion = await send({ message: "I subscribed to Notion" });

    expect(lovable.status).toBe(201);
    expect(lovable.body.followUp).toMatchObject({ reason: "amount", provider: "Lovable" });
    expect(notion.body.followUp).toMatchObject({ reason: "amount", provider: "Notion" });

    expect((await accept(lovable.body.proposals[0].id)).status).toBe(200);

    const row = await rowFor("lovable");

    expect(row.amount_minor).toBeNull();

    const [question] = await questionsFor("lovable");

    expect(question).toMatchObject({
      reason: "amount",
      state: "asked",
      scope_key: holdingScope(row.id),
      subscription_id: row.id,
    });

    const { entries } = await workspace();
    const lovableEntries = entries.filter((entry) => entry.provider === "Lovable");

    expect(lovableEntries).toHaveLength(1);
    expect(lovableEntries[0]).toMatchObject({ kind: "saved", subscriptionId: row.id });
    expect(lovableEntries[0].questions.map((item) => item.id)).toEqual([question.id]);

    /** The draft not yet accepted keeps its own question, on its own card. */
    const notionEntries = entries.filter((entry) => entry.provider === "Notion");

    expect(notionEntries).toHaveLength(1);
    expect(notionEntries[0]).toMatchObject({ kind: "draft", subscriptionId: null });
    expect(notionEntries[0].questions.map((item) => item.reason)).toEqual(["amount"]);
  });

  it("resolves only the price question when the price is saved by hand", async () => {
    const row = await rowFor("lovable");
    const before = (await workspace()).sections.questions;
    const saved = await patch(row.id, { amountMinor: 2500, cadence: "monthly" });

    expect(saved.status).toBe(200);

    const [question] = await questionsFor("lovable");

    expect(question.state).toBe("answered");
    expect(question.resolved_at).not.toBeNull();

    const after = (await workspace()).sections.questions;

    expect(after.map((item) => item.id).sort()).toEqual(
      before
        .filter((item) => item.id !== question.id)
        .map((item) => item.id)
        .sort(),
    );

    /** Saving by hand is the user's own word, but nothing else on the row moved. */
    const updated = await rowFor("lovable");

    expect(updated.amount_minor).toBe(2500);
    expect(updated.next_renewal).toBeNull();
    expect(updated.provider_display).toBe("Lovable");
  });

  it("closes the question when the card carrying the price is accepted, not when it is rejected", async () => {
    const heard = await send({ message: "I subscribed to Canva" });

    expect((await accept(heard.body.proposals[0].id)).status).toBe(200);

    const row = await rowFor("canva");
    const [question] = await questionsFor("canva");

    expect(question).toMatchObject({ reason: "amount", state: "asked", subscription_id: row.id });

    /**
     * A chat reply that reads as the price answers the question as it is heard,
     * so to see what deciding the card does the question is reopened by hand
     * each time, as if it had been asked from a surface capture does not read.
     */
    async function reopen() {
      await db
        .update(captureQuestions)
        .set({ state: "asked", resolved_at: null })
        .where(eq(captureQuestions.id, question.id));
    }

    async function stateNow() {
      const [row] = await db
        .select()
        .from(captureQuestions)
        .where(eq(captureQuestions.id, question.id));

      return row.state;
    }

    const rejected = await send({ message: "Canva is £11.99 a month" });

    expect(rejected.body.proposals).toHaveLength(1);
    expect(rejected.body.proposals[0]).toMatchObject({ kind: "update", subscriptionId: row.id });

    await reopen();
    expect((await reject(rejected.body.proposals[0].id)).status).toBe(200);
    expect(await stateNow()).toBe("asked");
    expect((await rowFor("canva")).amount_minor).toBeNull();

    const again = await send({ message: "Canva is £11.99 a month" });

    await reopen();
    expect((await accept(again.body.proposals[0].id)).status).toBe(200);
    expect((await rowFor("canva")).amount_minor).toBe(1199);
    expect(await stateNow()).toBe("answered");
  });

  it("does not close a question whose field the accepted card did not carry", async () => {
    const heard = await send({ message: "I subscribed to Miro" });

    expect((await accept(heard.body.proposals[0].id)).status).toBe(200);

    const row = await rowFor("miro");
    const renewal = await send({ message: "Miro renews on 2027-03-01" });

    expect(renewal.body.proposals[0]).toMatchObject({ kind: "update", subscriptionId: row.id });
    expect((await accept(renewal.body.proposals[0].id)).status).toBe(200);

    const updated = await rowFor("miro");

    expect(updated.next_renewal).toBe("2027-03-01");
    expect(updated.amount_minor).toBeNull();

    const amount = await questionsFor("miro");

    expect(amount).toHaveLength(1);
    expect(amount[0]).toMatchObject({ state: "asked", subscription_id: row.id });
  });

  it("does not resolve a deferred question about another field on the same holding", async () => {
    const row = await rowFor("miro");
    const [question] = await questionsFor("miro");
    const deferred = await send({ message: "later", questionId: question.id });

    expect(deferred.status).toBe(201);
    expect(deferred.body.deferred).toMatchObject({ provider: "Miro", reason: "amount" });

    const saved = await patch(row.id, { notes: "Team board" });

    expect(saved.status).toBe(200);

    const [after] = await db
      .select()
      .from(captureQuestions)
      .where(eq(captureQuestions.id, question.id));

    expect(after.state).toBe("deferred");
  });

  it("moves a draft's open question onto the holding it is retargeted at", async () => {
    const row = await rowFor("lovable");
    const draft = await send({ message: "I subscribed to Lovable Labs" });

    expect(draft.body.proposals.map((item) => item.kind)).toEqual(["create"]);

    const open = await db
      .select()
      .from(captureQuestions)
      .where(
        and(
          eq(captureQuestions.user_id, USER.id),
          eq(captureQuestions.provider_canonical, "lovable-labs"),
        ),
      );

    expect(open.length).toBeGreaterThan(0);

    const moved = await retarget(draft.body.proposals[0].id, { useExisting: row.id });

    expect(moved.status).toBe(200);
    expect(moved.body.retargeted).toBe(true);

    for (const question of open) {
      const [after] = await db
        .select()
        .from(captureQuestions)
        .where(eq(captureQuestions.id, question.id));

      /** A term the holding already records is answered; any other question is now about it. */
      if (after.state === "answered") {
        expect(["amount", "cadence", "duplicate"]).toContain(after.reason);
      } else {
        expect(after).toMatchObject({
          scope_key: holdingScope(row.id),
          subscription_id: row.id,
          provider_display: "Lovable",
        });
      }
    }

    const { entries } = await workspace();

    expect(entries.filter((entry) => entry.provider === "Lovable Labs")).toEqual([]);
  });
});
