import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { captures, proposals, subscriptionReminderPreferences, subscriptions } from "@/lib/db/schema";
import { proposalPayloadSchema, type ProposalPayload } from "@/lib/proposals/payload";
import { toProposalView, type ProposalRow, type ProposalView } from "@/lib/proposals/projection";
import type { ProposedReminderPreferences, StoredReminderPreference } from "@/lib/reminders/preferences";
import { advanceByCadence } from "@/lib/subscriptions/dates";
import type { Cadence } from "@/lib/subscriptions/params";

import type { ExtractionCandidate } from "./candidates";
import type { Extraction } from "./extract";
import {
  isPreferenceOnly,
  preferenceAmbiguousNotice,
  preferenceOrphanNotice,
} from "./facts";
import {
  candidateScope,
  chooseFollowUp,
  identityQuestionText,
  questionKey,
  type FollowUp,
  type FollowUpCandidate,
  type FollowUpReason,
  type IdentityQuestion,
} from "./follow-up";
import {
  lifecycleOf,
  type CancelAsk,
  type CancelTiming,
  type LifecycleClaim,
} from "./lifecycle";
import {
  draftKey,
  resolveCandidate,
  sameProvider,
  toHoldingOption,
  type CandidateMatch,
  type LedgerEntry,
} from "./match";
import { newHoldingStatus, statedStatus } from "./status";
import {
  answerQuestions,
  deferQuestion,
  loadOpenQuestions,
  questionCandidate,
  recordQuestion,
  rowKey,
  type QuestionRow,
} from "./questions";
import { isEnding, reactivationOf, type IdentityAnswer } from "./reactivation";

export type RaisedKind =
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
export function toCreatePayload(
  candidate: ExtractionCandidate,
  now = new Date(),
): ProposalPayload {
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

  /**
   * Recording a subscription is telling you that you have it, so a new holding
   * starts `active` unless the message says otherwise. The card shows this and
   * accepting it establishes it; nothing here confirms a price or a date.
   */
  const status = newHoldingStatus(candidate, now);

  if (status) {
    payload.subscriptionStatus = status;
  }

  if (candidate.endsOn) {
    payload.endsOn = candidate.endsOn;
  }

  if (candidate.trialEndsOn) {
    payload.trialEndsOn = {
      value: candidate.trialEndsOn,
      status: "proposed",
      confidence: candidate.confidence,
    };
  }

  if (candidate.autoRenewal) {
    payload.autoRenewal = {
      value: candidate.autoRenewal,
      status: "proposed",
      confidence: candidate.confidence,
    };
  }

  const trial = status?.value === "trial";
  const amount =
    candidate.amountMinor !== null && candidate.amountMinor !== undefined
      ? candidate.amountMinor
      : null;

  if (amount !== null && !(trial && amount === 0)) {
    payload.amountMinor = {
      value: amount,
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

  if (candidate.nextRenewal && !trial) {
    payload.nextRenewal = {
      value: candidate.nextRenewal,
      status: "proposed",
      confidence: candidate.confidence,
    };
  }

  if (candidate.reminderPreferences) {
    payload.reminderPreferences = candidate.reminderPreferences;
  }

  if (candidate.unsupportedStageOne) {
    payload.unsupportedStageOne = candidate.unsupportedStageOne;
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

function storedReminder(
  row: LedgerEntry,
  target: "renewal" | "trial_end",
): StoredReminderPreference | undefined {
  return row.reminderPreferences.find((rowPreference) => rowPreference.target === target);
}

function reminderUnchanged(
  proposed: ProposedReminderPreferences | null | undefined,
  row: LedgerEntry,
): boolean {
  if (!proposed) {
    return true;
  }

  return (
    reminderTargetUnchanged(proposed.renewal, storedReminder(row, "renewal")) &&
    reminderTargetUnchanged(proposed.trialEnd, storedReminder(row, "trial_end"))
  );
}

function reminderTargetUnchanged(
  proposed: ProposedReminderPreferences["renewal"] | ProposedReminderPreferences["trialEnd"],
  stored: StoredReminderPreference | undefined,
): boolean {
  if (proposed === undefined) {
    return true;
  }

  if (proposed.state === "off") {
    return stored?.state === "off";
  }

  return (
    stored?.state === "enabled" &&
    stored.leadValue === proposed.leadValue &&
    stored.leadUnit === proposed.leadUnit
  );
}

function reminderPayload(
  proposed: ProposedReminderPreferences | null | undefined,
  row: LedgerEntry,
): ProposedReminderPreferences | undefined {
  if (!proposed || reminderUnchanged(proposed, row)) {
    return undefined;
  }

  const next: ProposedReminderPreferences = {};

  if (proposed.renewal && !reminderTargetUnchanged(proposed.renewal, storedReminder(row, "renewal"))) {
    next.renewal = proposed.renewal;
  }

  if (
    proposed.trialEnd &&
    !reminderTargetUnchanged(proposed.trialEnd, storedReminder(row, "trial_end"))
  ) {
    next.trialEnd = proposed.trialEnd;
  }

  return next.renewal || next.trialEnd ? next : undefined;
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
  now = new Date(),
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

  /**
   * A row the ledger already holds keeps the status it has unless the message
   * says otherwise: news about a price is not news about a lifecycle, so the
   * `active` default a new holding gets never reaches an existing one.
   */
  const status = statedStatus(candidate, now);

  if (status && status !== row.status) {
    payload.subscriptionStatus = {
      value: status,
      status: "proposed",
      confidence: candidate.confidence,
    };
  }

  if (candidate.trialEndsOn && candidate.trialEndsOn !== row.trial_ends_on) {
    payload.trialEndsOn = {
      value: candidate.trialEndsOn,
      status: "proposed",
      confidence: candidate.confidence,
    };
  }

  if (candidate.autoRenewal && candidate.autoRenewal !== row.auto_renewal) {
    payload.autoRenewal = {
      value: candidate.autoRenewal,
      status: "proposed",
      confidence: candidate.confidence,
    };
  }

  const trial = status === "trial" || (status === null && row.status === "trial");
  const amount =
    candidate.amountMinor !== null && candidate.amountMinor !== undefined
      ? candidate.amountMinor
      : null;

  if (amount !== null && amount !== row.amount_minor && !(trial && amount === 0)) {
    payload.amountMinor = {
      value: amount,
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

  if (candidate.nextRenewal && candidate.nextRenewal !== row.next_renewal && !trial) {
    payload.nextRenewal = {
      value: candidate.nextRenewal,
      status: "proposed",
      confidence: candidate.confidence,
    };
  } else if (!trial && hasPaymentEvidence(candidate) && candidate.paidOn) {
    const inferred = inferredRenewalFromPaidOn(row, candidate.paidOn, candidate.cadence);

    if (inferred && inferred !== row.next_renewal) {
      payload.nextRenewal = {
        value: inferred,
        status: "inferred",
        confidence: candidate.confidence,
      };
    }
  }

  const reminders = reminderPayload(candidate.reminderPreferences, row);

  if (reminders) {
    payload.reminderPreferences = reminders;
  }

  if (candidate.unsupportedStageOne) {
    payload.unsupportedStageOne = candidate.unsupportedStageOne;
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
  now = new Date(),
): ProposalPayload {
  const payload: ProposalPayload = {
    ...(toUpdatePayload(candidate, row, now) ?? {}),
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

function selectLedger(client: Pick<NodePgDatabase, "select">) {
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
      trial_ends_on: subscriptions.trial_ends_on,
      auto_renewal: subscriptions.auto_renewal,
      trial_end_field_status: subscriptions.trial_end_field_status,
      auto_renewal_field_status: subscriptions.auto_renewal_field_status,
    })
    .from(subscriptions);
}

export async function loadLedger(
  client: Pick<NodePgDatabase, "select">,
  userId: string,
): Promise<LedgerEntry[]> {
  const rows = await selectLedger(client)
    .where(eq(subscriptions.user_id, userId))
    .limit(MAX_LEDGER_ROWS);
  const prefs = await client
    .select({
      subscription_id: subscriptionReminderPreferences.subscription_id,
      target: subscriptionReminderPreferences.target,
      state: subscriptionReminderPreferences.state,
      leadValue: subscriptionReminderPreferences.lead_value,
      leadUnit: subscriptionReminderPreferences.lead_unit,
    })
    .from(subscriptionReminderPreferences)
    .where(eq(subscriptionReminderPreferences.user_id, userId));
  const bySubscription = new Map<string, LedgerEntry["reminderPreferences"]>();

  for (const pref of prefs) {
    const list = bySubscription.get(pref.subscription_id) ?? [];
    list.push({
      target: pref.target,
      state: pref.state,
      leadValue: pref.leadValue,
      leadUnit: pref.leadUnit,
    });
    bySubscription.set(pref.subscription_id, list);
  }

  return rows.map((row) => ({
    ...row,
    reminderPreferences: bySubscription.get(row.id) ?? [],
  }));
}

export async function loadPendingProposals(
  client: Pick<NodePgDatabase, "select">,
  userId: string,
): Promise<ProposalRow[]> {
  return client
    .select()
    .from(proposals)
    .where(and(eq(proposals.user_id, userId), eq(proposals.state, "pending")));
}

/** The holding a card about an existing row was raised against, for accept to recheck. */
export function targetOf(row: LedgerEntry): NonNullable<ProposalPayload["target"]> {
  return { providerCanonical: row.provider_canonical, accountHint: row.account_hint };
}

/** The identity a pending `create` would become, or null when its payload cannot say. */
export function pendingDraftKey(row: Pick<ProposalRow, "kind" | "payload">): string | null {
  if (row.kind !== "create") {
    return null;
  }

  const parsed = proposalPayloadSchema.safeParse(row.payload);

  if (!parsed.success || !parsed.data.provider) {
    return null;
  }

  return draftKey(parsed.data.provider.value, parsed.data.accountHint);
}

/**
 * The pending draft a new `create` describes again, if there is one. A second
 * "Figma £14 monthly" before the first card is accepted is the same intended
 * subscription, so it lands on that card rather than beside it.
 */
export function pendingDraftFor(pending: ProposalRow[], payload: ProposalPayload): ProposalRow | null {
  if (!payload.provider) {
    return null;
  }

  const key = draftKey(payload.provider.value, payload.accountHint);

  return pending.find((row) => pendingDraftKey(row) === key) ?? null;
}

export const RATIONALE_MAX = 2000;

/**
 * Folds a repeated capture into the draft it already has. New facts join the
 * card, and the message that brought them is kept in the rationale so the
 * evidence for every field stays readable; a word-for-word repeat only links the
 * card to the capture that repeated it.
 */
async function reuseDraft(
  client: CaptureClient,
  options: {
    userId: string;
    captureId: string;
    draft: ProposalRow;
    payload: ProposalPayload;
    rationale: string | null;
    now: Date;
  },
): Promise<ProposalRow> {
  const { draft } = options;
  const parsed = proposalPayloadSchema.safeParse(draft.payload);
  const existing = parsed.success ? parsed.data : {};
  const merged: ProposalPayload = { ...existing, ...options.payload };

  const unchanged = samePayload(existing, merged);
  const rationale = [draft.rationale, unchanged ? null : options.rationale]
    .filter((part): part is string => Boolean(part))
    .join("\n")
    .slice(0, RATIONALE_MAX);
  const [updated] = await client
    .update(proposals)
    .set({
      ...(unchanged ? {} : { payload: merged, rationale: rationale || null }),
      capture_id: options.captureId,
      updated_at: options.now,
    })
    .where(and(eq(proposals.user_id, options.userId), eq(proposals.id, draft.id)))
    .returning();

  return updated ?? draft;
}

function samePayload(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }

  return value;
}

/** Receipt/terms cards only: the same receipt twice must not raise a second pending card. */
const DEDUPED_KINDS = new Set<RaisedKind>(["update", "terms_changed", "reactivated"]);

function isDuplicatePending(pending: ProposalRow[], plan: Plan & { proposal: Raised }): boolean {
  if (!DEDUPED_KINDS.has(plan.proposal.kind)) {
    return false;
  }

  const subscriptionId = plan.match?.subscription.id ?? null;
  /** A card raised before targets were recorded is still the same card. */
  const withoutTarget = (payload: unknown) => {
    if (payload && typeof payload === "object" && "target" in payload) {
      return Object.fromEntries(
        Object.entries(payload).filter(([field]) => field !== "target"),
      );
    }

    return payload;
  };

  return pending.some(
    (row) =>
      row.kind === plan.proposal.kind &&
      row.subscription_id === subscriptionId &&
      samePayload(withoutTarget(row.payload), withoutTarget(plan.proposal.payload)),
  );
}

/** One row of the caller's own ledger, so a question's answer lands on it. */
export async function loadLedgerRow(
  client: Pick<NodePgDatabase, "select">,
  userId: string,
  id: string,
): Promise<LedgerEntry[]> {
  const rows = await selectLedger(client)
    .where(and(eq(subscriptions.user_id, userId), eq(subscriptions.id, id)))
    .limit(1);

  if (rows.length === 0) {
    return [];
  }

  const prefs = await client
    .select({
      target: subscriptionReminderPreferences.target,
      state: subscriptionReminderPreferences.state,
      leadValue: subscriptionReminderPreferences.lead_value,
      leadUnit: subscriptionReminderPreferences.lead_unit,
    })
    .from(subscriptionReminderPreferences)
    .where(
      and(
        eq(subscriptionReminderPreferences.user_id, userId),
        eq(subscriptionReminderPreferences.subscription_id, id),
      ),
    );

  return rows.map((row) => ({ ...row, reminderPreferences: prefs }));
}

export type Raised = { kind: RaisedKind; payload: ProposalPayload };

type Plan = {
  candidate: ExtractionCandidate;
  match: CandidateMatch | null;
  /** Absent when a high match had nothing to add. */
  proposal: Raised | null;
  /** A cancellation whose timing the turn has to ask about before proposing. */
  cancelTiming?: CancelAsk;
  /** The ledger cannot say which holding this is, so the turn asks. */
  accountIdentity?: IdentityQuestion;
  /** Preference-only capture that cannot target a holding. */
  notice?: string;
};

/** How a holding is offered in a question: by account, failing that by plan. */
export function describeHolding(row: Pick<LedgerEntry, "account_hint" | "plan">): string {
  return row.account_hint?.trim() || row.plan?.trim() || "no account noted";
}

function identityQuestionFor(
  hint: string | null,
  holdings: LedgerEntry[],
): IdentityQuestion {
  return {
    hint,
    options: holdings.map(describeHolding),
    resuming: holdings.every((row) => isEnding(row.status)),
  };
}

/**
 * What a message proposes for the one holding it reaches. Null when it has
 * nothing to add, or when it cancels without saying when (`cancelTiming` then
 * carries the question to ask).
 */
export function proposeAgainst(
  candidate: ExtractionCandidate,
  row: LedgerEntry,
  now: Date,
): { proposal: Raised | null; cancelTiming?: CancelAsk } {
  const lifecycle = lifecycleOf(candidate, now);

  if (lifecycle?.claim === "ambiguous_cancel") {
    return { proposal: null, cancelTiming: lifecycle.ask };
  }

  const target = targetOf(row);

  if (lifecycle) {
    return {
      proposal: {
        kind: lifecycle.claim,
        payload: {
          ...toLifecyclePayload(lifecycle.claim, lifecycle.endsOn, row, candidate.confidence),
          target,
        },
      },
    };
  }

  if (isEnding(row.status) && reactivationOf(candidate, row)) {
    return {
      proposal: {
        kind: "reactivated",
        payload: { ...toReactivationPayload(candidate, row, now), target },
      },
    };
  }

  const payload = toUpdatePayload(candidate, row, now);

  if (!payload) {
    return { proposal: null };
  }

  return {
    proposal: {
      kind: changesTerms(payload) ? "terms_changed" : "update",
      payload: { ...payload, target },
    },
  };
}

/**
 * A high match updates the subscription the ledger already has, so a second
 * "Netflix" never becomes Netflix #2. A weaker resemblance still proposes a new
 * record, and the follow-up question asks whether the two are the same thing.
 *
 * News about the end of a subscription outranks news about its terms: a message
 * that cancels is about the cancellation. When it does not say when the
 * subscription stopped, nothing is proposed and the turn asks, because a
 * cancellation three months ago and one that happened this morning are
 * different rows.
 *
 * A subscription that had ended and is running again is that same subscription
 * once more, so it is proposed as a reactivation of the row rather than as a
 * new one. A different account under the same name is the one case that could
 * genuinely be a second subscription, so that asks.
 *
 * A receipt or "I paid" on a holding row updates holding, cost, and next due.
 * It is not a payment to store.
 */
function planCandidates(
  candidates: ExtractionCandidate[],
  ledger: LedgerEntry[],
  now: Date,
): Plan[] {
  return candidates.map((candidate) => {
    const resolution = resolveCandidate(candidate, ledger);
    const match = resolution.outcome === "matched" ? resolution.match : null;

    if (isPreferenceOnly(candidate)) {
      if (match?.strength === "high") {
        const payload = toUpdatePayload(candidate, match.subscription, now);

        if (!payload) {
          return { candidate, match, proposal: null };
        }

        return {
          candidate,
          match,
          proposal: {
            kind: "update" as const,
            payload: { ...payload, target: targetOf(match.subscription) },
          },
        };
      }

      if (match?.strength === "medium") {
        return {
          candidate,
          match,
          proposal: null,
          notice: preferenceAmbiguousNotice(match.subscription.provider_display),
        };
      }

      if (resolution.outcome === "ambiguous" || resolution.outcome === "unseen_account") {
        return {
          candidate,
          match: null,
          proposal: null,
          notice: preferenceAmbiguousNotice(candidate.provider),
        };
      }

      return {
        candidate,
        match: null,
        proposal: null,
        notice: preferenceOrphanNotice(candidate.provider),
      };
    }

    if (resolution.outcome === "ambiguous") {
      return {
        candidate,
        match: null,
        proposal: null,
        accountIdentity: identityQuestionFor(null, resolution.options),
      };
    }

    if (resolution.outcome === "unseen_account") {
      return {
        candidate,
        match: null,
        proposal: null,
        accountIdentity: identityQuestionFor(resolution.hint, resolution.holdings),
      };
    }

    if (match?.strength === "high") {
      return { candidate, match, ...proposeAgainst(candidate, match.subscription, now) };
    }

    return {
      candidate,
      match,
      proposal: { kind: "create" as const, payload: toCreatePayload(candidate, now) },
    };
  });
}

/**
 * What the message answers. A field the ledger already holds counts too: the
 * question was about the subscription, not about this sentence.
 */
function toFollowUpCandidate(plan: Plan, now: Date): FollowUpCandidate {
  const row = plan.match?.strength === "high" ? plan.match.subscription : null;
  const preferenceOnly = isPreferenceOnly(plan.candidate);

  return {
    ...plan.candidate,
    amountMinor: plan.candidate.amountMinor ?? row?.amount_minor ?? null,
    cadence: plan.candidate.cadence ?? row?.cadence ?? null,
    nextRenewal: plan.candidate.nextRenewal ?? row?.next_renewal ?? null,
    duplicateOf:
      !preferenceOnly && plan.match?.strength === "medium"
        ? plan.match.subscription.provider_display
        : null,
    cancelTiming: plan.cancelTiming,
    accountIdentity: plan.accountIdentity ?? null,
    subscriptionId: row?.id ?? null,
    preferenceOnly,
    skipRenewalQuestion:
      statedStatus(plan.candidate, now) === "trial" || row?.status === "trial",
  };
}

function answeredBy(candidates: FollowUpCandidate[], now: Date) {
  const answered: { reason: FollowUpReason; scope: string }[] = [];

  for (const candidate of candidates) {
    const scope = candidateScope(candidate);

    if (candidate.amountMinor !== null && candidate.amountMinor !== undefined) {
      answered.push({ reason: "amount", scope });
    }

    if (candidate.cadence) {
      answered.push({ reason: "cadence", scope });
    }

    if (candidate.nextRenewal) {
      answered.push({ reason: "renewal", scope });
    }

    /** A cancellation that now says when it stops answers the timing question. */
    if (candidate.cancelTiming == null && lifecycleOf(candidate, now)) {
      answered.push({ reason: "cancel_timing", scope });
    }
  }

  return answered;
}

export async function insertCapture(
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

  if (candidates.length === 0) {
    return {
      captureId,
      mode: options.extraction.mode,
      notice: options.extraction.notice,
      proposals: [],
      matches: [],
      followUp: null,
      deferred: null,
    };
  }

  const ledger = await loadLedger(client, options.userId);
  const pending = await loadPendingProposals(client, options.userId);
  const plans = planCandidates(candidates, ledger, now).map((plan) => {
    if (plan.proposal && isDuplicatePending(pending, { ...plan, proposal: plan.proposal })) {
      return { ...plan, proposal: null };
    }

    return plan;
  });
  const planNotice = plans
    .map((plan) => plan.notice)
    .filter((notice): notice is string => Boolean(notice))
    .join(" ");
  const base = {
    captureId,
    mode: options.extraction.mode,
    notice: [options.extraction.notice, planNotice || null].filter(Boolean).join(" ") || null,
    deferred: null,
  };
  const raised = plans.filter(
    (plan): plan is Plan & { proposal: Raised } => plan.proposal !== null,
  );
  const reused = new Map<Plan, ProposalRow>();

  /** A `create` that describes a draft already waiting lands on that card. */
  for (const plan of raised) {
    if (plan.proposal.kind !== "create") {
      continue;
    }

    const draft = pendingDraftFor(pending, plan.proposal.payload);

    if (draft) {
      reused.set(
        plan,
        await reuseDraft(client, {
          userId: options.userId,
          captureId,
          draft,
          payload: plan.proposal.payload,
          rationale: plan.candidate.evidence,
          now,
        }),
      );
    }
  }

  const fresh = raised.filter((plan) => !reused.has(plan));
  const inserted = fresh.length
    ? await client
        .insert(proposals)
        .values(
          fresh.map((plan) => ({
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
  const rowsByPlan = new Map<Plan, ProposalRow>([
    ...reused,
    ...fresh.map((plan, index): [Plan, ProposalRow] => [plan, inserted[index]]),
  ]);
  const proposalIds = new Map<Plan, string | null>(
    raised.map((plan) => [plan, rowsByPlan.get(plan)?.id ?? null]),
  );
  const views = raised.flatMap((plan) => {
    const row = rowsByPlan.get(plan);

    if (!row) {
      return [];
    }

    /** A weaker resemblance stays an offer on the card: "Use existing …" retargets it. */
    const likelyMatches =
      plan.proposal.kind === "create" && plan.match?.strength === "medium"
        ? [toHoldingOption(plan.match.subscription)]
        : [];

    return [
      toProposalView(row, plan.match?.subscription.provider_display ?? null, likelyMatches),
    ];
  });
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

  const followUpCandidates = plans.map((plan) => toFollowUpCandidate(plan, now));
  const answered = answeredBy(followUpCandidates, now);
  const answeredKeys = new Set(answered.map((entry) => questionKey(entry.reason, entry.scope)));
  const open = await loadOpenQuestions(client, options.userId);
  /** Nothing already on the table is asked twice, and "later" is honoured. */
  const skip = new Set(open.map(rowKey).filter((key) => !answeredKeys.has(key)));

  await answerQuestions(client, { userId: options.userId, answered, now });

  /** One question, about this turn. Overdue rows are Inbox's to ask about. */
  const followUp = chooseFollowUp(followUpCandidates, skip);

  if (followUp) {
    const asked = plans.find(
      (plan, index) => candidateScope(followUpCandidates[index]) === followUp.scope,
    );

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
    answered: [{ reason: "cancel_timing", scope: options.question.scope_key }],
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
      payload: {
        ...toLifecyclePayload(options.timing.claim, options.timing.endsOn, row, "high"),
        target: targetOf(row),
      },
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

/** The holdings an open identity question is choosing between, as the ledger reads now. */
async function identityHoldings(
  client: CaptureClient,
  userId: string,
  question: QuestionRow,
): Promise<LedgerEntry[]> {
  const ledger = await loadLedger(client, userId);

  return ledger.filter((row) => sameProvider(question.provider_canonical, row.provider_canonical));
}

/**
 * The ways an identity question can be answered by naming a holding: each row's
 * account, or plan. The chat route reads the reply against these, so "the
 * family one" reaches the family row without a round trip through extraction.
 */
export async function identityChoices(
  client: CaptureClient,
  userId: string,
  question: QuestionRow,
): Promise<string[]> {
  const holdings = await identityHoldings(client, userId, question);

  return holdings.map(describeHolding);
}

/**
 * "Same one", "the family one", or "no, a new one" answers the question the
 * ledger asked when it could not say which holding a message was about. The
 * message is kept and the answer decides which proposal it settles: a change to
 * the holding named (an account move, a reactivation, new terms), or a second
 * subscription of its own. Either way it is still a proposal, so the ledger only
 * moves when it is accepted. An answer that still leaves several holdings in
 * play keeps the question open and asks it again.
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
  const { question } = options;
  const candidate = questionCandidate(question);
  const base = { captureId, mode: null, notice: null, followUp: null, deferred: null };
  const answer = { reason: "account_identity" as const, scope: question.scope_key };

  const holdings = candidate ? await identityHoldings(client, options.userId, question) : [];

  if (!candidate || (options.identity !== "new" && holdings.length === 0)) {
    await answerQuestions(client, { userId: options.userId, answered: [answer], now });

    return { ...base, proposals: [], matches: [] };
  }

  let target: LedgerEntry | null = null;

  if (options.identity === "same") {
    if (holdings.length !== 1) {
      return {
        ...base,
        proposals: [],
        matches: [],
        followUp: {
          reason: "account_identity",
          provider: question.provider_display,
          scope: question.scope_key,
          question: identityQuestionText(
            question.provider_display,
            identityQuestionFor(candidate.accountHint ?? null, holdings),
          ),
        },
      };
    }

    target = holdings[0];
  } else if (options.identity !== "new") {
    const chosen = options.identity.option.toLowerCase();
    const named = holdings.filter((row) => describeHolding(row).toLowerCase() === chosen);

    if (named.length !== 1) {
      return {
        ...base,
        proposals: [],
        matches: [],
        followUp: {
          reason: "account_identity",
          provider: question.provider_display,
          scope: question.scope_key,
          question: question.question,
        },
      };
    }

    target = named[0];
  }

  await answerQuestions(client, { userId: options.userId, answered: [answer], now });

  const rationale = options.text.slice(0, 500);

  if (!target) {
    const pending = await loadPendingProposals(client, options.userId);
    const payload = toCreatePayload(candidate, now);
    const draft = pendingDraftFor(pending, payload);
    const row = draft
      ? await reuseDraft(client, {
          userId: options.userId,
          captureId,
          draft,
          payload,
          rationale,
          now,
        })
      : (
          await client
            .insert(proposals)
            .values({
              user_id: options.userId,
              subscription_id: null,
              kind: "create" as const,
              state: "pending" as const,
              payload,
              rationale,
              confidence: candidate.confidence,
              capture_id: captureId,
            })
            .returning()
        )[0];

    return { ...base, proposals: [toProposalView(row, null)], matches: [] };
  }

  const { proposal } = proposeAgainst(candidate, target, now);

  if (!proposal) {
    return {
      ...base,
      proposals: [],
      matches: [
        {
          candidateProvider: candidate.provider,
          subscriptionId: target.id,
          provider: target.provider_display,
          strength: "high" as const,
          proposalId: null,
          proposalKind: null,
        },
      ],
    };
  }

  const [row] = await client
    .insert(proposals)
    .values({
      user_id: options.userId,
      subscription_id: target.id,
      kind: proposal.kind,
      state: "pending" as const,
      payload: proposal.payload,
      rationale,
      confidence: candidate.confidence,
      capture_id: captureId,
    })
    .returning();

  return {
    ...base,
    proposals: [toProposalView(row, target.provider_display)],
    matches: [
      {
        candidateProvider: candidate.provider,
        subscriptionId: target.id,
        provider: target.provider_display,
        strength: "high" as const,
        proposalId: row.id,
        proposalKind: proposal.kind,
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
