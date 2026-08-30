import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { captures, proposals, subscriptions } from "@/lib/db/schema";
import { chatChargeKey } from "@/lib/proposals/charge";
import type { ProposalPayload } from "@/lib/proposals/payload";
import { toProposalView, type ProposalView } from "@/lib/proposals/projection";

import type { ExtractionCandidate } from "./candidates";
import type { Extraction } from "./extract";
import {
  chooseFollowUp,
  questionKey,
  type FollowUp,
  type FollowUpCandidate,
  type FollowUpReason,
} from "./follow-up";
import {
  lifecycleOf,
  trustedStatus,
  type CancelTiming,
  type LifecycleClaim,
} from "./lifecycle";
import { matchCandidate, type CandidateMatch, type LedgerEntry } from "./match";
import {
  answerQuestions,
  deferQuestion,
  loadOpenQuestions,
  recordQuestion,
  rowKey,
  type QuestionRow,
} from "./questions";

type RaisedKind =
  | "create"
  | "update"
  | "charged"
  | "terms_changed"
  | LifecycleClaim;

/** Insert, select, and update on one connection, so a route can hand over a transaction. */
export type CaptureClient = Pick<NodePgDatabase, "select" | "insert" | "update">;

export const CHAT_CAPTURE_SOURCE = "chat";

/** A personal ledger, so every row is readable; a runaway one still is not. */
const MAX_LEDGER_ROWS = 500;

/** A candidate the ledger already knows, and what the message did about it. */
export type CaptureMatch = {
  candidateProvider: string;
  subscriptionId: string;
  provider: string;
  strength: CandidateMatch["strength"];
  /** The proposal raised for it, or null when the message said nothing new. */
  proposalId: string | null;
  proposalKind: RaisedKind | null;
};

export type ChatCaptureResult = {
  captureId: string;
  mode: Extraction["mode"] | null;
  notice: string | null;
  proposals: ProposalView[];
  matches: CaptureMatch[];
  followUp: FollowUp | null;
  /** The question this message put off, when that is all it did. */
  deferred: { reason: FollowUpReason; provider: string; question: string } | null;
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

  const status = trustedStatus(candidate);

  if (status) {
    payload.subscriptionStatus = {
      value: status,
      status: "proposed",
      confidence: candidate.confidence,
    };
  }

  if (candidate.endsOn) {
    payload.endsOn = candidate.endsOn;
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

/**
 * A payment against a subscription the ledger already has. The amount paid is
 * carried as a charge rather than as a new price, so accepting the card records
 * what left the account without touching the recorded terms. Null when the
 * message did not say what was paid: a charge without an amount is not a charge.
 */
export function toChargePayload(
  candidate: ExtractionCandidate,
  row: LedgerEntry,
): ProposalPayload | null {
  if (
    !candidate.paidOn ||
    candidate.amountMinor === null ||
    candidate.amountMinor === undefined
  ) {
    return null;
  }

  const currency = candidate.currency ?? row.currency;

  return {
    charge: {
      paidOn: candidate.paidOn,
      amountMinor: candidate.amountMinor,
      currency,
      idempotencyKey: chatChargeKey({
        subscriptionId: row.id,
        paidOn: candidate.paidOn,
        amountMinor: candidate.amountMinor,
        currency,
      }),
    },
  };
}

/**
 * What the message adds to a row the ledger already has. Identity is left alone
 * — the subscription is already named — and a field the row already holds with
 * the same value is not re-proposed, so an `update` card only shows news. Null
 * when the message repeats what is already recorded.
 */
export function toUpdatePayload(
  candidate: ExtractionCandidate,
  row: LedgerEntry,
): ProposalPayload | null {
  const payload: ProposalPayload = {};

  if (candidate.plan && candidate.plan !== row.plan) {
    payload.plan = candidate.plan;
  }

  if (candidate.accountHint && candidate.accountHint !== row.account_hint) {
    payload.accountHint = candidate.accountHint;
  }

  if (candidate.currency && candidate.currency !== row.currency) {
    payload.currency = candidate.currency;
  }

  const status = trustedStatus(candidate);

  if (status && status !== row.status) {
    payload.subscriptionStatus = {
      value: status,
      status: "proposed",
      confidence: candidate.confidence,
    };
  }

  if (
    candidate.amountMinor !== null &&
    candidate.amountMinor !== undefined &&
    candidate.amountMinor !== row.amount_minor
  ) {
    payload.amountMinor = {
      value: candidate.amountMinor,
      status: "proposed",
      confidence: candidate.confidence,
    };
  }

  if (candidate.cadence && candidate.cadence !== row.cadence) {
    payload.cadence = {
      value: candidate.cadence,
      status: "proposed",
      confidence: candidate.confidence,
    };
  }

  if (candidate.nextRenewal && candidate.nextRenewal !== row.next_renewal) {
    payload.nextRenewal = {
      value: candidate.nextRenewal,
      status: "proposed",
      confidence: candidate.confidence,
    };
  }

  return Object.keys(payload).length === 0 ? null : payload;
}

/**
 * A lifecycle move on a subscription the ledger already has. It carries the new
 * status and, for a cancellation that runs on, the day it stops — nothing else,
 * so accepting it cannot quietly rewrite the price. The row is not named in the
 * payload: identity stays the ledger's, which is what keeps a cancelled Netflix
 * the same Netflix.
 */
export function toLifecyclePayload(
  claim: LifecycleClaim,
  endsOn: string | null,
  row: LedgerEntry,
  confidence: ExtractionCandidate["confidence"],
): ProposalPayload {
  const payload: ProposalPayload = {
    subscriptionStatus: { value: claim, status: "proposed", confidence },
  };
  /** A period that was paid for ends when it was next going to be billed. */
  const ends = endsOn ?? (claim === "cancel_scheduled" ? row.next_renewal : null);

  if (ends) {
    payload.endsOn = ends;
  }

  return payload;
}

/**
 * News about the price, the billing frequency, or the plan is a change of terms:
 * accepting it closes the amendment that held the old figure and opens a new
 * one. Anything else — an account hint, a renewal date — is a plain update to
 * the terms already in force.
 */
function changesTerms(payload: ProposalPayload): boolean {
  return (
    payload.amountMinor !== undefined ||
    payload.cadence !== undefined ||
    payload.plan !== undefined ||
    payload.currency !== undefined
  );
}

function selectLedger(client: CaptureClient) {
  return client
    .select({
      id: subscriptions.id,
      provider_canonical: subscriptions.provider_canonical,
      provider_display: subscriptions.provider_display,
      status: subscriptions.status,
      amount_minor: subscriptions.amount_minor,
      currency: subscriptions.currency,
      cadence: subscriptions.cadence,
      next_renewal: subscriptions.next_renewal,
      plan: subscriptions.plan,
      account_hint: subscriptions.account_hint,
      amount_field_status: subscriptions.amount_field_status,
      cadence_field_status: subscriptions.cadence_field_status,
      renewal_field_status: subscriptions.renewal_field_status,
      status_field_status: subscriptions.status_field_status,
    })
    .from(subscriptions);
}

async function loadLedger(client: CaptureClient, userId: string): Promise<LedgerEntry[]> {
  return selectLedger(client)
    .where(eq(subscriptions.user_id, userId))
    .limit(MAX_LEDGER_ROWS);
}

/** One row of the caller's own ledger, so a question's answer lands on it. */
async function loadLedgerRow(
  client: CaptureClient,
  userId: string,
  id: string,
): Promise<LedgerEntry[]> {
  return selectLedger(client)
    .where(and(eq(subscriptions.user_id, userId), eq(subscriptions.id, id)))
    .limit(1);
}

type Raised = { kind: RaisedKind; payload: ProposalPayload };

type Plan = {
  candidate: ExtractionCandidate;
  match: CandidateMatch | null;
  /** Absent when a high match had nothing to add. */
  proposal: Raised | null;
  /** A cancellation whose timing the turn has to ask about before proposing. */
  cancelTiming?: boolean;
};

/**
 * A high match updates the subscription the ledger already has, so a second
 * "Netflix" never becomes Netflix #2. A weaker resemblance still proposes a new
 * record, and the follow-up question asks whether the two are the same thing.
 *
 * News about the end of a subscription outranks news about its terms: a message
 * that cancels is about the cancellation. When it does not say whether the
 * subscription stopped now or runs to the end of the period, nothing is proposed
 * and the turn asks, because those are two different rows.
 */
function planCandidates(candidates: ExtractionCandidate[], ledger: LedgerEntry[]): Plan[] {
  return candidates.map((candidate) => {
    const match = matchCandidate(candidate, ledger);

    if (match?.strength === "high") {
      const lifecycle = lifecycleOf(candidate);

      if (lifecycle?.claim === "ambiguous_cancel") {
        return { candidate, match, proposal: null, cancelTiming: true };
      }

      if (lifecycle) {
        return {
          candidate,
          match,
          proposal: {
            kind: lifecycle.claim,
            payload: toLifecyclePayload(
              lifecycle.claim,
              lifecycle.endsOn,
              match.subscription,
              candidate.confidence,
            ),
          },
        };
      }

      const charge = toChargePayload(candidate, match.subscription);

      if (charge) {
        return { candidate, match, proposal: { kind: "charged" as const, payload: charge } };
      }

      const payload = toUpdatePayload(candidate, match.subscription);

      if (!payload) {
        return { candidate, match, proposal: null };
      }

      return {
        candidate,
        match,
        proposal: {
          kind: changesTerms(payload) ? ("terms_changed" as const) : ("update" as const),
          payload,
        },
      };
    }

    return {
      candidate,
      match,
      proposal: { kind: "create" as const, payload: toCreatePayload(candidate) },
    };
  });
}

/**
 * What the message answers. A field the ledger already holds counts too: the
 * question was about the subscription, not about this sentence.
 */
function toFollowUpCandidate(plan: Plan): FollowUpCandidate {
  const row = plan.match?.strength === "high" ? plan.match.subscription : null;

  return {
    ...plan.candidate,
    amountMinor: plan.candidate.amountMinor ?? row?.amount_minor ?? null,
    cadence: plan.candidate.cadence ?? row?.cadence ?? null,
    nextRenewal: plan.candidate.nextRenewal ?? row?.next_renewal ?? null,
    duplicateOf:
      plan.match?.strength === "medium" ? plan.match.subscription.provider_display : null,
    cancelTiming: plan.cancelTiming === true,
  };
}

function answeredBy(candidates: FollowUpCandidate[]) {
  const answered: { reason: FollowUpReason; provider: string }[] = [];

  for (const candidate of candidates) {
    if (candidate.amountMinor !== null && candidate.amountMinor !== undefined) {
      answered.push({ reason: "amount", provider: candidate.provider });
    }

    if (candidate.cadence) {
      answered.push({ reason: "cadence", provider: candidate.provider });
    }

    if (candidate.nextRenewal) {
      answered.push({ reason: "renewal", provider: candidate.provider });
    }

    /** A cancellation that now says when it stops answers the timing question. */
    if (candidate.cancelTiming !== true && lifecycleOf(candidate)) {
      answered.push({ reason: "cancel_timing", provider: candidate.provider });
    }
  }

  return answered;
}

async function insertCapture(
  client: CaptureClient,
  options: { userId: string; text: string },
): Promise<string> {
  const [capture] = await client
    .insert(captures)
    .values({
      user_id: options.userId,
      kind: "text",
      source: CHAT_CAPTURE_SOURCE,
      content: options.text,
    })
    .returning({ id: captures.id });

  return capture.id;
}

/**
 * Stores the message, one pending proposal per candidate, and the question the
 * turn asks. It never touches `subscriptions`: a row appears or changes there
 * only when someone accepts a proposal, which is what keeps the ledger theirs.
 */
export async function recordChatCapture(
  client: CaptureClient,
  options: { userId: string; text: string; extraction: Extraction; now?: Date },
): Promise<ChatCaptureResult> {
  const now = options.now ?? new Date();
  const captureId = await insertCapture(client, options);
  const candidates = options.extraction.candidates;
  const base = {
    captureId,
    mode: options.extraction.mode,
    notice: options.extraction.notice,
    deferred: null,
  };

  if (candidates.length === 0) {
    return { ...base, proposals: [], matches: [], followUp: null };
  }

  const ledger = await loadLedger(client, options.userId);
  const plans = planCandidates(candidates, ledger);
  const raised = plans.filter(
    (plan): plan is Plan & { proposal: Raised } => plan.proposal !== null,
  );
  const rows = raised.length
    ? await client
        .insert(proposals)
        .values(
          raised.map((plan) => ({
            user_id: options.userId,
            subscription_id:
              plan.proposal.kind === "create" ? null : (plan.match?.subscription.id ?? null),
            kind: plan.proposal.kind,
            state: "pending" as const,
            payload: plan.proposal.payload,
            rationale: plan.candidate.evidence,
            confidence: plan.candidate.confidence,
            capture_id: captureId,
          })),
        )
        .returning()
    : [];
  const proposalIds = new Map<Plan, string | null>(
    raised.map((plan, index) => [plan, rows[index]?.id ?? null]),
  );
  const views = rows.map((row, index) =>
    toProposalView(row, raised[index]?.match?.subscription.provider_display ?? null),
  );
  const matches = plans
    .filter((plan): plan is Plan & { match: CandidateMatch } => plan.match !== null)
    .map((plan) => ({
      candidateProvider: plan.candidate.provider,
      subscriptionId: plan.match.subscription.id,
      provider: plan.match.subscription.provider_display,
      strength: plan.match.strength,
      proposalId: proposalIds.get(plan) ?? null,
      proposalKind: plan.proposal?.kind ?? null,
    }));

  const followUpCandidates = plans.map(toFollowUpCandidate);
  const answered = answeredBy(followUpCandidates);
  const answeredKeys = new Set(
    answered.map((entry) => questionKey(entry.reason, entry.provider)),
  );
  const open = await loadOpenQuestions(client, options.userId);
  /** Nothing already on the table is asked twice, and "later" is honoured. */
  const skip = new Set(open.map(rowKey).filter((key) => !answeredKeys.has(key)));

  await answerQuestions(client, { userId: options.userId, answered, now });

  const followUp = chooseFollowUp(followUpCandidates, skip);

  if (followUp) {
    const asked = plans.find((plan) => plan.candidate.provider === followUp.provider);

    await recordQuestion(client, {
      userId: options.userId,
      captureId,
      followUp,
      subscriptionId: asked?.match?.subscription.id ?? null,
      now,
    });
  }

  return { ...base, proposals: views, matches, followUp };
}

/**
 * "At the end of the month" is an answer to an open cancellation question, not a
 * new subscription. The message is kept, the question is closed, and the
 * cancellation it settles is raised as a proposal against the row the question
 * was about — still pending, so the status only moves when it is accepted.
 */
export async function recordCancelTimingAnswer(
  client: CaptureClient,
  options: {
    userId: string;
    text: string;
    question: QuestionRow;
    timing: CancelTiming;
    now?: Date;
  },
): Promise<ChatCaptureResult> {
  const now = options.now ?? new Date();
  const captureId = await insertCapture(client, options);
  const subscriptionId = options.question.subscription_id;
  const [row] = subscriptionId
    ? await loadLedgerRow(client, options.userId, subscriptionId)
    : [];

  await answerQuestions(client, {
    userId: options.userId,
    answered: [{ reason: "cancel_timing", provider: options.question.provider_display }],
    now,
  });

  const base = {
    captureId,
    mode: null,
    notice: null,
    followUp: null,
    deferred: null,
  };

  if (!row) {
    return { ...base, proposals: [], matches: [] };
  }

  const [proposal] = await client
    .insert(proposals)
    .values({
      user_id: options.userId,
      subscription_id: row.id,
      kind: options.timing.claim,
      state: "pending" as const,
      payload: toLifecyclePayload(
        options.timing.claim,
        options.timing.endsOn,
        row,
        "high",
      ),
      rationale: options.text.slice(0, 500),
      confidence: "high" as const,
      capture_id: captureId,
    })
    .returning();

  return {
    ...base,
    proposals: [toProposalView(proposal, row.provider_display)],
    matches: [
      {
        candidateProvider: row.provider_display,
        subscriptionId: row.id,
        provider: row.provider_display,
        strength: "high" as const,
        proposalId: proposal.id,
        proposalKind: options.timing.claim,
      },
    ],
  };
}

/**
 * "I'll tell you later" is not a subscription. The message is still kept, the
 * outstanding question is put off, and no extractor runs over a non-answer.
 */
export async function recordChatDeferral(
  client: CaptureClient,
  options: { userId: string; text: string; question: QuestionRow; now?: Date },
): Promise<ChatCaptureResult> {
  const now = options.now ?? new Date();
  const captureId = await insertCapture(client, options);

  await deferQuestion(client, { userId: options.userId, question: options.question, now });

  return {
    captureId,
    mode: null,
    notice: null,
    proposals: [],
    matches: [],
    followUp: null,
    deferred: {
      reason: options.question.reason,
      provider: options.question.provider_display,
      question: options.question.question,
    },
  };
}
