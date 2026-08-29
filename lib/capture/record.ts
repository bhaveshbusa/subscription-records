import { and, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { captures, proposals, subscriptions } from "@/lib/db/schema";
import type { ProposalPayload } from "@/lib/proposals/payload";
import { toProposalView, type ProposalView } from "@/lib/proposals/projection";
import { canonicalProvider } from "@/lib/subscriptions/write";

import type { ExtractionCandidate } from "./candidates";
import type { Extraction } from "./extract";
import { chooseFollowUp, type FollowUp } from "./follow-up";

/** Insert and select on one connection, so a route can hand over a transaction. */
export type CaptureClient = Pick<NodePgDatabase, "select" | "insert">;

export const CHAT_CAPTURE_SOURCE = "chat";

export type ChatCaptureResult = {
  captureId: string;
  mode: Extraction["mode"];
  notice: string | null;
  proposals: ProposalView[];
  followUp: FollowUp | null;
};

/**
 * Everything the message states, and nothing else. Money and dates carry
 * `proposed`, never `confirmed`: the person accepting the card is the only one
 * who can confirm them. The provider is `proposed` too, so a misread name is
 * corrected in the ledger rather than trusted here.
 */
export function toCreatePayload(candidate: ExtractionCandidate): ProposalPayload {
  const payload: ProposalPayload = {
    provider: {
      value: candidate.provider,
      status: "proposed",
      confidence: candidate.confidence,
    },
  };

  if (candidate.plan) {
    payload.plan = candidate.plan;
  }

  if (candidate.accountHint) {
    payload.accountHint = candidate.accountHint;
  }

  if (candidate.currency) {
    payload.currency = candidate.currency;
  }

  if (candidate.subscriptionStatus) {
    payload.subscriptionStatus = {
      value: candidate.subscriptionStatus,
      status: "proposed",
      confidence: candidate.confidence,
    };
  }

  if (candidate.amountMinor !== null && candidate.amountMinor !== undefined) {
    payload.amountMinor = {
      value: candidate.amountMinor,
      status: "proposed",
      confidence: candidate.confidence,
    };
  }

  if (candidate.cadence) {
    payload.cadence = {
      value: candidate.cadence,
      status: "proposed",
      confidence: candidate.confidence,
    };
  }

  if (candidate.nextRenewal) {
    payload.nextRenewal = {
      value: candidate.nextRenewal,
      status: "proposed",
      confidence: candidate.confidence,
    };
  }

  return payload;
}

async function findLedgerProviders(
  client: CaptureClient,
  userId: string,
  candidates: ExtractionCandidate[],
): Promise<Map<string, string>> {
  const keys = [...new Set(candidates.map((candidate) => canonicalProvider(candidate.provider)))];

  if (keys.length === 0) {
    return new Map();
  }

  const rows = await client
    .select({
      canonical: subscriptions.provider_canonical,
      display: subscriptions.provider_display,
    })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.user_id, userId),
        inArray(subscriptions.provider_canonical, keys),
      ),
    );

  return new Map(rows.map((row) => [row.canonical, row.display]));
}

/**
 * Stores the message and one pending `create` proposal per candidate. It never
 * touches `subscriptions`: a row appears there only when someone accepts a
 * proposal, which is what keeps the ledger the human's.
 */
export async function recordChatCapture(
  client: CaptureClient,
  options: { userId: string; text: string; extraction: Extraction },
): Promise<ChatCaptureResult> {
  const [capture] = await client
    .insert(captures)
    .values({
      user_id: options.userId,
      kind: "text",
      source: CHAT_CAPTURE_SOURCE,
      content: options.text,
    })
    .returning({ id: captures.id });

  const candidates = options.extraction.candidates;

  if (candidates.length === 0) {
    return {
      captureId: capture.id,
      mode: options.extraction.mode,
      notice: options.extraction.notice,
      proposals: [],
      followUp: null,
    };
  }

  const ledgerProviders = await findLedgerProviders(client, options.userId, candidates);
  const rows = await client
    .insert(proposals)
    .values(
      candidates.map((candidate) => ({
        user_id: options.userId,
        kind: "create" as const,
        state: "pending" as const,
        payload: toCreatePayload(candidate),
        rationale: candidate.evidence,
        confidence: candidate.confidence,
        capture_id: capture.id,
      })),
    )
    .returning();

  return {
    captureId: capture.id,
    mode: options.extraction.mode,
    notice: options.extraction.notice,
    proposals: rows.map((row) => toProposalView(row)),
    followUp: chooseFollowUp(
      candidates.map((candidate) => ({
        ...candidate,
        duplicateOf: ledgerProviders.get(canonicalProvider(candidate.provider)) ?? null,
      })),
    ),
  };
}
