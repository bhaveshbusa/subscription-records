import { calendarToday } from "@/lib/subscriptions/dates";
import type { SubscriptionStatus } from "@/lib/subscriptions/params";

import type { ExtractionCandidate } from "./candidates";
import { lifecycleOf, trustedStatus } from "./lifecycle";

/**
 * What someone is telling you when they record a subscription: that they have
 * it. This is a holding ledger, not a list of services worth exploring, so a
 * bare name is a holding — `active` — and a missing price or date says nothing
 * about that. [SUB-60](https://linear.app/lets-play-match/issue/SUB-60/interpret-new-subscriptions-as-active-and-current-trials-as-trial)
 */
export const DEFAULT_NEW_HOLDING_STATUS = "active" as const;

/** The status of a new holding, and how much of a reading it is. */
export type InterpretedStatus = {
  value: SubscriptionStatus;
  /** `proposed` when the message says it; `inferred` when it is the default. */
  status: "proposed" | "inferred";
  confidence: ExtractionCandidate["confidence"] | null;
};

/**
 * Whether the message describes a trial the person is on **now**. A trial with
 * no end date stated is still a current trial — "these are my trial
 * subscriptions" is a statement about today. A trial whose stated end has
 * already passed is history: it says what the subscription was, not what it is,
 * so it does not make a current trial of it.
 *
 * This reads the date the message states. A `trial_ends_on` already stored on a
 * row is weaker evidence and never reclassifies it; nothing here looks at one.
 */
export function isCurrentTrial(
  candidate: Pick<ExtractionCandidate, "trialEndsOn">,
  now: Date,
): boolean {
  return !candidate.trialEndsOn || candidate.trialEndsOn >= calendarToday(now);
}

/**
 * The status the message itself states, with nothing filled in. A lifecycle
 * claim the words do not support is already dropped by `trustedStatus`, and a
 * trial that has ended is not a current one.
 *
 * This is what an **existing** row is offered: a price on a subscription the
 * ledger already holds is news about its price, not about whether it is a trial,
 * so a message that says nothing about status changes nothing.
 */
export function statedStatus(
  candidate: ExtractionCandidate,
  now = new Date(),
): SubscriptionStatus | null {
  const trusted = trustedStatus(candidate, now);

  if (trusted === "trial") {
    return isCurrentTrial(candidate, now) ? "trial" : null;
  }

  if (trusted) {
    return trusted;
  }

  return candidate.trialEndsOn && isCurrentTrial(candidate, now) ? "trial" : null;
}

/**
 * The status a **new** holding starts at. What the message states wins; with
 * nothing stated it is `active`, labelled `inferred` because it is read from the
 * act of recording a subscription rather than from any words.
 *
 * `null` — which lands the row `unknown` — is kept for input that genuinely
 * cannot be read: a cancellation whose timing the message does not settle is a
 * question, and answering it by calling the subscription active would be
 * inventing the answer.
 */
export function newHoldingStatus(
  candidate: ExtractionCandidate,
  now = new Date(),
): InterpretedStatus | null {
  const stated = statedStatus(candidate, now);

  if (stated) {
    return { value: stated, status: "proposed", confidence: candidate.confidence };
  }

  if (lifecycleOf(candidate, now)?.claim === "ambiguous_cancel") {
    return null;
  }

  return {
    value: DEFAULT_NEW_HOLDING_STATUS,
    status: "inferred",
    /** A default is not a reading of the message, so it claims no confidence. */
    confidence: null,
  };
}
