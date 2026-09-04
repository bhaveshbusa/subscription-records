import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { captures, proposals, subscriptions } from "@/lib/db/schema";
import type { ProposalPayload } from "@/lib/proposals/payload";
import { toProposalView, type ProposalView } from "@/lib/proposals/projection";
import { advanceByCadence } from "@/lib/subscriptions/dates";
import type { Cadence } from "@/lib/subscriptions/params";

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
  questionCandidate,
  recordQuestion,
  rowKey,
  type QuestionRow,
} from "./questions";
import {
  differingAccount,
  isEnding,
  reactivationOf,
  type IdentityAnswer,
} from "./reactivation";

type RaisedKind =
  | "create"
  | "update"
  | "terms_changed"
  | "reactivated"
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
 * The next due date a paid-on date plus cadence implies. Null when cadence is
 * unknown, the renewal is already `confirmed`, or the stored date is still
 * after the payment — a receipt must not invent a worse schedule.
 */
export function inferredRenewalFromPaidOn(
  row: Pick<LedgerEntry, "cadence" | "next_renewal" | "renewal_field_status">,
  paidOn: string,
  cadence?: Cadence | null,
): string | null {
  const billing = cadence ?? row.cadence;

  if (!billing || row.renewal_field_status === "confirmed") {
    return null;
  }

  const next = advanceByCadence(paidOn, billing);

  return row.next_renewal !== null && row.next_renewal > paidOn ? null : next;
}

function hasPaymentEvidence(candidate: ExtractionCandidate): boolean {
  return (
    Boolean(candidate.paidOn) &&
    candidate.amountMinor !== null &&
    candidate.amountMinor !== undefined
  );
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
  } else if (hasPaymentEvidence(candidate) && candidate.paidOn) {
    const inferred = inferredRenewalFromPaidOn(row, candidate.paidOn, candidate.cadence);

    if (inferred && inferred !== row.next_renewal) {
      payload.nextRenewal = {
        value: inferred,
        status: "inferred",
        confidence: candidate.confidence,
      };
    }
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
 * A subscription that had ended, running again. It carries the status the row
 * comes back to and whatever the message says about the resumed terms, so
 * accepting it revives the record the ledger already has instead of adding a
 * second one under the same name. A receipt is current cost and next due, not a
 * payment to store; `paidOn` is the day it resumed.
 */
export function toReactivationPayload(
  candidate: ExtractionCandidate,
  row: LedgerEntry,
): ProposalPayload {
  const payload: ProposalPayload = {
    ...(toUpdatePayload(candidate, row) ?? {}),
    subscriptionStatus: {
      value: "active",
      status: "proposed",
      confidence: candidate.confidence,
    },
  };

  if (candidate.paidOn) {
    payload.effectiveFrom = candidate.paidOn;
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

type PendingProposal = {
  subscription_id: string | null;
  kind: RaisedKind | "charged";
  payload: unknown;
};

async function loadPendingProposals(
  client: CaptureClient,
  userId: string,
): Promise<PendingProposal[]> {
  return client
    .select({
      subscription_id: proposals.subscription_id,
      kind: proposals.kind,
      payload: proposals.payload,
    })
    .from(proposals)
    .where(and(eq(proposals.user_id, userId), eq(proposals.state, "pending")));
}

function samePayload(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** The same receipt typed twice must not raise a second pending terms card. */
function isDuplicatePending(pending: PendingProposal[], plan: Plan & { proposal: Raised }): boolean {
  const subscriptionId =
    plan.proposal.kind === "create" ? null : (plan.match?.subscription.id ?? null);

  return pending.some(
    (row) =>
      row.kind === plan.proposal.kind &&
      row.subscription_id === subscriptionId &&
      samePayload(row.payload, plan.proposal.payload),
  );
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
  /** A subscription coming back on an account the row does not hold. */
  accountIdentity?: { hint: string; previous: string };
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
 *
 * A subscription that had ended and is running again is that same subscription
 * once more, so it is proposed as a reactivation of the row rather than as a
 * new one. A different account under the same name is the one case that could
 * genuinely be a second subscription, so that asks.
 *
 * A receipt or "I paid" on a holding row updates holding, cost, and next due.
 * It is not a payment to store.
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

      if (
        isEnding(match.subscription.status) &&
        reactivationOf(candidate, match.subscription)
      ) {
        const accountIdentity = differingAccount(candidate, match.subscription);

        if (accountIdentity) {
          return { candidate, match, proposal: null, accountIdentity };
        }

        return {
          candidate,
          match,
          proposal: {
            kind: "reactivated" as const,
            payload: toReactivationPayload(candidate, match.subscription),
          },
        };
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
    accountIdentity: plan.accountIdentity ?? null,
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
  const captureId = await insertCapture(client, options);

  return recordExtraction(client, { ...options, captureId });
}

/**
 * The proposals a reading turns into, for a capture that is already stored. A
 * screenshot arrives this way: its row exists before anything has read it, so
 * the reading lands against the capture the upload created.
 */
export async function recordExtraction(
  client: CaptureClient,
  options: { userId: string; captureId: string; extraction: Extraction; now?: Date },
): Promise<ChatCaptureResult> {
  const now = options.now ?? new Date();
  const captureId = options.captureId;
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
  const pending = await loadPendingProposals(client, options.userId);
  const plans = planCandidates(candidates, ledger).map((plan) => {
    if (plan.proposal && isDuplicatePending(pending, { ...plan, proposal: plan.proposal })) {
      return { ...plan, proposal: null };
    }

    return plan;
  });
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
      candidate: asked?.candidate ?? null,
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
 * "Same one" or "no, a new one" answers the question a reactivation on a
 * different account asked. The message is kept, the question is closed, and the
 * answer decides which proposal it settles: the same record starting again, or
 * a second subscription of its own. Either way it is still a proposal, so the
 * ledger only moves when it is accepted.
 */
export async function recordIdentityAnswer(
  client: CaptureClient,
  options: {
    userId: string;
    text: string;
    question: QuestionRow;
    identity: IdentityAnswer;
    now?: Date;
  },
): Promise<ChatCaptureResult> {
  const now = options.now ?? new Date();
  const captureId = await insertCapture(client, options);
  const candidate = questionCandidate(options.question);
  const subscriptionId = options.question.subscription_id;
  const [row] = subscriptionId
    ? await loadLedgerRow(client, options.userId, subscriptionId)
    : [];

  await answerQuestions(client, {
    userId: options.userId,
    answered: [
      { reason: "account_identity", provider: options.question.provider_display },
    ],
    now,
  });

  const base = { captureId, mode: null, notice: null, followUp: null, deferred: null };

  if (!candidate || (options.identity === "same" && !row)) {
    return { ...base, proposals: [], matches: [] };
  }

  const revived = options.identity === "same" ? row : null;
  const [proposal] = await client
    .insert(proposals)
    .values({
      user_id: options.userId,
      subscription_id: revived?.id ?? null,
      kind: revived ? ("reactivated" as const) : ("create" as const),
      state: "pending" as const,
      payload: revived
        ? toReactivationPayload(candidate, revived)
        : toCreatePayload(candidate),
      rationale: options.text.slice(0, 500),
      confidence: candidate.confidence,
      capture_id: captureId,
    })
    .returning();

  return {
    ...base,
    proposals: [toProposalView(proposal, revived?.provider_display ?? null)],
    matches: revived
      ? [
          {
            candidateProvider: candidate.provider,
            subscriptionId: revived.id,
            provider: revived.provider_display,
            strength: "high" as const,
            proposalId: proposal.id,
            proposalKind: "reactivated" as const,
          },
        ]
      : [],
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
