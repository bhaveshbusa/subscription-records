import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import * as schema from "@/lib/db/schema";
import { amendments, events, subscriptions, users } from "@/lib/db/schema";
import type { ChatCaptureResult } from "@/lib/capture/record";

import { journeyId, journeyUser, jsonRequest, noonOn, shareConnection, type Db } from "./harness";

/**
 * Journey F — coming back after six months (SUB-50).
 *
 * `docs/product.md` calls this the normal path, and
 * `docs/testing-and-signoff.md` recorded that it had no check of its own. The
 * absence contains the four things that actually happen while nobody is
 * looking: a price went up, something was cancelled and the user only says so
 * later, something was restarted, and one holding they simply cannot remember.
 *
 * The clock is frozen and moved, rather than dates being offset from the real
 * today, so "three months ago" means a specific day the assertions can name.
 * `toFake: ["Date"]` only — see the note in `reminders.integration.test.ts`.
 */

const USER = journeyUser(0x05, "return");

const NETFLIX_ID = journeyId(0x05, 0x01);
const SPOTIFY_ID = journeyId(0x05, 0x02);
const AUDIBLE_ID = journeyId(0x05, 0x03);
const STRAVA_ID = journeyId(0x05, 0x04);

const NETFLIX_AMENDMENT_ID = journeyId(0x05, 0x11);
const SPOTIFY_AMENDMENT_ID = journeyId(0x05, 0x12);
const AUDIBLE_AMENDMENT_ID = journeyId(0x05, 0x13);
const STRAVA_AMENDMENT_ID = journeyId(0x05, 0x14);

/** The last day the user looked, and the day they come back. */
const LAST_SEEN = "2027-01-10";
const RETURNED = "2027-07-10";
/** Inside the absence: the day the price actually changed. */
const PRICE_CHANGED_ON = "2027-04-01";
/** The last day the old price applied, so the two periods do not overlap. */
const DAY_BEFORE_CHANGE = "2027-03-31";

/** Audible was cancelled before the user went away, and is restarted on return. */
const AUDIBLE_CANCELLED_ON = "2026-12-20";

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
const { PATCH: patchRoute, GET: detailRoute } =
  await import("@/app/api/subscriptions/[id]/route");

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

async function patch(id: string, body: Record<string, unknown>) {
  const response = await patchRoute(
    jsonRequest(`http://localhost/api/subscriptions/${id}`, "PATCH", body),
    { params: Promise.resolve({ id }) },
  );

  return { status: response.status, body: await response.json() };
}

type Detail = {
  amount: { value: number | null; status: string };
  notes: string | null;
  amendments: { effectiveFrom: string; effectiveTo: string | null; amountMinor: number | null }[];
  events: { type: string; at: string }[];
};

async function detail(id: string) {
  const response = await detailRoute(new Request(`http://localhost/api/subscriptions/${id}`), {
    params: Promise.resolve({ id }),
  });

  return (await response.json()) as Detail;
}

const confirmed = {
  provider_field_status: "confirmed",
  amount_field_status: "confirmed",
  cadence_field_status: "confirmed",
  renewal_field_status: "confirmed",
  status_field_status: "confirmed",
} as const;

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.runIf(hasDatabase)("journey: returning after six months", () => {
  let client: Client;
  let db: Db;

  async function row(id: string) {
    const [found] = await db.select().from(subscriptions).where(eq(subscriptions.id, id));

    return found;
  }

  beforeAll(async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await client.query("begin");
    db = drizzle(client, { schema });
    state.db = shareConnection(db);

    await db.insert(users).values({ id: USER.id, name: USER.name, email: USER.email });

    /** The ledger as the user left it on LAST_SEEN. */
    await db.insert(subscriptions).values([
      {
        id: NETFLIX_ID,
        user_id: USER.id,
        provider_canonical: "netflix",
        provider_display: "Netflix",
        status: "active",
        currency: "GBP",
        cadence: "monthly",
        amount_minor: 1299,
        next_renewal: "2027-02-10",
        ...confirmed,
      },
      {
        id: SPOTIFY_ID,
        user_id: USER.id,
        provider_canonical: "spotify",
        provider_display: "Spotify",
        status: "active",
        currency: "GBP",
        cadence: "monthly",
        amount_minor: 1199,
        next_renewal: "2027-02-05",
        ...confirmed,
      },
      {
        id: AUDIBLE_ID,
        user_id: USER.id,
        provider_canonical: "audible",
        provider_display: "Audible",
        status: "cancelled",
        currency: "GBP",
        cadence: "monthly",
        amount_minor: 799,
        next_renewal: null,
        ends_on: AUDIBLE_CANCELLED_ON,
        ...confirmed,
        renewal_field_status: "empty",
      },
      {
        id: STRAVA_ID,
        user_id: USER.id,
        provider_canonical: "strava",
        provider_display: "Strava",
        status: "active",
        currency: "GBP",
        cadence: "yearly",
        amount_minor: 5500,
        next_renewal: "2027-05-01",
        ...confirmed,
        /** Nothing confirmed it renews, so a passed date is a real question. */
        auto_renewal: null,
      },
    ]);

    await db.insert(amendments).values([
      {
        id: NETFLIX_AMENDMENT_ID,
        user_id: USER.id,
        subscription_id: NETFLIX_ID,
        effective_from: "2026-02-10",
        effective_to: null,
        amount_minor: 1299,
        currency: "GBP",
        cadence: "monthly",
      },
      {
        id: SPOTIFY_AMENDMENT_ID,
        user_id: USER.id,
        subscription_id: SPOTIFY_ID,
        effective_from: "2026-02-05",
        effective_to: null,
        amount_minor: 1199,
        currency: "GBP",
        cadence: "monthly",
      },
      {
        id: AUDIBLE_AMENDMENT_ID,
        user_id: USER.id,
        subscription_id: AUDIBLE_ID,
        effective_from: "2026-01-20",
        effective_to: AUDIBLE_CANCELLED_ON,
        amount_minor: 799,
        currency: "GBP",
        cadence: "monthly",
      },
      {
        id: STRAVA_AMENDMENT_ID,
        user_id: USER.id,
        subscription_id: STRAVA_ID,
        effective_from: "2026-05-01",
        effective_to: null,
        amount_minor: 5500,
        currency: "GBP",
        cadence: "yearly",
      },
    ]);

    /**
     * Audible's own cancellation, recorded when it happened. Without this the
     * reactivation test would be asserting against a row that never had a
     * history to preserve.
     */
    await db.insert(events).values({
      id: journeyId(0x05, 0x21),
      user_id: USER.id,
      subscription_id: AUDIBLE_ID,
      type: "cancelled",
      at: noonOn(AUDIBLE_CANCELLED_ON),
      confirmed: true,
      rationale: "Stopped before the break.",
    });

    state.email = USER.email;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(noonOn(LAST_SEEN));
  });

  afterAll(async () => {
    vi.useRealTimers();
    await client.query("rollback");
    await client.end();
    vi.unstubAllEnvs();
  });

  it("six months pass with nothing running and nothing changed", async () => {
    const before = await db.select().from(subscriptions).orderBy(subscriptions.id);

    vi.setSystemTime(noonOn(RETURNED));

    /** No scheduler exists, so the absence itself writes nothing. */
    expect(await db.select().from(subscriptions).orderBy(subscriptions.id)).toEqual(before);
  });

  it("records a price change with the day it happened, keeping the old terms", async () => {
    const { status } = await patch(NETFLIX_ID, {
      amountMinor: 1599,
      termsChange: { effectiveFrom: PRICE_CHANGED_ON },
    });

    expect(status).toBe(200);

    const current = await row(NETFLIX_ID);

    expect(current.amount_minor).toBe(1599);

    const history = await db
      .select()
      .from(amendments)
      .where(and(eq(amendments.subscription_id, NETFLIX_ID)))
      .orderBy(amendments.effective_from);

    /**
     * Two periods now: the old price, closed, and the new one, open. The old
     * period ends the day *before* the new one starts — the two are contiguous
     * and non-overlapping, so there is no day on which the price was both.
     */
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ amount_minor: 1299, effective_to: DAY_BEFORE_CHANGE });
    expect(history[1]).toMatchObject({
      amount_minor: 1599,
      effective_from: PRICE_CHANGED_ON,
      effective_to: null,
    });
  });

  it("does not backdate the change to today, or lose what it cost before", async () => {
    const view = await detail(NETFLIX_ID);

    expect(view.amendments.some((period) => period.amountMinor === 1299)).toBe(true);
    /** The change is dated when it happened, not when it was reported. */
    expect(view.amendments.every((period) => period.effectiveFrom !== RETURNED)).toBe(true);
  });

  it("cancels with the date the user states, not the day they mention it", async () => {
    const { body } = await capture("I cancelled Spotify three months ago");
    const proposal = body.proposals[0];

    expect(proposal.kind).toBe("cancelled");
    expect((await accept(proposal.id)).status).toBe(200);

    const current = await row(SPOTIFY_ID);

    expect(current.status).toBe("cancelled");
    /** Three calendar months before 10 July 2027. Never today, never the stale renewal. */
    expect(current.ends_on).toBe("2027-04-10");
    expect(current.ends_on).not.toBe(RETURNED);
    expect(current.ends_on).not.toBe("2027-02-05");
  });

  it("keeps the cancelled subscription's identity and history", async () => {
    const current = await row(SPOTIFY_ID);

    expect(current.id).toBe(SPOTIFY_ID);
    expect(current.provider_display).toBe("Spotify");

    const raised = await db
      .select()
      .from(events)
      .where(and(eq(events.subscription_id, SPOTIFY_ID), eq(events.type, "cancelled")));

    expect(raised).toHaveLength(1);

    /** The open amendment is closed rather than deleted. */
    const open = await db
      .select()
      .from(amendments)
      .where(
        and(eq(amendments.subscription_id, SPOTIFY_ID), isNull(amendments.effective_to)),
      );

    expect(open).toHaveLength(0);
  });

  it("reactivates onto the same row rather than starting a second one", async () => {
    const { body } = await capture("I resubscribed to Audible");
    const proposal = body.proposals[0];

    expect(proposal.kind).toBe("reactivated");
    expect(proposal.subscriptionId).toBe(AUDIBLE_ID);
    expect((await accept(proposal.id)).status).toBe(200);

    const current = await row(AUDIBLE_ID);

    expect(current.id).toBe(AUDIBLE_ID);
    expect(current.status).toBe("active");

    const all = await db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.user_id, USER.id),
          eq(subscriptions.provider_canonical, "audible"),
        ),
      );

    expect(all).toHaveLength(1);
  });

  it("keeps the cancelled period in history after reactivation", async () => {
    const view = await detail(AUDIBLE_ID);

    expect(view.amendments.some((period) => period.effectiveTo === AUDIBLE_CANCELLED_ON)).toBe(
      true,
    );
    expect(view.events.some((event) => event.type === "cancelled")).toBe(true);
    expect(view.events.some((event) => event.type === "reactivated")).toBe(true);
  });

  it("leaves 'I don't know' unresolved instead of inventing an answer", async () => {
    const before = await row(STRAVA_ID);

    /** A note is allowed; a guess is not. */
    const { status } = await patch(STRAVA_ID, {
      notes: "Not sure whether this renewed in May. Check the card statement.",
    });

    expect(status).toBe(200);

    const after = await row(STRAVA_ID);

    expect(after.notes).toContain("Not sure whether this renewed");
    /** Nothing about the uncertainty was resolved by writing it down. */
    expect(after.status).toBe(before.status);
    expect(after.next_renewal).toBe(before.next_renewal);
    expect(after.renewal_field_status).toBe(before.renewal_field_status);
    expect(after.auto_renewal).toBeNull();
    expect(after.ends_on).toBeNull();
  });

  it("keeps the unresolved holding as work, and the settled ones out of it", async () => {
    const { GET: inboxRoute } = await import("@/app/api/inbox/route");
    const body = (await (await inboxRoute()).json()) as {
      overdue: { provider: { value: string } }[];
    };
    const overdue = body.overdue.map((item) => item.provider.value);

    /** Unknown auto-renewal with a passed date is still a real question. */
    expect(overdue).toContain("Strava");
    /** Cancelled is settled, however old the date. */
    expect(overdue).not.toContain("Spotify");
  });

  it("writes a note without reconfirming anything it did not touch", async () => {
    const before = await row(NETFLIX_ID);

    await patch(NETFLIX_ID, { notes: "Checked against the April statement." });

    const after = await row(NETFLIX_ID);

    expect(after.amount_minor).toBe(before.amount_minor);
    expect(after.amount_field_status).toBe(before.amount_field_status);
    expect(after.cadence_field_status).toBe(before.cadence_field_status);
    expect(after.renewal_field_status).toBe(before.renewal_field_status);
    expect(after.next_renewal).toBe(before.next_renewal);
  });
});
