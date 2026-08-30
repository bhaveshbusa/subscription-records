import { canonicalProvider } from "@/lib/subscriptions/write";

import type { ExtractionCandidate } from "./candidates";

export type FollowUpReason =
  | "cancel_timing"
  | "account_identity"
  | "amount"
  | "cadence"
  | "renewal"
  | "duplicate";

export type FollowUp = {
  reason: FollowUpReason;
  provider: string;
  question: string;
};

export type FollowUpCandidate = ExtractionCandidate & {
  /** A provider already in the ledger, so the answer decides one record or two. */
  duplicateOf?: string | null;
  /**
   * The message says this was cancelled without saying when it stops, so no
   * proposal was raised for it: the answer decides which one is.
   */
  cancelTiming?: boolean;
  /**
   * The message brings a subscription that had ended back on a different
   * account, so nothing was proposed for it: the answer decides whether that is
   * the same subscription again or a second one.
   */
  accountIdentity?: { hint: string; previous: string } | null;
};

/** Identifies a question across turns, so a deferred one is not asked again. */
export function questionKey(reason: FollowUpReason, provider: string): string {
  return `${reason}:${canonicalProvider(provider)}`;
}

/**
 * One question per message, in the order that unblocks the ledger fastest: a
 * cancellation or a reactivation with no proposal behind it comes first, an
 * amount is worth more than a cadence, a cadence more than a date, and a
 * duplicate is only worth asking about once the terms are known. Questions the
 * user put off are skipped entirely rather than re-asked.
 */
export function chooseFollowUp(
  candidates: FollowUpCandidate[],
  skip: ReadonlySet<string> = new Set(),
): FollowUp | null {
  const askable = (reason: FollowUpReason, candidate: FollowUpCandidate) =>
    !skip.has(questionKey(reason, candidate.provider));

  const cancelTiming = candidates.find(
    (candidate) => candidate.cancelTiming === true && askable("cancel_timing", candidate),
  );

  if (cancelTiming) {
    return {
      reason: "cancel_timing",
      provider: cancelTiming.provider,
      question: `Did ${cancelTiming.provider} stop straight away, or does it run to the end of the period?`,
    };
  }

  const identity = candidates.find(
    (candidate) =>
      candidate.accountIdentity != null && askable("account_identity", candidate),
  );

  if (identity?.accountIdentity) {
    return {
      reason: "account_identity",
      provider: identity.provider,
      question: `Your ${identity.provider} is on ${identity.accountIdentity.previous}. Is ${identity.accountIdentity.hint} the same subscription starting again, or a new one?`,
    };
  }

  const missingAmount = candidates.find(
    (candidate) =>
      (candidate.amountMinor === null || candidate.amountMinor === undefined) &&
      askable("amount", candidate),
  );

  if (missingAmount) {
    return {
      reason: "amount",
      provider: missingAmount.provider,
      question: `How much is ${missingAmount.provider}?`,
    };
  }

  const missingCadence = candidates.find(
    (candidate) =>
      (candidate.cadence === null || candidate.cadence === undefined) &&
      askable("cadence", candidate),
  );

  if (missingCadence) {
    return {
      reason: "cadence",
      provider: missingCadence.provider,
      question: `Is ${missingCadence.provider} billed weekly, monthly, or yearly?`,
    };
  }

  const missingRenewal = candidates.find(
    (candidate) =>
      (candidate.nextRenewal === null || candidate.nextRenewal === undefined) &&
      askable("renewal", candidate),
  );

  if (missingRenewal) {
    return {
      reason: "renewal",
      provider: missingRenewal.provider,
      question: `When does ${missingRenewal.provider} renew next?`,
    };
  }

  const duplicate = candidates.find(
    (candidate) => Boolean(candidate.duplicateOf) && askable("duplicate", candidate),
  );

  if (duplicate) {
    return {
      reason: "duplicate",
      provider: duplicate.provider,
      question: `You already have ${duplicate.duplicateOf} in the ledger. Is this the same subscription?`,
    };
  }

  return null;
}
