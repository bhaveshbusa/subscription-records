import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import * as schema from "@/lib/db/schema";
import { proposals, subscriptions, users } from "@/lib/db/schema";
import type { ChatCaptureResult } from "@/lib/capture/record";

import { journeyUser, jsonRequest, shareConnection, type Db } from "./harness";

/**
 * Journey B — holding identity (SUB-50, rule settled in SUB-52).
 *
 * The criteria: a repeated provider updates rather than duplicates, a repeated
 * capture before acceptance does not stack duplicate pending work, and two
 * legitimately different accounts at one provider stay distinct.
 *
 * The rule: the holding's stable id is its identity; provider and account are
 * the evidence a message offers for which holding it means. One compatible
 * holding takes the proposal; several, or an account the ledger has not seen,
 * make the turn ask rather than pick. A repeated pending draft folds onto the
 * card it already has, and accepting a `create` rechecks that no sibling card
 * for the same draft has become a holding since.
 */

const USER = journeyUser(0x02, "identity");

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
const { POST: createRoute } = await import("@/app/api/subscriptions/route");

async function capture(message: string) {
  const response = await chatRoute(
    jsonRequest("http://localhost/api/chat", "POST", { message }),
  );

  return { status: response.status, body: (await response.json()) as ChatCaptureResult };
}

async function accept(id: string) {
  const response = await acceptRoute(
    jsonRequest(`http://localhost/api/proposals/${id}/accept`, "POST", {}),
    { params: Promise.resolve({ id }) },
  );

  return { status: response.status, body: await response.json() };
}

async function create(body: Record<string, unknown>) {
  const response = await createRoute(
    jsonRequest("http://localhost/api/subscriptions", "POST", body),
  );

  return { status: response.status, body: await response.json() };
}

const ascending = (a: number | null, b: number | null) => (a ?? 0) - (b ?? 0);

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.runIf(hasDatabase)("journey: holding identity", () => {
  let client: Client;
  let db: Db;

  async function rowsFor(providerCanonical: string) {
    return db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.user_id, USER.id),
          eq(subscriptions.provider_canonical, providerCanonical),
        ),
      );
  }

  async function pendingFor(provider: string) {
    const rows = await db
      .select()
      .from(proposals)
      .where(and(eq(proposals.user_id, USER.id), eq(proposals.state, "pending")));

    return rows.filter(
      (row) => (row.payload as { provider?: { value?: string } })?.provider?.value === provider,
    );
  }

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

  it("matches before it creates: a held service is updated, not duplicated", async () => {
    const first = await capture("Netflix £12.99 monthly");

    await accept(first.body.proposals[0].id);
    expect(await rowsFor("netflix")).toHaveLength(1);

    const second = await capture("Netflix £15.99 monthly");

    /**
     * A stated price on a held row is a change of terms, not a field
     * correction — the two are distinguishable by design (D6, SUB-43).
     */
    expect(second.body.proposals[0].kind).toBe("terms_changed");
    expect(second.body.matches.map((match) => match.strength)).toContain("high");

    await accept(second.body.proposals[0].id);

    const rows = await rowsFor("netflix");

    expect(rows).toHaveLength(1);
    expect(rows[0].amount_minor).toBe(1599);
  });

  it("tolerates a different spelling of the same service", async () => {
    const { body } = await capture("net-flix £16.99 monthly");

    expect(body.matches.map((match) => match.strength)).toContain("high");

    await accept(body.proposals[0].id);

    expect(await rowsFor("netflix")).toHaveLength(1);
  });

  it("keeps two accounts at one provider distinct when entered by hand", async () => {
    expect((await create({
      provider: "Disney+",
      accountHint: "personal@example.com",
      amountMinor: 799,
      currency: "GBP",
      cadence: "monthly",
      status: "active",
    })).status).toBe(201);

    expect((await create({
      provider: "Disney+",
      accountHint: "family@example.com",
      amountMinor: 1099,
      currency: "GBP",
      cadence: "monthly",
      status: "active",
    })).status).toBe(201);

    const rows = await rowsFor("disney");

    /**
     * The storage model represents the distinction: there is no unique index on
     * (user_id, provider_canonical), and `account_hint` separates the two. So
     * the gap in the reproducers below is in matching, not in the schema.
     */
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.account_hint).sort()).toEqual([
      "family@example.com",
      "personal@example.com",
    ]);
    expect(rows.map((row) => row.amount_minor).sort(ascending)).toEqual([799, 1099]);
  });

  it("never matches one user's provider against another user's row", async () => {
    const other = journeyUser(0x03, "identity-other");

    await db.insert(users).values({ id: other.id, name: other.name, email: other.email });

    state.email = other.email;

    const { body } = await capture("Netflix £12.99 monthly");

    expect(body.proposals[0].kind).toBe("create");
    expect(body.matches).toEqual([]);

    state.email = USER.email;
  });

  it("folds a repeated pending capture onto one draft, which becomes one holding", async () => {
    const first = await capture("Figma £14 monthly");
    const second = await capture("Figma £14 monthly");

    expect(second.body.proposals.map((row) => row.id)).toEqual(
      first.body.proposals.map((row) => row.id),
    );

    const pending = await pendingFor("Figma");

    expect(pending).toHaveLength(1);
    expect(pending[0].kind).toBe("create");

    /** A different account is a different draft: kept beside it, never folded in. */
    const third = await capture("Figma £14 monthly on design@example.com");

    expect(third.body.proposals).toHaveLength(1);
    expect(third.body.proposals[0].id).not.toBe(pending[0].id);
    expect(await pendingFor("Figma")).toHaveLength(2);

    expect((await accept(pending[0].id)).status).toBe(200);

    const rows = await rowsFor("figma");

    expect(rows).toHaveLength(1);
    expect(rows[0].amount_minor).toBe(1400);
  });

  it("refuses to accept a second card for a draft that already became a holding", async () => {
    const [first] = (
      await db
        .insert(proposals)
        .values([
          {
            user_id: USER.id,
            kind: "create",
            state: "pending",
            payload: { provider: { value: "Notion", status: "proposed", confidence: "high" } },
            confidence: "high",
          },
          {
            user_id: USER.id,
            kind: "create",
            state: "pending",
            payload: { provider: { value: "Notion", status: "proposed", confidence: "high" } },
            confidence: "high",
          },
        ])
        .returning()
    ).sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
    const pending = await pendingFor("Notion");
    const second = pending.find((row) => row.id !== first.id);

    expect(second).toBeDefined();
    expect((await accept(first.id)).status).toBe(200);

    const refused = await accept(second!.id);

    expect(refused.status).toBe(409);
    expect(refused.body.error).toBe("duplicate_holding");
    expect(refused.body.subscriptionId).toBe((await rowsFor("notion"))[0].id);
    expect(await rowsFor("notion")).toHaveLength(1);

    /** The refused card is still pending: nothing was dropped, it can be rejected or retargeted. */
    expect((await pendingFor("Notion")).map((row) => row.id)).toEqual([second!.id]);
  });

  it("targets the account the message names when one holding carries it", async () => {
    const before = await rowsFor("disney");
    const family = before.find((row) => row.account_hint === "family@example.com");

    expect(before).toHaveLength(2);
    expect(family).toBeDefined();

    const { body } = await capture("Disney+ £10.99 monthly on family@example.com");

    /** Whatever the turn asks next is about that holding, not "Disney+" at large. */
    expect(body.followUp?.reason).not.toBe("account_identity");
    expect(body.followUp?.scope).toBe(`holding:${family!.id}`);
    expect(body.matches).toEqual([
      expect.objectContaining({ strength: "high", subscriptionId: family!.id }),
    ]);

    /** The named holding already reads that way, so there is nothing to propose. */
    expect(body.proposals).toEqual([]);
    expect(await rowsFor("disney")).toHaveLength(2);
  });

  it("asks which holding is meant when two match and the message names none", async () => {
    const { body } = await capture("Disney+ is now £12.99 monthly");

    expect(body.proposals).toEqual([]);
    expect(body.matches).toEqual([]);
    expect(body.followUp).toMatchObject({
      reason: "account_identity",
      question:
        "You have Disney+ on personal@example.com or family@example.com. Which one is this, or is it a new one?",
    });

    /** Naming one of them settles it against that holding, and only that one. */
    const answer = await capture("the family@example.com one");
    const family = (await rowsFor("disney")).find(
      (row) => row.account_hint === "family@example.com",
    );

    expect(answer.body.proposals.map((row) => row.kind)).toEqual(["terms_changed"]);
    expect(answer.body.matches).toEqual([
      expect.objectContaining({ subscriptionId: family!.id }),
    ]);

    await accept(answer.body.proposals[0].id);

    const rows = await rowsFor("disney");

    expect(rows.map((row) => row.amount_minor).sort(ascending)).toEqual([799, 1299]);
  });

  it("asks before treating an unseen account as either holding, and 'new' adds a third", async () => {
    const { body } = await capture("Disney+ £5.99 monthly on kids@example.com");

    expect(body.proposals).toEqual([]);
    expect(body.followUp).toMatchObject({
      reason: "account_identity",
      question:
        "Your Disney+ is on personal@example.com or family@example.com. Is kids@example.com a change of account, or a second subscription?",
    });
    expect(await rowsFor("disney")).toHaveLength(2);

    const answer = await capture("a new one");

    expect(answer.body.proposals.map((row) => row.kind)).toEqual(["create"]);

    await accept(answer.body.proposals[0].id);

    const rows = await rowsFor("disney");

    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.account_hint).sort()).toEqual([
      "family@example.com",
      "kids@example.com",
      "personal@example.com",
    ]);
  });

  it("refuses a card whose holding has since moved to another account", async () => {
    const [personal] = (await rowsFor("disney")).filter(
      (row) => row.account_hint === "personal@example.com",
    );
    const { body } = await capture("Disney+ £8.99 monthly on personal@example.com");

    expect(body.proposals.map((row) => row.kind)).toEqual(["terms_changed"]);

    await db
      .update(subscriptions)
      .set({ account_hint: "moved@example.com" })
      .where(and(eq(subscriptions.user_id, USER.id), eq(subscriptions.id, personal.id)));

    const refused = await accept(body.proposals[0].id);

    expect(refused.status).toBe(409);
    expect(refused.body.error).toBe("stale_target");
    expect((await rowsFor("disney")).find((row) => row.id === personal.id)?.amount_minor).toBe(799);
  });
});
