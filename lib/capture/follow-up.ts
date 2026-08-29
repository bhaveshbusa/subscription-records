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

/**
 * One question per message, in the order that unblocks the ledger fastest: an
 * amount is worth more than a cadence, a cadence more than a date, and a
 * duplicate is only worth asking about once the terms are known.
 */
export function chooseFollowUp(candidates: FollowUpCandidate[]): FollowUp | null {
  const missingAmount = candidates.find(
    (candidate) => candidate.amountMinor === null || candidate.amountMinor === undefined,
  );

  if (missingAmount) {
    return {
      reason: "amount",
      provider: missingAmount.provider,
      question: `How much is ${missingAmount.provider}?`,
    };
  }

  const missingCadence = candidates.find(
    (candidate) => candidate.cadence === null || candidate.cadence === undefined,
  );

  if (missingCadence) {
    return {
      reason: "cadence",
      provider: missingCadence.provider,
      question: `Is ${missingCadence.provider} billed weekly, monthly, or yearly?`,
    };
  }

  const missingRenewal = candidates.find(
    (candidate) => candidate.nextRenewal === null || candidate.nextRenewal === undefined,
  );

  if (missingRenewal) {
    return {
      reason: "renewal",
      provider: missingRenewal.provider,
      question: `When does ${missingRenewal.provider} renew next?`,
    };
  }

  const duplicate = candidates.find((candidate) => Boolean(candidate.duplicateOf));

  if (duplicate) {
    return {
      reason: "duplicate",
      provider: duplicate.provider,
      question: `You already have ${duplicate.duplicateOf} in the ledger. Is this the same subscription?`,
    };
  }

  return null;
}
