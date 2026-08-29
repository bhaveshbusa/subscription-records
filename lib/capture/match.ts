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
>;

export type CandidateMatch = {
  strength: MatchStrength;
  subscription: LedgerEntry;
};

/** The shortest name that can stand on its own, so `hbo` matches but `bt` does not. */
const MIN_PREFIX_LENGTH = 4;

/** `net-flix` and `netflix` are one service typed two ways. */
function squash(canonical: string): string {
  return canonical.replaceAll("-", "");
}

function strengthFor(candidateKey: string, ledgerKey: string): MatchStrength | null {
  if (candidateKey === ledgerKey || squash(candidateKey) === squash(ledgerKey)) {
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
 * The best match for one candidate, or null when the service is new. Exact
 * canonical matches win over prefix ones, so a ledger holding both `Netflix`
 * and `Netflix Premium` updates the row the message actually names.
 */
export function matchCandidate(
  candidate: ExtractionCandidate,
  ledger: LedgerEntry[],
): CandidateMatch | null {
  const key = canonicalProvider(candidate.provider);

  if (key.length === 0) {
    return null;
  }

  let best: CandidateMatch | null = null;

  for (const subscription of ledger) {
    const strength = strengthFor(key, subscription.provider_canonical);

    if (strength === "high") {
      return { strength, subscription };
    }

    if (strength === "medium" && !best) {
      best = { strength, subscription };
    }
  }

  return best;
}
