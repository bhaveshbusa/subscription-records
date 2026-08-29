import { and, eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import * as schema from "@/lib/db/schema";
import { amendments, captures, proposals, subscriptions, users } from "@/lib/db/schema";
import { createSeedData, DEFAULT_SEED_EMAIL, SEED_USER_ID } from "@/lib/db/seed-data";
import type { ProposalView } from "@/lib/proposals/projection";

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
const { POST: acceptRoute } = await import("@/app/api/proposals/[id]/accept/route");

async function send(body: unknown) {
  const response = await chatRoute(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

  return { status: response.status, body: (await response.json()) as ChatCaptureResult };
}

async function accept(id: string) {
  const response = await acceptRoute(
    new Request(`http://localhost/api/proposals/${id}/accept`, { method: "POST" }),
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
          return (run: (tx: NodePgDatabase<typeof schema>) => unknown) => run(target);
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
    expect(body.proposals[0]).toMatchObject({ kind: "create", state: "pending" });
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
    expect(providers(body.proposals)).toEqual(["Figma", "Dropbox", "Duolingo", "Audible"]);
    expect(await ledgerRows("figma")).toHaveLength(0);
    expect(await ledgerRows("audible")).toHaveLength(0);
  });

  it("proposes money and dates without confirming them, and never fabricates one", async () => {
    const { body } = await send({ message: "Substack £5 monthly renews 2026-10-01" });
    const [payload] = body.proposals.map((view) => view.payload);

    expect(payload).toMatchObject({
      amountMinor: { value: 500, status: "proposed" },
      cadence: { value: "monthly", status: "proposed" },
      nextRenewal: { value: "2026-10-01", status: "proposed" },
    });
    expect(payload?.provider).toMatchObject({ status: "proposed" });
  });

  it("asks at most one question, for the highest priority gap", async () => {
    const { body } = await send({ message: "Strava\nAudible £8 monthly renews 2026-11-02" });

    expect(body.followUp).toMatchObject({ reason: "amount", provider: "Strava" });
  });

  it("asks about a duplicate when the provider is already in the ledger", async () => {
    const { body } = await send({ message: "Netflix £15.99 monthly renews 2026-09-30" });

    expect(body.followUp).toMatchObject({ reason: "duplicate", provider: "Netflix" });
    expect(await ledgerRows("netflix")).toHaveLength(1);
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
    expect(await db.select().from(proposals).where(eq(proposals.user_id, SEED_USER_ID))).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ rationale: "I subscribed to Notion" })]),
    );
  });
});
