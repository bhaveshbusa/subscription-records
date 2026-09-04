import { calendarDateSchema } from "@/lib/subscriptions/params";
import { calendarToday } from "@/lib/subscriptions/dates";
import { readPastEventDate } from "@/lib/subscriptions/relative-date";

import type { ExtractionCandidate } from "./candidates";

/** What a message says has happened to a subscription's life, once resolved. */
export const LIFECYCLE_CLAIMS = ["cancelled", "cancel_scheduled", "lapsed"] as const;

export type LifecycleClaim = (typeof LIFECYCLE_CLAIMS)[number];

/** What to ask when a cancellation does not say when it took effect. */
export type CancelAsk = "when" | "now_or_period";

/**
 * A cancellation with no timing in it. "I cancelled Netflix" is true of a
 * subscription that stopped last spring and of one that stopped this morning,
 * so the turn asks **when** rather than choosing. "I just cancelled Netflix"
 * is the recent-cancel exception: still this session, so it asks immediately
 * versus period end.
 */
export type LifecycleIntent =
  | { claim: LifecycleClaim; endsOn: string | null }
  | { claim: "ambiguous_cancel"; ask: CancelAsk };

/**
 * Wanting to cancel, or not using the thing, is not a cancellation. These read
 * as cancellation words to a pattern matcher and to a model, so they are checked
 * first and drop the claim entirely rather than downgrading it.
 */
const INTENT_ONLY_PATTERN =
  /\b(?:should|need to|needs to|want to|wanna|ought to|going to|gonna|will|must|might|may|could|thinking of|thinking about|planning to|plan to|about to|meant to|mean to|keep meaning to|remember to|remind me to|considering|tempted to)\s+(?:just\s+)?cancel\w*\b|\bcancel\w*\s+(?:it|this|that|them)?\s*(?:soon|later|next month|tomorrow|at some point|eventually)\b|\bhaven'?t\s+cancel\w*\b|\bnot\s+cancel\w*\b/i;

/**
 * Words that say the subscription was cancelled. Disuse is deliberately absent:
 * "I never watch it" matches nothing here, so it can never end a subscription.
 */
const CANCELLED_PATTERN =
  /\bcancel(?:led|ed|s|led it|ling)?\b|\bcancellation\b|\bended (?:my|the|it)\b|\bunsubscribed\b|\bclosed (?:my|the) (?:account|subscription|membership)\b|\bbinned (?:it|off)\b/i;

/** Words that put the end of the subscription at the end of what was paid for. */
const PERIOD_END_PATTERN =
  /\bat\s+(?:the\s+)?period[- ]end\b|\bend of (?:the |my |this |current )?(?:billing )?(?:period|month|year|term|cycle|subscription)\b|\bruns? (?:on |through |until |till |to )\b|\bstays? (?:on|active) until\b|\buntil\s+(?:the\s+)?(?:end|\d|renewal)\b|\btill\s+(?:the\s+)?(?:end|\d)\b|\bstill (?:have|get) (?:it|access)\b|\beffective (?:at |from )?(?:the )?(?:end|renewal)\b|\bfrom (?:the )?next (?:renewal|billing)\b|\bcancel[- ]at[- ]period[- ]end\b/i;

/** Words that put the end of the subscription on the day of the message. */
const IMMEDIATE_PATTERN =
  /\b(?:immediately|straight away|right away|right now|there and then|on the spot|instantly|at once|effective (?:today|now)|from today|as of today|today|just now|already gone|no longer have access|lost access)\b/i;

/**
 * A cancellation that happened in this conversation, with no date. That is the
 * one case where immediately versus period end is still the right question.
 */
const RECENT_CANCEL_PATTERN = /\bjust (?:now )?cancel\w*\b/i;

/** Billing that stopped without anyone cancelling: a card that stopped paying. */
const LAPSED_PATTERN =
  /\blapsed\b|\bexpired\b|\bran out\b|\brun out\b|\bwas ?n'?t renewed\b|\bdid ?n'?t renew\b|\bfailed to renew\b|\bpayment (?:failed|bounced|was declined|declined)\b|\bcard (?:expired|was declined|declined|failed)\b/i;

const ISO_DATE_PATTERN = /\b(\d{4}-\d{2}-\d{2})\b/;

function readDate(text: string): string | null {
  const match = ISO_DATE_PATTERN.exec(text);

  if (!match) {
    return null;
  }

  return calendarDateSchema.safeParse(match[1]).success ? match[1] : null;
}

function datedCancel(text: string, now: Date): { claim: LifecycleClaim; endsOn: string } | null {
  const on = calendarToday(now);
  const past = readPastEventDate(text, now);

  if (past) {
    return { claim: "cancelled", endsOn: past };
  }

  const iso = readDate(text);

  if (iso && iso > on) {
    return { claim: "cancel_scheduled", endsOn: iso };
  }

  return null;
}

/**
 * What the words say happened, from the message itself. A stated cancellation
 * with no when is `ambiguous_cancel`: the answer decides the day it stopped. A
 * past date in the same sentence is enough, and is `cancelled` rather than a
 * question. Intent and disuse return null, so "I really should cancel Netflix"
 * and "I never watch Netflix" leave the status alone.
 */
export function readLifecycleClaim(text: string, now = new Date()): LifecycleIntent | null {
  if (INTENT_ONLY_PATTERN.test(text)) {
    return null;
  }

  if (LAPSED_PATTERN.test(text)) {
    return { claim: "lapsed", endsOn: readPastEventDate(text, now) ?? readDate(text) };
  }

  if (!CANCELLED_PATTERN.test(text)) {
    return null;
  }

  if (PERIOD_END_PATTERN.test(text)) {
    return { claim: "cancel_scheduled", endsOn: readDate(text) };
  }

  const dated = datedCancel(text, now);

  if (dated) {
    return dated;
  }

  if (IMMEDIATE_PATTERN.test(text)) {
    return { claim: "cancelled", endsOn: readDate(text) };
  }

  return {
    claim: "ambiguous_cancel",
    ask: RECENT_CANCEL_PATTERN.test(text) ? "now_or_period" : "when",
  };
}

function claimFromEndsOn(endsOn: string, now: Date): LifecycleClaim {
  return endsOn <= calendarToday(now) ? "cancelled" : "cancel_scheduled";
}

/**
 * The lifecycle the extractor settled on for one candidate. A model that fills
 * in `subscriptionStatus` instead of `lifecycle` is read the same way, and both
 * are re-checked against the evidence, so a status of `cancelled` on "I keep
 * meaning to cancel" is dropped rather than trusted.
 */
export function lifecycleOf(
  candidate: ExtractionCandidate,
  now = new Date(),
): LifecycleIntent | null {
  const claimed =
    candidate.lifecycle ??
    (candidate.subscriptionStatus === "cancelled" ||
    candidate.subscriptionStatus === "cancel_scheduled" ||
    candidate.subscriptionStatus === "lapsed"
      ? candidate.subscriptionStatus
      : null);

  if (!claimed) {
    return null;
  }

  const fromWords = readLifecycleClaim(candidate.evidence, now);

  if (!fromWords) {
    return null;
  }

  /**
   * The extractor read the whole message, so its claim wins over the pattern —
   * except on timing, where the words are the only evidence of when the
   * subscription ends. A past `endsOn` is a cancellation that already happened,
   * not a scheduled one.
   */
  if (fromWords.claim === "ambiguous_cancel") {
    if (candidate.endsOn) {
      return { claim: claimFromEndsOn(candidate.endsOn, now), endsOn: candidate.endsOn };
    }

    return claimed === "cancel_scheduled"
      ? { claim: "cancel_scheduled", endsOn: null }
      : fromWords;
  }

  return { claim: fromWords.claim, endsOn: candidate.endsOn ?? fromWords.endsOn };
}

/**
 * The status a message may move the subscription to, with lifecycle claims the
 * words do not support dropped: a `cancelled` status on "I keep meaning to
 * cancel" is not a cancellation, and an unqualified one is a question, so
 * neither reaches a payload. Non-lifecycle statuses pass through.
 */
export function trustedStatus(
  candidate: ExtractionCandidate,
  now = new Date(),
): ExtractionCandidate["subscriptionStatus"] {
  const lifecycle = lifecycleOf(candidate, now);

  if (lifecycle) {
    return lifecycle.claim === "ambiguous_cancel" ? null : lifecycle.claim;
  }

  const claimed = candidate.subscriptionStatus;

  return claimed && (LIFECYCLE_CLAIMS as readonly string[]).includes(claimed)
    ? null
    : (claimed ?? null);
}

export type CancelTiming = { claim: "cancelled" | "cancel_scheduled"; endsOn: string | null };

/** Short enough that it can only be the answer, whatever words it uses. */
const TERSE_REPLY_LENGTH = 30;

/**
 * The answer to an open cancellation question, when the message is only that
 * answer. A message that goes on to cancel something of its own goes to the
 * extractor instead, so "I cancelled Spotify at the end of the month" is not
 * read as an answer about Netflix.
 */
export function readCancelTimingReply(
  text: string,
  provider: string,
  now = new Date(),
): CancelTiming | null {
  const trimmed = text.trim();
  const ownClaim =
    (CANCELLED_PATTERN.test(trimmed) || LAPSED_PATTERN.test(trimmed)) &&
    trimmed.length > TERSE_REPLY_LENGTH &&
    !trimmed.toLowerCase().includes(provider.toLowerCase());

  return ownClaim ? null : readCancelTiming(trimmed, now);
}

/**
 * The answer to "when did it stop?" or "now, or at the end of the period?".
 * Read from a bare reply, so "three months ago", "end of the month", and
 * "straight away" all settle the open question without repeating the name.
 * A past date is `cancelled`; a future one is `cancel_scheduled`.
 */
export function readCancelTiming(text: string, now = new Date()): CancelTiming | null {
  if (INTENT_ONLY_PATTERN.test(text)) {
    return null;
  }

  if (PERIOD_END_PATTERN.test(text) || /\bperiod end\b|\bat the end\b/i.test(text)) {
    return { claim: "cancel_scheduled", endsOn: readDate(text) };
  }

  if (IMMEDIATE_PATTERN.test(text) || /\bnow\b/i.test(text)) {
    return { claim: "cancelled", endsOn: readPastEventDate(text, now) ?? readDate(text) };
  }

  const past = readPastEventDate(text, now);

  if (past) {
    return { claim: "cancelled", endsOn: past };
  }

  const date = readDate(text);

  if (!date) {
    return null;
  }

  return date <= calendarToday(now)
    ? { claim: "cancelled", endsOn: date }
    : { claim: "cancel_scheduled", endsOn: date };
}
