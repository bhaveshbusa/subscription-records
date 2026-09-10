import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { proposals } from "@/lib/db/schema";
import { proposalPayloadSchema } from "@/lib/proposals/payload";
import type { ProposalRow } from "@/lib/proposals/projection";
import { candidateFromPayload } from "@/lib/proposals/retarget";
import { canonicalProvider } from "@/lib/subscriptions/write";

import type { ExtractionCandidate } from "./candidates";
import type { LedgerEntry } from "./match";
import { applyQuestionContext, overlayFields } from "./question-reply";
import { loadOwnedOpenQuestion, type QuestionRow } from "./questions";
import { loadLedgerRow } from "./record";
import type { CaptureTargetInput, TargetDescriptor } from "./target-fields";

export type { CaptureTargetInput, TargetDescriptor } from "./target-fields";

export type CaptureTarget =
  | { kind: "all" }
  | { kind: "subscription"; subscription: LedgerEntry }
  | { kind: "proposal"; proposal: ProposalRow; subscription: LedgerEntry | null }
  | { kind: "question"; question: QuestionRow };

export type TargetError = {
  error: "target_not_found" | "target_stale" | "question_not_found";
  status: 404 | 409;
  message: string;
};

export type TargetResolution =
  | { ok: true; target: CaptureTarget }
  | { ok: false; failure: TargetError };

export const ALL_TARGET: CaptureTarget = { kind: "all" };

type TargetClient = Pick<NodePgDatabase, "select">;

/**
 * Turns the ids a request named into the rows this user owns. A row that is
 * missing, another user's, or already decided is refused: a stale card must
 * not quietly become a fresh capture about something else.
 */
export async function resolveCaptureTarget(
  client: TargetClient,
  userId: string,
  input: CaptureTargetInput,
): Promise<TargetResolution> {
  if (input.questionId) {
    const question = await loadOwnedOpenQuestion(client, userId, input.questionId);

    if (!question) {
      return {
        ok: false,
        failure: {
          error: "question_not_found",
          status: 404,
          message:
            "That question is no longer open. Reload your inbox to see what is still waiting.",
        },
      };
    }

    return { ok: true, target: { kind: "question", question } };
  }

  if (input.proposalId) {
    const [proposal] = await client
      .select()
      .from(proposals)
      .where(and(eq(proposals.user_id, userId), eq(proposals.id, input.proposalId)))
      .limit(1);

    if (!proposal) {
      return {
        ok: false,
        failure: {
          error: "target_not_found",
          status: 404,
          message: "That proposal is not in your inbox. Choose what this is about again.",
        },
      };
    }

    if (proposal.state !== "pending") {
      return {
        ok: false,
        failure: {
          error: "target_stale",
          status: 409,
          message:
            "That proposal has already been decided. Reload your inbox and choose what this is about.",
        },
      };
    }

    const subscription = proposal.subscription_id
      ? ((await loadLedgerRow(client, userId, proposal.subscription_id))[0] ?? null)
      : null;

    return { ok: true, target: { kind: "proposal", proposal, subscription } };
  }

  if (input.subscriptionId) {
    const [subscription] = await loadLedgerRow(client, userId, input.subscriptionId);

    if (!subscription) {
      return {
        ok: false,
        failure: {
          error: "target_not_found",
          status: 404,
          message: "That subscription is not in your ledger. Choose what this is about again.",
        },
      };
    }

    return { ok: true, target: { kind: "subscription", subscription } };
  }

  return { ok: true, target: ALL_TARGET };
}

/** The columns a capture row keeps, so the turn can be read back under its target. */
export function targetColumns(target: CaptureTarget): {
  subscription_id: string | null;
  proposal_id: string | null;
  question_id: string | null;
} {
  switch (target.kind) {
    case "all":
      return { subscription_id: null, proposal_id: null, question_id: null };
    case "subscription":
      return { subscription_id: target.subscription.id, proposal_id: null, question_id: null };
    case "proposal":
      return { subscription_id: null, proposal_id: target.proposal.id, question_id: null };
    case "question":
      return { subscription_id: null, proposal_id: null, question_id: target.question.id };
  }
}

export function targetQuestion(target: CaptureTarget): QuestionRow | null {
  return target.kind === "question" ? target.question : null;
}

/**
 * The holding a turn's candidates land on regardless of how they match, when
 * the target already names one. A question keeps its own holding.
 */
export function pinnedSubscriptionId(target: CaptureTarget): string | null {
  switch (target.kind) {
    case "all":
      return null;
    case "subscription":
      return target.subscription.id;
    case "proposal":
      return target.proposal.subscription_id;
    case "question":
      return target.question.subscription_id;
  }
}

function proposalCandidate(proposal: ProposalRow): ExtractionCandidate | null {
  const parsed = proposalPayloadSchema.safeParse(proposal.payload);

  if (!parsed.success) {
    return null;
  }

  return candidateFromPayload(parsed.data, proposal);
}

/** The provider the target is about, for reading a terse reply against it. */
export function targetProviderDisplay(target: CaptureTarget): string | null {
  switch (target.kind) {
    case "all":
      return null;
    case "subscription":
      return target.subscription.provider_display;
    case "proposal":
      return (
        target.subscription?.provider_display ??
        proposalCandidate(target.proposal)?.provider ??
        null
      );
    case "question":
      return target.question.provider_display;
  }
}

/** The resolved target as the browser keeps it, so a reload can show what is selected. */
export function describeTarget(target: CaptureTarget): TargetDescriptor {
  switch (target.kind) {
    case "all":
      return { kind: "all" };
    case "subscription":
      return {
        kind: "subscription",
        id: target.subscription.id,
        provider: target.subscription.provider_display,
      };
    case "proposal":
      return {
        kind: "proposal",
        id: target.proposal.id,
        provider: targetProviderDisplay(target) ?? "this card",
        subscriptionId: target.proposal.subscription_id,
      };
    case "question":
      return {
        kind: "question",
        id: target.question.id,
        provider: target.question.provider_display,
        question: target.question.question,
        subscriptionId: target.question.subscription_id,
      };
  }
}

export type TargetedCandidates =
  | { ok: true; candidates: ExtractionCandidate[] }
  /** The message named services other than the target: a target check, not a guess. */
  | { ok: false; conflicting: string[] };

/**
 * Reads the candidates as being about the target. A selected record or card
 * absorbs whatever the message stated about it; a name that is not the target
 * is a conflict the person must settle rather than something to file silently
 * against the record they had selected.
 */
export function applyTargetContext(
  target: CaptureTarget,
  candidates: ExtractionCandidate[],
): TargetedCandidates {
  if (target.kind === "all") {
    return { ok: true, candidates };
  }

  if (target.kind === "question") {
    return { ok: true, candidates: applyQuestionContext(target.question, candidates) };
  }

  const provider = targetProviderDisplay(target);
  const expected = provider ? canonicalProvider(provider) : null;
  const conflicting = expected
    ? candidates
        .map((candidate) => candidate.provider)
        .filter((name) => canonicalProvider(name) !== expected)
    : [];

  if (conflicting.length > 0) {
    return { ok: false, conflicting: [...new Set(conflicting)] };
  }

  const stated = candidates[0] ?? null;

  if (target.kind === "subscription") {
    return {
      ok: true,
      candidates: stated
        ? [{ ...stated, provider: target.subscription.provider_display }]
        : [],
    };
  }

  const stored = proposalCandidate(target.proposal);

  if (!stored) {
    return { ok: true, candidates: stated ? [stated] : [] };
  }

  if (!stated) {
    return { ok: true, candidates: [] };
  }

  return {
    ok: true,
    candidates: [
      overlayFields(stored, {
        ...stated,
        provider: stored.provider || stated.provider,
        accountHint: stated.accountHint ?? stored.accountHint,
      }),
    ],
  };
}
