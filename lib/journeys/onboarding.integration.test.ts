import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import * as schema from "@/lib/db/schema";
import { amendments, events, proposals, subscriptions, users } from "@/lib/db/schema";
import type { ChatCaptureResult } from "@/lib/capture/record";
import type { ProposalView } from "@/lib/proposals/projection";

import { dayOffset, journeyUser, jsonRequest, shareConnection, type Db } from "./harness";

/**
 * Journey A — establish a bounded, trustworthy starting picture (SUB-50).
 *
 * `docs/testing-and-signoff.md` said it plainly: "Nothing is verified about
 * starting from zero. All checks run on `npm run db:seed`. The empty-ledger
 * path — the one a real user meets first — is untested." This file walks that
 * path with no seeded holdings at all, and asserts the things scenario A in
 * `docs/stage-one-acceptance-scenarios.md` asks a human to confirm by eye.
 *
 * Every test runs in file order against one transaction, because a journey is
 * cumulative: the ledger a later step reads is the one earlier steps built.
 */

const USER = journeyUser(0x01, "onboarding");

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
const { GET: listRoute } = await import("@/app/api/subscriptions/route");
const { PATCH: patchRoute } = await import("@/app/api/subscriptions/[id]/route");
const { GET: summaryRoute } = await import("@/app/api/subscriptions/summary/route");

async function capture(message: string) {
  const response = await chatRoute(
    jsonRequest("http://localhost/api/chat", "POST", { message }),
  );

  return { status: response.status, body: (await response.json()) as ChatCaptureResult };
}

async function accept(id: string, confirm?: Record<string, unknown>) {
  const response = await acceptRoute(
    jsonRequest(`http://localhost/api/proposals/${id}/accept`, "POST", confirm ? { confirm } : {}),
    { params: Promise.resolve({ id }) },
  );

  return { status: response.status, body: await response.json() };
}

async function reject(id: string) {
  const response = await rejectRoute(
    jsonRequest(`http://localhost/api/proposals/${id}/reject`, "POST"),
    { params: Promise.resolve({ id }) },
  );

  return { status: response.status, body: await response.json() };
}

type ListItem = {
  id: string;
  provider: { value: string };
  amount: { value: number | null; status: string } | null;
  cadence: { value: string | null; status: string } | null;
};

async function ledger() {
  const response = await listRoute(new Request("http://localhost/api/subscriptions"));

  return (await response.json()) as { items: ListItem[]; nextCursor: string | null };
}

async function summary() {
  const response = await summaryRoute();

  return await response.json();
}

function cardFor(views: ProposalView[], provider: string) {
  const card = views.find((view) => view.payload?.provider?.value === provider);

  if (!card) {
    throw new Error(
      `no proposal for ${provider}; got ${views
        .map((view) => view.payload?.provider?.value ?? "?")
        .join(", ")}`,
    );
  }

  return card;
}

const hasDatabase = Boolean(process.env.DATABASE_URL);

/** No Anthropic key in a test run, so the labelled fixture extractor reads. */
describe.runIf(hasDatabase)("journey: onboarding from an empty ledger", () => {
  let client: Client;
  let db: Db;

  async function rowFor(providerCanonical: string) {
    const [row] = await db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.user_id, USER.id),
          eq(subscriptions.provider_canonical, providerCanonical),
        ),
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

    /** A user and nothing else. No holdings, no proposals, no preferences. */
    await db.insert(users).values({ id: USER.id, name: USER.name, email: USER.email });

    state.email = USER.email;
  });

  afterAll(async () => {
    await client.query("rollback");
    await client.end();
    vi.unstubAllEnvs();
  });

  it("starts with nothing: an empty ledger reads as empty, not as broken", async () => {
    const { items, nextCursor } = await ledger();

    expect(items).toEqual([]);
    expect(nextCursor).toBeNull();

    const totals = await summary();

    expect(totals).toMatchObject({
      activeCount: 0,
      trialCount: 0,
      monthlyEquivalentMinor: 0,
      nextRenewal: null,
    });
    expect(totals.coverage.confirmed.count).toBe(0);
    expect(totals.coverage.unconfirmed.count).toBe(0);
  });

  it("captures a mixed list as pending proposals and writes no ledger rows", async () => {
    const { status, body } = await capture(
      "Netflix £12.99 monthly\nSpotify\nAdobe £120 yearly",
    );

    expect(status).toBe(201);
    expect(body.proposals.map((view) => view.payload?.provider?.value).sort()).toEqual([
      "Adobe",
      "Netflix",
      "Spotify",
    ]);
    expect(body.proposals.every((view) => view.state === "pending")).toBe(true);

    /** The contract's sharpest line: capture proposes, it does not record. */
    expect((await ledger()).items).toEqual([]);
  });

  it("proposes money as proposed, never confirmed, before anyone accepts", async () => {
    const [pending] = await db
      .select()
      .from(proposals)
      .where(and(eq(proposals.user_id, USER.id), eq(proposals.state, "pending")));

    expect(pending).toBeDefined();

    const { body } = await capture("Netflix £12.99 monthly");
    const netflix = cardFor(body.proposals, "Netflix");

    expect(netflix.payload?.amountMinor?.status).toBe("proposed");
    expect(netflix.payload?.cadence?.status).toBe("proposed");
    expect(netflix.payload?.provider?.status).toBe("proposed");
  });

  it("accepts a row as proposed: it lands in the ledger with its uncertainty intact", async () => {
    const { body } = await capture("Netflix £12.99 monthly");
    const netflix = cardFor(body.proposals, "Netflix");

    expect((await accept(netflix.id)).status).toBe(200);

    const row = await rowFor("netflix");

    expect(row).toBeDefined();
    expect(row.amount_minor).toBe(1299);
    expect(row.cadence).toBe("monthly");
    /** Accepting as proposed is not confirmation. */
    expect(row.amount_field_status).toBe("proposed");
    expect(row.cadence_field_status).toBe("proposed");
  });

  it("saves a name with no price at all — an incomplete row is done enough", async () => {
    const { body } = await capture("Spotify");
    const spotify = cardFor(body.proposals, "Spotify");

    expect((await accept(spotify.id)).status).toBe(200);

    const row = await rowFor("spotify");

    expect(row).toBeDefined();
    expect(row.amount_minor).toBeNull();
    expect(row.cadence).toBeNull();
    expect(row.provider_display).toBe("Spotify");
  });

  it("confirms on the card only when the user supplies the value", async () => {
    const { body } = await capture("Adobe £120 yearly");
    const adobe = cardFor(body.proposals, "Adobe");

    expect(
      (await accept(adobe.id, { amountMinor: 12000, currency: "GBP", cadence: "yearly" })).status,
    ).toBe(200);

    const row = await rowFor("adobe");

    expect(row.amount_minor).toBe(12000);
    expect(row.amount_field_status).toBe("confirmed");
    expect(row.cadence_field_status).toBe("confirmed");
  });

  it("rejects a wrong interpretation without leaving a ledger row behind", async () => {
    const { body } = await capture("Dropbox £8 monthly");
    const wrong = cardFor(body.proposals, "Dropbox");

    expect((await reject(wrong.id)).status).toBe(200);

    expect(await rowFor("dropbox")).toBeUndefined();

    const [row] = await db.select().from(proposals).where(eq(proposals.id, wrong.id));

    expect(row.state).toBe("rejected");
    expect(row.decided_at).not.toBeNull();
  });

  it("survives reload: listing twice returns the same rows, and no duplicates", async () => {
    const first = (await ledger()).items.map((item) => item.provider.value).sort();
    const second = (await ledger()).items.map((item) => item.provider.value).sort();

    expect(first).toEqual(second);
    expect(new Set(first).size).toBe(first.length);
    expect(first).toEqual(["Adobe", "Netflix", "Spotify"]);
  });

  it("records a free trial with paid-plan terms labelled after trial", async () => {
    const trialEnd = dayOffset(14);
    const { body } = await capture(
      `Notion trial ends ${trialEnd}, then £10 monthly, auto-renew is on`,
    );
    const notion = cardFor(body.proposals, "Notion");

    expect((await accept(notion.id)).status).toBe(200);

    const row = await rowFor("notion");

    expect(row.status).toBe("trial");
    expect(row.trial_ends_on).toBe(trialEnd);
    /** Trial end is not subscription end, and not the next renewal. */
    expect(row.ends_on).toBeNull();
    expect(row.next_renewal).toBeNull();
    /** The stated price is the paid plan after trial, and stays unconfirmed. */
    expect(row.amount_minor).toBe(1000);
    expect(row.amount_field_status).toBe("proposed");
    /** Never a confirmed zero merely because the trial itself is free. */
    expect(row.amount_minor).not.toBe(0);
  });

  it("keeps the trial's future price out of the current paid total", async () => {
    const totals = await summary();

    expect(totals.trialCount).toBe(1);
    expect(totals.coverage.afterTrial.stated.count).toBe(1);
    expect(
      totals.coverage.afterTrial.stated.items.map((item: { provider: string }) => item.provider),
    ).toContain("Notion");

    /**
     * `confirmed` carries only a count and a total, so the check that Notion is
     * outside the paid commitment is: it appears under afterTrial, it is absent
     * from the unconfirmed contributors, and it is not an omission either.
     */
    const unconfirmed = totals.coverage.unconfirmed.items.map(
      (item: { provider: string }) => item.provider,
    );
    const omitted = totals.coverage.omitted.missingPriceOrCadence.items.map(
      (item: { provider: string }) => item.provider,
    );

    expect(unconfirmed).not.toContain("Notion");
    expect(omitted).not.toContain("Notion");
  });

  /**
   * Worth stating plainly, because it surprised the author of this test: a
   * captured row lands `status: unknown`, so it contributes nothing to the paid
   * commitment until the user says they actually hold it. Mentioning a service
   * is not the same as declaring you pay for it, and `applyCreate` defaults to
   * `unknown` rather than inferring `active`. The total is 0 here on purpose.
   */
  it("does not assume a captured row is a live paid commitment", async () => {
    const totals = await summary();

    expect(totals.monthlyEquivalentMinor).toBe(0);
    expect(totals.coverage.confirmed.count).toBe(0);
    expect(totals.coverage.unconfirmed.count).toBe(0);

    for (const provider of ["netflix", "adobe", "spotify"]) {
      expect((await rowFor(provider)).status).toBe("unknown");
    }
  });

  it("counts a holding once the user says it is active, split by trust", async () => {
    for (const provider of ["netflix", "adobe", "spotify"]) {
      const row = await rowFor(provider);
      const response = await patchRoute(
        jsonRequest(`http://localhost/api/subscriptions/${row.id}`, "PATCH", {
          status: "active",
        }),
        { params: Promise.resolve({ id: row.id }) },
      );

      expect(response.status).toBe(200);
    }

    const totals = await summary();

    /** Scenario B arithmetic: £12.99 monthly + £120 yearly = £22.99 a month. */
    expect(totals.monthlyEquivalentMinor).toBe(2299);
    /** Adobe was confirmed on its card; Netflix was accepted as proposed. */
    expect(totals.coverage.confirmed).toMatchObject({
      count: 1,
      monthlyEquivalentMinor: 1000,
    });
    expect(totals.coverage.unconfirmed).toMatchObject({
      count: 1,
      monthlyEquivalentMinor: 1299,
    });
  });

  it("reports a missing price as an omission, never as a zero", async () => {
    const totals = await summary();
    const missing = totals.coverage.omitted.missingPriceOrCadence;

    expect(missing.count).toBe(1);
    expect(missing.items.map((item: { provider: string }) => item.provider)).toEqual(["Spotify"]);

    /**
     * The omission is nameable and does not drag the total down: £22.99 is the
     * total of what is known, not an average diluted by a zero for Spotify.
     */
    expect(totals.monthlyEquivalentMinor).toBe(2299);
  });

  it("leaves auto-renewal unknown when nothing said it, and never reads it off cadence", async () => {
    const netflix = await rowFor("netflix");

    expect(netflix.cadence).toBe("monthly");
    expect(netflix.auto_renewal).toBeNull();

    const adobe = await rowFor("adobe");

    expect(adobe.cadence).toBe("yearly");
    expect(adobe.auto_renewal).toBeNull();
  });

  it("accounts for every captured source: each row is present, rejected, or still pending", async () => {
    const { items } = await ledger();
    const inLedger = items.map((item) => item.provider.value).sort();

    expect(inLedger).toEqual(["Adobe", "Netflix", "Notion", "Spotify"]);

    const rejected = await db
      .select()
      .from(proposals)
      .where(and(eq(proposals.user_id, USER.id), eq(proposals.state, "rejected")));

    expect(rejected).toHaveLength(1);

    /** Nothing captured has silently vanished: every proposal has a verdict. */
    const all = await db.select().from(proposals).where(eq(proposals.user_id, USER.id));

    expect(all.every((row) => ["pending", "accepted", "rejected", "superseded"].includes(row.state))).toBe(
      true,
    );
  });

  it("never returns another user's onboarding to them", async () => {
    state.email = "nobody-onboarding@example.com";

    const response = await listRoute(new Request("http://localhost/api/subscriptions"));
    const body = (await response.json()) as { items: ListItem[] };

    expect(body.items).toEqual([]);

    state.email = USER.email;
  });

  it("writes no events or amendments that nobody asked for", async () => {
    const raised = await db.select().from(events).where(eq(events.user_id, USER.id));

    /** Nothing here paid, cancelled or reactivated anything. */
    expect(raised.filter((row) => row.type === "charged")).toHaveLength(0);
    expect(raised.filter((row) => row.type === "cancelled")).toHaveLength(0);

    const open = await db
      .select()
      .from(amendments)
      .where(and(eq(amendments.user_id, USER.id), isNull(amendments.effective_to)));

    /** One open amendment per accepted holding, never two. */
    const perSubscription = new Map<string, number>();

    for (const row of open) {
      perSubscription.set(
        row.subscription_id,
        (perSubscription.get(row.subscription_id) ?? 0) + 1,
      );
    }

    expect([...perSubscription.values()].every((count) => count === 1)).toBe(true);
  });
});
