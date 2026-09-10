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

const FOLLOW_UP_RANK: Record<FollowUpReason, number> = {
  cancel_timing: 0,
  account_identity: 1,
  amount: 2,
  cadence: 3,
  renewal: 4,
  duplicate: 5,
  still_holding: 6,
};

function compareFollowUps(left: FollowUp, right: FollowUp): number {
  return FOLLOW_UP_RANK[left.reason] - FOLLOW_UP_RANK[right.reason];
}

/**
 * One next question per incomplete holding or draft in this message, in the
 * order that unblocks the ledger fastest: a cancellation or a reactivation
 * with no proposal behind it comes first, an amount is worth more than a
 * cadence, a cadence more than a date, and a duplicate is only worth asking
 * about once the terms are known. Questions the user put off are skipped
 * entirely rather than re-asked. The composer still shows the first of these;
 * Inbox lists every one.
 */
export function chooseFollowUps(
  candidates: FollowUpCandidate[],
  skip: ReadonlySet<string> = new Set(),
): FollowUp[] {
  const seen = new Set(skip);
  const followUps: FollowUp[] = [];

  for (const candidate of candidates) {
    const followUp = chooseFollowUpFor(candidate, seen);

    if (!followUp) {
      continue;
    }

    followUps.push(followUp);
    seen.add(questionKey(followUp.reason, followUp.scope));
  }

  return followUps
    .map((followUp, index) => ({ followUp, index }))
    .sort(
      (left, right) =>
        compareFollowUps(left.followUp, right.followUp) || left.index - right.index,
    )
    .map((entry) => entry.followUp);
}

/** The one useful next question to show on the composer for this turn. */
export function chooseFollowUp(
  candidates: FollowUpCandidate[],
  skip: ReadonlySet<string> = new Set(),
): FollowUp | null {
  return chooseFollowUps(candidates, skip)[0] ?? null;
}

function chooseFollowUpFor(
  candidate: FollowUpCandidate,
  skip: ReadonlySet<string>,
): FollowUp | null {
  const askable = (reason: FollowUpReason) =>
    !skip.has(questionKey(reason, candidateScope(candidate)));

  if (candidate.cancelTiming != null && askable("cancel_timing")) {
    return {
      reason: "cancel_timing",
      provider: candidate.provider,
      scope: candidateScope(candidate),
      question:
        candidate.cancelTiming === "now_or_period"
          ? `Did ${candidate.provider} stop straight away, or does it run to the end of the period?`
          : `When did ${candidate.provider} stop?`,
    };
  }

  if (candidate.accountIdentity != null && askable("account_identity")) {
    return {
      reason: "account_identity",
      provider: candidate.provider,
      scope: candidateScope(candidate),
      question: identityQuestionText(candidate.provider, candidate.accountIdentity),
    };
  }

  if (
    !candidate.preferenceOnly &&
    (candidate.amountMinor === null || candidate.amountMinor === undefined) &&
    askable("amount")
  ) {
    return {
      reason: "amount",
      provider: candidate.provider,
      scope: candidateScope(candidate),
      question: `How much is ${candidate.provider}?`,
    };
  }

  if (
    !candidate.preferenceOnly &&
    (candidate.cadence === null || candidate.cadence === undefined) &&
    askable("cadence")
  ) {
    return {
      reason: "cadence",
      provider: candidate.provider,
      scope: candidateScope(candidate),
      question: `Is ${candidate.provider} billed weekly, monthly, or yearly?`,
    };
  }

  if (
    !candidate.preferenceOnly &&
    !candidate.skipRenewalQuestion &&
    (candidate.nextRenewal === null || candidate.nextRenewal === undefined) &&
    askable("renewal")
  ) {
    return {
      reason: "renewal",
      provider: candidate.provider,
      scope: candidateScope(candidate),
      question: `When does ${candidate.provider} renew next?`,
    };
  }

  if (candidate.duplicateOf && askable("duplicate")) {
    return {
      reason: "duplicate",
      provider: candidate.provider,
      scope: candidateScope(candidate),
      question: `You already have ${candidate.duplicateOf} in the ledger. Is this the same subscription?`,
    };
  }

  return null;
}
