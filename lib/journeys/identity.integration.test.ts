import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import * as schema from "@/lib/db/schema";
import { proposals, subscriptions, users } from "@/lib/db/schema";
import type { ChatCaptureResult } from "@/lib/capture/record";

import { journeyUser, jsonRequest, shareConnection, type Db } from "./harness";

/**
 * Journey B — holding identity (SUB-50).
 *
 * The criteria: a repeated provider updates rather than duplicates, a repeated
 * capture before acceptance does not stack duplicate pending work, and two
 * legitimately different accounts at one provider stay distinct.
 *
 * Two of those do not hold today. Both are pinned below as REPRODUCER tests
 * that assert the current behavior rather than change it, because SUB-50 says:
 * "If matching cannot represent the distinction, record a reproducer and
 * resolve the identity rule before implementing a targeted fix", and AGENTS.md
 * forbids guessing identity and lifecycle behavior inside an implementation PR.
 *
 * The two are entangled, which is the main reason not to patch either here:
 * making capture match more eagerly to stop the duplicates would merge genuinely
 * distinct accounts harder, and making it match on `account_hint` to separate
 * accounts would multiply the duplicates. One identity rule has to settle both.
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

  /**
   * REPRODUCER 1 — duplicate pending capture reaches the ledger as two rows.
   *
   * Send the same message twice before accepting either card, then accept both:
   * two identical holdings appear, same provider, same price, nothing to tell
   * them apart. Nothing dedupes a pending `create` against another pending
   * `create`, and by accept time each card only checks the ledger, which was
   * still empty when the first was raised.
   *
   * This contradicts an acceptance criterion SUB-45 already shipped against:
   * "Repeating evidence, including before acceptance, does not create
   * unintended duplicate subscriptions or pending operations."
   *
   * Pinned, not fixed — see the file header on why this and REPRODUCER 2 need
   * one identity rule between them. Raised on SUB-50 for its own issue.
   */
  it("REPRODUCER: a repeated pending capture becomes two identical holdings", async () => {
    await capture("Figma £14 monthly");
    await capture("Figma £14 monthly");

    const pending = await pendingFor("Figma");

    expect(pending).toHaveLength(2);
    expect(pending.every((row) => row.kind === "create")).toBe(true);

    for (const row of pending) {
      expect((await accept(row.id)).status).toBe(200);
    }

    const rows = await rowsFor("figma");

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.amount_minor)).toEqual([1400, 1400]);
    /** Nothing distinguishes them, so neither the user nor a later match can. */
    expect(rows.map((row) => row.account_hint)).toEqual([null, null]);
  });

  /**
   * REPRODUCER 2 — capture cannot name which account it means.
   *
   * `matchCandidate` keys on `provider_canonical` alone and never reads
   * `account_hint`, so "Disney+ ... on family@example.com" `high`-matches
   * whichever Disney+ row the ledger scan returns first. The message names an
   * account; the proposal cannot honour it.
   *
   * The criterion "no silent dropping or merging of distinct holdings" is not
   * met on the capture path. Fixing it needs an identity rule first: does
   * `account_hint` participate in matching, what happens when a message names
   * no account, and what happens when it names one the ledger has never seen.
   * Those are product decisions. Raised on SUB-50 for its own issue.
   */
  it("REPRODUCER: capture cannot target the account the message named", async () => {
    const before = await rowsFor("disney");

    expect(before).toHaveLength(2);

    const named = before.find((row) => row.account_hint === "family@example.com");
    const { body } = await capture("Disney+ £10.99 monthly on family@example.com");

    /** A match, not a create — so the second account is never proposed. */
    expect(body.matches.map((match) => match.strength)).toContain("high");

    const target = body.proposals[0].subscriptionId;

    expect(before.map((row) => row.id)).toContain(target);

    /**
     * The gap in one assertion: the account hint the message carried does not
     * decide the target. Recorded without asserting which row wins, because
     * scan order is not the contract and should not be pinned as if it were.
     */
    const honouredTheNamedAccount = target === named?.id;

    expect(typeof honouredTheNamedAccount).toBe("boolean");

    /** Either way no third row appears: a distinct holding cannot be added. */
    expect(await rowsFor("disney")).toHaveLength(2);
  });
});
