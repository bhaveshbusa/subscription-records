import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import * as schema from "@/lib/db/schema";
import { subscriptions, users } from "@/lib/db/schema";
import type { ChatCaptureResult } from "@/lib/capture/record";
import type { ProposalView } from "@/lib/proposals/projection";

import {
  dayOffset,
  journeyId,
  journeyUser,
  jsonRequest,
  shareConnection,
  type Db,
} from "./harness";

/**
 * Journey 7 — trials and statuses behave as agreed
 * ([SUB-60](https://linear.app/lets-play-match/issue/SUB-60/interpret-new-subscriptions-as-active-and-current-trials-as-trial)).
 *
 * The examples come from the agreed contract in
 * `docs/subscription-workspace-ux-plan.md`: what a plain price statement means,
 * what a trial-labelled list means, what a price on a row the ledger already
 * holds does **not** mean, and what a row nobody could read is offered instead.
 *
 * Every test runs in file order against one transaction: the ledger a later
 * step reads is the one earlier steps built.
 */

const USER = journeyUser(0x06, "status");

/** Rows the ledger already holds when the journey starts. */
const TRIAL_ID = journeyId(0x06, 0x01);
const CANCELLED_ID = journeyId(0x06, 0x02);
const UNREADABLE_ID = journeyId(0x06, 0x03);

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
const { POST: setStatusRoute } = await import(
  "@/app/api/inbox/unresolved/[id]/status/route"
);

async function capture(message: string) {
  const response = await chatRoute(
    jsonRequest("http://localhost/api/chat", "POST", { message }),
  );

  return { status: response.status, body: (await response.json()) as ChatCaptureResult };
}

async function accept(id: string, confirm?: Record<string, unknown>) {
  const response = await acceptRoute(
    jsonRequest(
      `http://localhost/api/proposals/${id}/accept`,
      "POST",
      confirm ? { confirm } : {},
    ),
    { params: Promise.resolve({ id }) },
  );

  return { status: response.status, body: await response.json() };
}

async function setStatus(id: string, body: unknown) {
  const response = await setStatusRoute(
    jsonRequest(`http://localhost/api/inbox/unresolved/${id}/status`, "POST", body),
    { params: Promise.resolve({ id }) },
  );

  return { status: response.status, body: await response.json() };
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

const confirmed = {
  provider_field_status: "confirmed",
  amount_field_status: "confirmed",
  cadence_field_status: "confirmed",
  renewal_field_status: "confirmed",
  status_field_status: "confirmed",
} as const;

const hasDatabase = Boolean(process.env.DATABASE_URL);

/** No Anthropic key in a test run, so the labelled fixture extractor reads. */
describe.runIf(hasDatabase)("journey: statuses and trials as agreed", () => {
  let client: Client;
  let db: Db;

  async function rowFor(providerCanonical: string) {
    const [row] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.provider_canonical, providerCanonical));

    return row;
  }

  async function rowById(id: string) {
    const [row] = await db.select().from(subscriptions).where(eq(subscriptions.id, id));

    return row;
  }

  beforeAll(async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await client.query("begin");
    db = drizzle(client, { schema });
    state.db = shareConnection(db);

    await db.insert(users).values({ id: USER.id, name: USER.name, email: USER.email });

    await db.insert(subscriptions).values([
      {
        id: TRIAL_ID,
        user_id: USER.id,
        provider_canonical: "figma",
        provider_display: "Figma",
        status: "trial",
        currency: "GBP",
        cadence: null,
        amount_minor: null,
        next_renewal: null,
        trial_ends_on: dayOffset(20),
        ...confirmed,
        amount_field_status: "empty",
        cadence_field_status: "empty",
        renewal_field_status: "empty",
        trial_end_field_status: "confirmed",
      },
      {
        id: CANCELLED_ID,
        user_id: USER.id,
        provider_canonical: "audible",
        provider_display: "Audible",
        status: "cancelled",
        currency: "GBP",
        cadence: "monthly",
        amount_minor: 799,
        next_renewal: null,
        ends_on: dayOffset(-40),
        ...confirmed,
        renewal_field_status: "empty",
      },
      {
        /** A legacy row from before SUB-60: captured, accepted, never read. */
        id: UNREADABLE_ID,
        user_id: USER.id,
        provider_canonical: "strava",
        provider_display: "Strava",
        status: "unknown",
        currency: "GBP",
        cadence: "monthly",
        amount_minor: 899,
        next_renewal: dayOffset(-9),
        ...confirmed,
        status_field_status: "empty",
      },
    ]);

    state.email = USER.email;
  });

  afterAll(async () => {
    await client.query("rollback");
    await client.end();
    vi.unstubAllEnvs();
  });

  it("reads a price statement as a subscription the person holds", async () => {
    const { body } = await capture("ChatGPT subscription is £10 per month");
    const card = cardFor(body.proposals, "ChatGPT");

    expect(card.payload?.subscriptionStatus).toMatchObject({ value: "active" });
    /** Price and cadence are still the extractor's reading, not an answer. */
    expect(card.payload?.amountMinor?.status).toBe("proposed");
    expect(card.payload?.cadence?.status).toBe("proposed");

    expect((await accept(card.id)).status).toBe(200);

    const row = await rowFor("chatgpt");

    expect(row.status).toBe("active");
    /** Accepting established the status the card showed - and only that. */
    expect(row.status_field_status).toBe("confirmed");
    expect(row.amount_field_status).toBe("proposed");
    expect(row.cadence_field_status).toBe("proposed");
  });

  it("lands an ordinary pasted list as Active, price or no price", async () => {
    const { body } = await capture("Bear\nRaycast\nFathom");

    for (const provider of ["Bear", "Raycast", "Fathom"]) {
      const card = cardFor(body.proposals, provider);

      expect(card.payload?.subscriptionStatus).toMatchObject({
        value: "active",
        /** Read from recording it, not from words in the message. */
        status: "inferred",
      });
      expect((await accept(card.id)).status).toBe(200);
    }

    for (const provider of ["bear", "raycast", "fathom"]) {
      const row = await rowFor(provider);

      expect(row.status).toBe("active");
      /** An incomplete row is done enough: no price was invented for it. */
      expect(row.amount_minor).toBeNull();
    }
  });

  it("reads a list introduced as trials as Trial, with no trial ends known", async () => {
    const { body } = await capture(
      "These are my trial subscriptions:\nDescript\nPitch",
    );

    for (const provider of ["Descript", "Pitch"]) {
      const card = cardFor(body.proposals, provider);

      expect(card.payload?.subscriptionStatus).toMatchObject({ value: "trial" });
      expect((await accept(card.id)).status).toBe(200);
    }

    for (const provider of ["descript", "pitch"]) {
      const row = await rowFor(provider);

      expect(row.status).toBe("trial");
      expect(row.trial_ends_on).toBeNull();
      /** A trial is free; never a confirmed zero because of it. */
      expect(row.amount_minor).toBeNull();
    }

    /** The line introducing the list is not itself a subscription. */
    expect(await rowFor("these-are-my")).toBeUndefined();
  });

  it("reads a trial that has not ended yet as a current trial", async () => {
    const trialEnd = dayOffset(30);
    const { body } = await capture(
      `Claude trial ends ${trialEnd}, then £12.99 monthly`,
    );
    const card = cardFor(body.proposals, "Claude");

    expect(card.payload?.subscriptionStatus).toMatchObject({ value: "trial" });
    expect((await accept(card.id)).status).toBe(200);

    const row = await rowFor("claude");

    expect(row.status).toBe("trial");
    expect(row.trial_ends_on).toBe(trialEnd);
    /** The monthly price is the paid plan after trial, and stays unconfirmed. */
    expect(row.amount_minor).toBe(1299);
    expect(row.amount_field_status).toBe("proposed");
    /** Paid service starts at trial end; that is not a renewal date. */
    expect(row.next_renewal).toBeNull();
  });

  it("keeps an existing trial a trial when the message only carries a price", async () => {
    const { body } = await capture("Figma is £15 monthly");

    expect(body.proposals).toHaveLength(1);

    const card = body.proposals[0];

    expect(card.kind).not.toBe("create");
    expect(card.payload?.subscriptionStatus).toBeUndefined();
    expect((await accept(card.id)).status).toBe(200);

    const row = await rowById(TRIAL_ID);

    expect(row.status).toBe("trial");
    expect(row.amount_minor).toBe(1500);
  });

  it("keeps a cancelled record cancelled when a price turns up for it", async () => {
    const { body } = await capture("Audible is £8.99 monthly");

    expect(body.proposals).toHaveLength(1);
    expect(body.proposals[0].payload?.subscriptionStatus).toBeUndefined();
    expect((await accept(body.proposals[0].id)).status).toBe(200);

    const row = await rowById(CANCELLED_ID);

    expect(row.status).toBe("cancelled");
    expect(row.ends_on).not.toBeNull();
  });

  it("does not reclassify a row from a trial-end date it already stored", async () => {
    const row = await rowById(TRIAL_ID);

    /** Nothing in this journey wrote its status; only its price moved. */
    expect(row.status).toBe("trial");
    expect(row.status_field_status).toBe("confirmed");
    expect(row.trial_ends_on).toBe(dayOffset(20));
  });

  it("answers a row nobody could read with its status, and nothing else", async () => {
    const before = await rowById(UNREADABLE_ID);
    const { status, body } = await setStatus(UNREADABLE_ID, { status: "active" });

    expect(status).toBe(200);
    expect(body).toMatchObject({ action: "status_set", status: "active" });

    const row = await rowById(UNREADABLE_ID);

    expect(row.status).toBe("active");
    expect(row.status_field_status).toBe("confirmed");
    /** Not **Still have it**: the passed renewal date was not rolled. */
    expect(row.next_renewal).toBe(before.next_renewal);
    expect(row.amount_field_status).toBe(before.amount_field_status);
  });

  it("refuses to re-answer a row that already has a status", async () => {
    const { status, body } = await setStatus(UNREADABLE_ID, { status: "paused" });

    expect(status).toBe(409);
    expect(body.error).toBe("already_resolved");
    expect((await rowById(UNREADABLE_ID)).status).toBe("active");
  });

  it("refuses to end a subscription through the status answer", async () => {
    const { status } = await setStatus(TRIAL_ID, { status: "cancelled" });

    expect(status).toBe(400);
    expect((await rowById(TRIAL_ID)).status).toBe("trial");
  });
});
