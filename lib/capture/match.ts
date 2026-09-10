import type { StoredReminderPreference } from "@/lib/reminders/preferences";
import type { SubscriptionRow } from "@/lib/subscriptions/projection";
import { canonicalProvider } from "@/lib/subscriptions/write";

import type { ExtractionCandidate } from "./candidates";

/**
 * `high` is the same service under a different spelling, so the message updates
 * the row instead of adding a second one. `medium` is a family resemblance
 * (`Netflix Premium` next to `Netflix`), which is a question, not a decision.
 */
export type MatchStrength = "high" | "medium";

export type LedgerEntry = Pick<
  SubscriptionRow,
  | "id"
  | "provider_canonical"
  | "provider_display"
  | "status"
  | "amount_minor"
  | "currency"
  | "cadence"
  | "next_renewal"
  | "plan"
  | "account_hint"
  | "amount_field_status"
  | "cadence_field_status"
  | "renewal_field_status"
  | "status_field_status"
  | "trial_ends_on"
  | "auto_renewal"
  | "trial_end_field_status"
  | "auto_renewal_field_status"
> & {
  reminderPreferences: StoredReminderPreference[];
};

export type CandidateMatch = {
  strength: MatchStrength;
  subscription: LedgerEntry;
};

/** The shortest name that can stand on its own, so `hbo` matches but `bt` does not. */
const MIN_PREFIX_LENGTH = 4;

/** Words people type around a name that never distinguish two services. */
const FILLER_WORDS = new Set([
  "subscription",
  "subscriptions",
  "plan",
  "membership",
  "account",
  "the",
]);

/** `net-flix` and `netflix` are one service typed two ways. */
function squash(canonical: string): string {
  return canonical.replaceAll("-", "");
}

/** `ABC subscription` and `ABC` are the same service described two ways. */
function withoutFiller(canonical: string): string {
  const kept = canonical.split("-").filter((word) => !FILLER_WORDS.has(word));

  return kept.length === 0 ? canonical : kept.join("-");
}

function strengthFor(
  rawCandidateKey: string,
  rawLedgerKey: string,
): MatchStrength | null {
  const candidateKey = withoutFiller(rawCandidateKey);
  const ledgerKey = withoutFiller(rawLedgerKey);

  if (
    candidateKey === ledgerKey ||
    squash(candidateKey) === squash(ledgerKey)
  ) {
    return "high";
  }

  const [shorter, longer] =
    candidateKey.length <= ledgerKey.length
      ? [candidateKey, ledgerKey]
      : [ledgerKey, candidateKey];

  if (shorter.length >= MIN_PREFIX_LENGTH && longer.startsWith(`${shorter}-`)) {
    return "medium";
  }

  return null;
}

/**
 * Where a candidate lands against the ledger. The stable holding id is the
 * identity; provider and account are the evidence that points at it, and the
 * plan is a property of the row rather than part of who it is.
 *
 * - `matched`: exactly one compatible holding, or a weaker resemblance worth a
 *   question. A `high` match may receive an update proposal.
 * - `ambiguous`: several holdings under the name and nothing in the message to
 *   tell them apart. The turn asks rather than picking a row.
 * - `unseen_account`: the message names an account no holding under that name
 *   carries. It could be a second subscription or a change of account, so the
 *   turn asks rather than overwriting another account's row.
 * - `none`: the service is new.
 */
export type MatchResolution =
  | { outcome: "matched"; match: CandidateMatch }
  | { outcome: "ambiguous"; options: LedgerEntry[] }
  | { outcome: "unseen_account"; hint: string; holdings: LedgerEntry[] }
  | { outcome: "none" };

export function normalizeAccount(hint: string | null | undefined): string | null {
  const trimmed = hint?.trim().toLowerCase();

  return trimmed ? trimmed : null;
}

export function sameAccount(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  return normalizeAccount(left) === normalizeAccount(right);
}

/**
 * The holding a not-yet-accepted `create` is meant to become. Two drafts with
 * one key describe one intended subscription, however many times it was typed.
 */
export function draftKey(provider: string, accountHint: string | null | undefined): string {
  return `${canonicalProvider(provider)}|${normalizeAccount(accountHint) ?? ""}`;
}

/** Whether two provider names are the same service typed two ways. */
export function sameProvider(leftCanonical: string, rightCanonical: string): boolean {
  return strengthFor(leftCanonical, rightCanonical) === "high";
}

export function resolveCandidate(
  candidate: ExtractionCandidate,
  ledger: LedgerEntry[],
): MatchResolution {
  const key = canonicalProvider(candidate.provider);

  if (key.length === 0) {
    return { outcome: "none" };
  }

  const high: LedgerEntry[] = [];
  let medium: LedgerEntry | null = null;

  for (const subscription of ledger) {
    const strength = strengthFor(key, subscription.provider_canonical);

    if (strength === "high") {
      high.push(subscription);
    } else if (strength === "medium" && !medium) {
      medium = subscription;
    }
  }

  if (high.length === 0) {
    return medium
      ? { outcome: "matched", match: { strength: "medium", subscription: medium } }
      : { outcome: "none" };
  }

  const hint = candidate.accountHint?.trim();

  if (hint) {
    const named = high.filter((row) => sameAccount(row.account_hint, hint));

    if (named.length === 1) {
      return { outcome: "matched", match: { strength: "high", subscription: named[0] } };
    }

    if (named.length > 1) {
      return { outcome: "ambiguous", options: named };
    }

    /** One holding with no account noted is the account the message names. */
    if (high.length === 1 && normalizeAccount(high[0].account_hint) === null) {
      return { outcome: "matched", match: { strength: "high", subscription: high[0] } };
    }

    return { outcome: "unseen_account", hint, holdings: high };
  }

  if (high.length === 1) {
    return { outcome: "matched", match: { strength: "high", subscription: high[0] } };
  }

  return { outcome: "ambiguous", options: high };
}

/**
 * The single holding a candidate reaches, or null when it reaches none or the
 * ledger cannot say which. Exact canonical matches win over prefix ones, so a
 * ledger holding both `Netflix` and `Netflix Premium` updates the row the
 * message actually names.
 */
export function matchCandidate(
  candidate: ExtractionCandidate,
  ledger: LedgerEntry[],
): CandidateMatch | null {
  const resolution = resolveCandidate(candidate, ledger);

  return resolution.outcome === "matched" ? resolution.match : null;
}
