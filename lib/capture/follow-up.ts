import type { ExtractionCandidate } from "./candidates";
import type { CancelAsk } from "./lifecycle";
import { draftKey } from "./match";

export type FollowUpReason =
  | "cancel_timing"
  | "account_identity"
  | "still_holding"
  | "amount"
  | "cadence"
  | "renewal"
  | "duplicate";

export type FollowUp = {
  reason: FollowUpReason;
  provider: string;
  /** The holding or draft the question is about; see `holdingScope` / `draftScope`. */
  scope: string;
  question: string;
};

/** A follow-up that has been written to `capture_questions`, so later turns can name it. */
export type RecordedFollowUp = FollowUp & { id: string };

/**
 * What a question is about, so that two accounts at one provider carry their
 * own questions. A question about a row in the ledger is scoped to that row's
 * stable id; one about a subscription that does not exist yet is scoped to the
 * draft it would become, which is the provider plus the account named.
 */
export function holdingScope(subscriptionId: string): string {
  return `holding:${subscriptionId}`;
}

export function draftScope(provider: string, accountHint?: string | null): string {
  return `draft:${draftKey(provider, accountHint)}`;
}

/**
 * Why the ledger cannot say which holding a message is about. `options` are the
 * rows it could be, described by account (or plan, or a placeholder when neither
 * is noted), in the order they should be offered.
 */
export type IdentityQuestion = {
  /** The account the message named, when no holding under that name carries it. */
  hint: string | null;
  options: string[];
  /** Every option has ended, so "same" means the subscription is starting again. */
  resuming: boolean;
};

export type FollowUpCandidate = ExtractionCandidate & {
  /** A provider already in the ledger, so the answer decides one record or two. */
  duplicateOf?: string | null;
  /**
   * The message says this was cancelled without saying when it stops, so no
   * proposal was raised for it: `when` asks which day, `now_or_period` asks
   * immediately versus the end of what was paid for.
   */
  cancelTiming?: CancelAsk;
  /**
   * The message reaches several holdings at once, or names an account none of
   * them carries, so nothing was proposed for it: the answer picks the holding,
   * moves one to the new account, or says it is a new subscription.
   */
  accountIdentity?: IdentityQuestion | null;
  /** The holding the candidate reached, when it reached exactly one. */
  subscriptionId?: string | null;
  /** A reminder instruction without other facts must not prompt for price. */
  preferenceOnly?: boolean;
  /** Trials use trial end, not next renewal, as the payment-start boundary. */
  skipRenewalQuestion?: boolean;
};

/** Identifies a question across turns, so a deferred one is not asked again. */
export function questionKey(reason: FollowUpReason, scope: string): string {
  return `${reason}:${scope}`;
}

export function candidateScope(
  candidate: Pick<FollowUpCandidate, "provider" | "accountHint" | "subscriptionId">,
): string {
  return candidate.subscriptionId
    ? holdingScope(candidate.subscriptionId)
    : draftScope(candidate.provider, candidate.accountHint);
}

/**
 * Scopes a reply can close. A question asked against a pending create stays at
 * draft scope after that card is accepted, so answering the holding must close
 * that same question rather than leave it hanging or ask it again under the
 * holding key.
 */
export function answerScopes(
  candidate: Pick<FollowUpCandidate, "provider" | "accountHint" | "subscriptionId">,
): string[] {
  const current = candidateScope(candidate);

  if (!candidate.subscriptionId) {
    return [current];
  }

  const draft = draftScope(candidate.provider, candidate.accountHint);

  return draft === current ? [current] : [current, draft];
}

function listOptions(options: string[]): string {
  if (options.length <= 1) {
    return options[0] ?? "";
  }

  return `${options.slice(0, -1).join(", ")} or ${options[options.length - 1]}`;
}

export function identityQuestionText(provider: string, identity: IdentityQuestion): string {
  const listed = listOptions(identity.options);

  if (identity.hint) {
    return identity.resuming
      ? `Your ${provider} was on ${listed}. Is ${identity.hint} the same subscription starting again, or a new one?`
      : `Your ${provider} is on ${listed}. Is ${identity.hint} a change of account, or a second subscription?`;
  }

  return `You have ${provider} on ${listed}. Which one is this, or is it a new one?`;
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
    !skip.has(questionKey(reason, candidateScope(candidate)));

  const cancelTiming = candidates.find(
    (candidate) => candidate.cancelTiming != null && askable("cancel_timing", candidate),
  );

  if (cancelTiming) {
    return {
      reason: "cancel_timing",
      provider: cancelTiming.provider,
      scope: candidateScope(cancelTiming),
      question:
        cancelTiming.cancelTiming === "now_or_period"
          ? `Did ${cancelTiming.provider} stop straight away, or does it run to the end of the period?`
          : `When did ${cancelTiming.provider} stop?`,
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
      scope: candidateScope(identity),
      question: identityQuestionText(identity.provider, identity.accountIdentity),
    };
  }

  const missingAmount = candidates.find(
    (candidate) =>
      !candidate.preferenceOnly &&
      (candidate.amountMinor === null || candidate.amountMinor === undefined) &&
      askable("amount", candidate),
  );

  if (missingAmount) {
    return {
      reason: "amount",
      provider: missingAmount.provider,
      scope: candidateScope(missingAmount),
      question: `How much is ${missingAmount.provider}?`,
    };
  }

  const missingCadence = candidates.find(
    (candidate) =>
      !candidate.preferenceOnly &&
      (candidate.cadence === null || candidate.cadence === undefined) &&
      askable("cadence", candidate),
  );

  if (missingCadence) {
    return {
      reason: "cadence",
      provider: missingCadence.provider,
      scope: candidateScope(missingCadence),
      question: `Is ${missingCadence.provider} billed weekly, monthly, or yearly?`,
    };
  }

  const missingRenewal = candidates.find(
    (candidate) =>
      !candidate.preferenceOnly &&
      !candidate.skipRenewalQuestion &&
      (candidate.nextRenewal === null || candidate.nextRenewal === undefined) &&
      askable("renewal", candidate),
  );

  if (missingRenewal) {
    return {
      reason: "renewal",
      provider: missingRenewal.provider,
      scope: candidateScope(missingRenewal),
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
      scope: candidateScope(duplicate),
      question: `You already have ${duplicate.duplicateOf} in the ledger. Is this the same subscription?`,
    };
  }

  return null;
}
