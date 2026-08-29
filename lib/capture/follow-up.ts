import { canonicalProvider } from "@/lib/subscriptions/write";

import type { ExtractionCandidate } from "./candidates";

export type FollowUpReason = "amount" | "cadence" | "renewal" | "duplicate";

export type FollowUp = {
  reason: FollowUpReason;
  provider: string;
  question: string;
};

export type FollowUpCandidate = ExtractionCandidate & {
  /** A provider already in the ledger, so the answer decides one record or two. */
  duplicateOf?: string | null;
};

/** Identifies a question across turns, so a deferred one is not asked again. */
export function questionKey(reason: FollowUpReason, provider: string): string {
  return `${reason}:${canonicalProvider(provider)}`;
}

/**
 * One question per message, in the order that unblocks the ledger fastest: an
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
