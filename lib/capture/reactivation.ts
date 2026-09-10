import type { ExtractionCandidate } from "./candidates";
import { lifecycleOf, trustedStatus } from "./lifecycle";
import type { LedgerEntry } from "./match";

/** Statuses of a subscription that has stopped billing. */
const ENDED_STATUSES = ["cancelled"] as const;

/** Those, plus one that is on its way out but still billing until its end date. */
const ENDING_STATUSES = [...ENDED_STATUSES, "cancel_scheduled"] as const;

type Status = LedgerEntry["status"];

export function hasEnded(status: Status): boolean {
  return (ENDED_STATUSES as readonly string[]).includes(status);
}

export function isEnding(status: Status): boolean {
  return (ENDING_STATUSES as readonly string[]).includes(status);
}

/**
 * Words that say a subscription is on again. Wanting it back is not having it
 * back, so intent is dropped the same way it is for a cancellation.
 */
const RESUBSCRIBED_PATTERN =
  /\bre-?subscrib\w*\b|\bre-?activat\w*\b|\bre-?joined\b|\bre-?started\b|\bsubscribed again\b|\bsigned (?:back )?up (?:again|for it again)\b|\bsigned back up\b|\bstarted (?:it |them )?(?:back )?up again\b|\bpicked (?:it |them )?(?:back )?up again\b|\bback on (?:it|them)?\b|\bi'?m back on\b|\bwent back to\b|\bcame back to\b|\bgot (?:it|them) back\b|\btook it out again\b/i;

const INTENT_ONLY_PATTERN =
  /\b(?:should|need to|needs to|want to|wanna|ought to|going to|gonna|will|must|might|may|could|thinking of|thinking about|planning to|plan to|about to|meant to|mean to|considering|tempted to)\s+(?:just\s+)?re-?(?:subscribe|activate|join|start)\w*\b|\bhaven'?t\s+re-?(?:subscribed|activated|joined)\b/i;

/** Whether the words themselves say the subscription is running again. */
export function readReactivationClaim(text: string): boolean {
  return !INTENT_ONLY_PATTERN.test(text) && RESUBSCRIBED_PATTERN.test(text);
}

/**
 * Whether a message about a subscription that had ended says it is back. A
 * payment counts, because money leaving the account for a cancelled service is
 * the service running again — but only once it has actually stopped, since a
 * cancellation that runs to the end of the period is still expected to bill.
 * A message that ends the subscription again is not a reactivation.
 */
export function reactivationOf(
  candidate: ExtractionCandidate,
  row: Pick<LedgerEntry, "status">,
): boolean {
  if (!isEnding(row.status) || lifecycleOf(candidate)) {
    return false;
  }

  if (readReactivationClaim(candidate.evidence)) {
    return true;
  }

  const status = trustedStatus(candidate);

  if (status === "active" || status === "trial") {
    return true;
  }

  return hasEnded(row.status) && Boolean(candidate.paidOn);
}

/** "Same", "new", or one of the holdings the question offered, by its label. */
export type IdentityAnswer = "same" | "new" | { option: string };

/** Short enough that it can only be the answer, whatever words it uses. */
const TERSE_REPLY_LENGTH = 60;

const NEW_PATTERN =
  /\bnot the same\b|\bdifferent\b|\bnew (?:one|account|sub\w*)?\b|\banother\b|\bseparate\b|\bsecond\b/i;
const SAME_PATTERN = /\bsame\b|\bthat'?s the one\b|\bmine\b|\byes\b|\byep\b|\byeah\b/i;
const NO_PATTERN = /\bno\b|\bnope\b/i;

/**
 * The answer to "which subscription is this, or is it a new one?". A reply that
 * names one of the holdings on offer (by account or plan) picks it; otherwise
 * "same" and "new" are read as words. A longer message that names neither the
 * provider nor a holding is describing something of its own, so it goes to the
 * extractor instead of settling the question.
 */
export function readIdentityReply(
  text: string,
  provider: string,
  options: readonly string[] = [],
): IdentityAnswer | null {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  const named = options.filter((option) => lower.includes(option.toLowerCase()));

  if (named.length === 1) {
    return { option: named[0] };
  }

  const namesProvider = lower.includes(provider.toLowerCase());

  if (trimmed.length > TERSE_REPLY_LENGTH && !namesProvider) {
    return null;
  }

  if (NEW_PATTERN.test(trimmed)) {
    return "new";
  }

  if (SAME_PATTERN.test(trimmed)) {
    return "same";
  }

  return NO_PATTERN.test(trimmed) ? "new" : null;
}
