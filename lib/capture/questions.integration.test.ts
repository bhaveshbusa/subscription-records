import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import * as schema from "@/lib/db/schema";
import { captureQuestions, proposals, subscriptions, users } from "@/lib/db/schema";
import type { ChatCaptureResult } from "@/lib/capture/record";
import type { InboxQuestion } from "@/lib/inbox/query";

import { jsonRequest, journeyUser, shareConnection, type Db } from "../journeys/harness";

/**
 * Several questions can be open at once. Inbox must list all of them after a
 * reload, and a reply names one by id rather than guessing the latest asked.
 */

const USER = journeyUser(0x55, "questions");

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
const { GET: inboxRoute } = await import("@/app/api/inbox/route");

async function send(body: unknown) {
  const response = await chatRoute(
    jsonRequest("http://localhost/api/chat", "POST", body),
  );

  return { status: response.status, body: (await response.json()) as ChatCaptureResult & {
    error?: string;
    message?: string;
  } };
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

async function inbox() {
  const response = await inboxRoute();

  return {
    status: response.status,
    body: (await response.json()) as { questions: InboxQuestion[] },
  };
}

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.runIf(hasDatabase)("open capture questions", () => {
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

  it("records four questions and lists all four after another read", async () => {
    const names = ["Figma", "Dropbox", "Duolingo", "Audible"];

    for (const name of names) {
      const { status, body } = await send({ message: `I subscribed to ${name}` });

      expect(status).toBe(201);
      expect(body.followUp).toMatchObject({ reason: "amount", provider: name });
      expect(body.followUp?.id).toBeTruthy();

      expect((await accept(body.proposals[0].id)).status).toBe(200);
    }

    const first = (await inbox()).body.questions;
    const second = (await inbox()).body.questions;

    expect(first).toHaveLength(4);
    expect(first.map((item) => item.provider).sort()).toEqual([...names].sort());
    expect(first.every((item) => item.state === "asked")).toBe(true);
    expect(second.map((item) => item.id).sort()).toEqual(first.map((item) => item.id).sort());
  });

  it("answers an older price question by id with a terse £12 monthly", async () => {
    const open = (await inbox()).body.questions;
    const figma = open.find((item) => item.provider === "Figma");
    const audible = open.find((item) => item.provider === "Audible");

    expect(figma).toBeDefined();
    expect(audible).toBeDefined();
    expect(figma?.id).not.toBe(audible?.id);

    const { status, body } = await send({
      message: "£12 monthly",
      questionId: figma?.id,
    });

    expect(status).toBe(201);
    expect(body.proposals).toHaveLength(1);
    expect(body.proposals[0]).toMatchObject({
      payload: {
        amountMinor: { value: 1200, status: "proposed" },
        cadence: { value: "monthly", status: "proposed" },
      },
    });

    const [row] = await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.user_id, USER.id), eq(subscriptions.provider_canonical, "figma")));

    expect(body.proposals[0].subscriptionId).toBe(row.id);

    const remaining = (await inbox()).body.questions;
    const amountOpen = remaining.filter((item) => item.reason === "amount");

    expect(remaining.find((item) => item.id === figma?.id)).toBeUndefined();
    expect(amountOpen.map((item) => item.provider).sort()).toEqual([
      "Audible",
      "Dropbox",
      "Duolingo",
    ]);
  });

  it("defers a different question by id without touching the pending answer", async () => {
    const open = (await inbox()).body.questions;
    const dropbox = open.find((item) => item.provider === "Dropbox");

    expect(dropbox).toBeDefined();

    const { status, body } = await send({
      message: "later",
      questionId: dropbox?.id,
    });

    expect(status).toBe(201);
    expect(body.deferred).toMatchObject({ provider: "Dropbox", reason: "amount" });

    const pending = await db
      .select()
      .from(proposals)
      .where(and(eq(proposals.user_id, USER.id), eq(proposals.state, "pending")));

    expect(pending.length).toBeGreaterThan(0);
    expect(
      pending.some((row) => {
        const payload = row.payload as { amountMinor?: { value: number } };
        return payload.amountMinor?.value === 1200;
      }),
    ).toBe(true);

    const remaining = (await inbox()).body.questions;

    expect(remaining.find((item) => item.provider === "Dropbox")).toMatchObject({
      reason: "amount",
      state: "deferred",
    });
    expect(
      remaining.filter((item) => item.reason === "amount" && item.state === "asked").map((item) => item.provider).sort(),
    ).toEqual(["Audible", "Duolingo"]);
  });

  it("keeps unresolved work when the answer proposal is rejected", async () => {
    const [figma] = await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.user_id, USER.id), eq(subscriptions.provider_canonical, "figma")));
    const [answer] = await db
      .select()
      .from(proposals)
      .where(
        and(
          eq(proposals.user_id, USER.id),
          eq(proposals.state, "pending"),
          eq(proposals.subscription_id, figma.id),
        ),
      );

    expect(answer).toBeDefined();
    expect((await reject(answer.id)).status).toBe(200);

    const [after] = await db.select().from(subscriptions).where(eq(subscriptions.id, figma.id));
    const [question] = await db
      .select()
      .from(captureQuestions)
      .where(
        and(
          eq(captureQuestions.user_id, USER.id),
          eq(captureQuestions.provider_canonical, "figma"),
          eq(captureQuestions.reason, "amount"),
        ),
      );

    expect(after.amount_minor).toBeNull();
    expect(question.state).toBe("answered");
    expect(
      (await inbox()).body.questions.find(
        (item) => item.provider === "Figma" && item.reason === "amount",
      ),
    ).toBeUndefined();
  });

  it("refuses a bare later when several questions are still asked", async () => {
    const { status, body } = await send({ message: "later" });

    expect(status).toBe(409);
    expect(body.error).toBe("question_required");
  });

  it("does not guess another account's question, and leaves a missing id unapplied", async () => {
    const missing = await send({
      message: "£9",
      questionId: "00000000-0000-4000-8000-00000000ffff",
    });

    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe("question_not_found");

    const [legacy] = await db
      .insert(captureQuestions)
      .values({
        user_id: USER.id,
        provider_canonical: "orphan",
        provider_display: "Orphan",
        reason: "amount",
        state: "asked",
        question: "How much is Orphan?",
        candidate: null,
        subscription_id: null,
      })
      .returning();

    const { status, body } = await send({
      message: "£9 monthly",
      questionId: legacy.id,
    });

    expect(status).toBe(201);
    expect(body.proposals).toMatchObject([
      {
        kind: "create",
        payload: {
          provider: { value: "Orphan" },
          amountMinor: { value: 900, status: "proposed" },
        },
      },
    ]);
    expect(body.proposals[0].subscriptionId).toBeNull();

    const figma = await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.user_id, USER.id), eq(subscriptions.provider_canonical, "figma")));

    expect(figma).toHaveLength(1);
    expect(figma[0].amount_minor).toBeNull();
  });

  it("updates the pending create instead of duplicating it when the question is answered before accept", async () => {
    const created = await send({ message: "I subscribed to Strava" });
    const originalId = created.body.proposals[0]?.id;

    expect(created.status).toBe(201);
    expect(created.body.proposals).toHaveLength(1);
    expect(created.body.followUp).toMatchObject({ reason: "amount", provider: "Strava" });
    expect(originalId).toBeTruthy();

    const answered = await send({
      message: "£12 monthly",
      questionId: created.body.followUp?.id,
    });

    expect(answered.status).toBe(201);
    expect(answered.body.proposals).toHaveLength(1);
    expect(answered.body.proposals[0]).toMatchObject({
      id: originalId,
      kind: "create",
      state: "pending",
      payload: {
        provider: { value: "Strava" },
        amountMinor: { value: 1200, status: "proposed" },
        cadence: { value: "monthly", status: "proposed" },
      },
    });

    const pending = await db
      .select()
      .from(proposals)
      .where(and(eq(proposals.user_id, USER.id), eq(proposals.state, "pending")));
    const strava = pending.filter((row) => {
      const payload = row.payload as { provider?: { value?: string } };

      return payload.provider?.value === "Strava";
    });

    expect(strava).toHaveLength(1);
    expect(strava[0].id).toBe(originalId);
    expect(strava[0].payload).toMatchObject({
      amountMinor: { value: 1200 },
      cadence: { value: "monthly" },
    });
  });
});
