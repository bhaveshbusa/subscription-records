import { canonicalProvider } from "@/lib/subscriptions/write";

/**
 * Words a billing excerpt uses in place of a service name. "Your plan
 * auto-renews on…" is about whatever plan the reader has open, not about a
 * service called Your Plan, so a name made only of these words names nothing.
 */
const GENERIC_BILLING_WORDS = new Set([
  "a",
  "an",
  "the",
  "this",
  "that",
  "these",
  "those",
  "your",
  "my",
  "our",
  "its",
  "it",
  "current",
  "existing",
  "new",
  "plan",
  "plans",
  "subscription",
  "subscriptions",
  "membership",
  "account",
  "billing",
  "bill",
  "invoice",
  "receipt",
  "payment",
  "charge",
  "price",
  "cost",
  "amount",
  "total",
  "due",
  "renewal",
  "renews",
  "renew",
  "auto",
  "next",
  "date",
  "period",
  "cycle",
  "term",
  "annual",
  "annually",
  "yearly",
  "year",
  "monthly",
  "month",
  "weekly",
  "week",
  "trial",
  "free",
  "paid",
  "and",
  "for",
  "of",
  "on",
  "at",
  "to",
  "in",
  "is",
  "per",
  "with",
]);

/** The words of a heard name that could be a service, with the billing filler taken out. */
export function specificProviderWords(provider: string): string[] {
  return canonicalProvider(provider)
    .split("-")
    .filter((word) => word.length > 0 && !GENERIC_BILLING_WORDS.has(word));
}

/** A heard name that is only billing filler: "Your plan", "next billing date", "annual plan". */
export function isGenericProviderName(provider: string): boolean {
  return specificProviderWords(provider).length === 0;
}

/**
 * Whether a heard name means the selected provider: the same name, or that
 * name with billing filler around it ("ChatGPT Your plan"). A different
 * service name is not a match.
 */
export function providerNameMatches(provider: string, expectedCanonical: string): boolean {
  if (canonicalProvider(provider) === expectedCanonical) {
    return true;
  }

  const heard = specificProviderWords(provider).join("-");

  return heard.length > 0 && heard === specificProviderWords(expectedCanonical).join("-");
}

/**
 * A heard name that is the selected provider followed by more: "Claude Pro"
 * against a selected Claude. The trailing words are a plan, not a competing
 * service - a plan is a property of the holding, so the selection keeps its
 * identity and gains the plan. A name that starts differently ("Spotify") or
 * that the selection extends ("Claude" against a selected Claude Pro) is not
 * read this way. Filler is dropped from the plan; a plan of only filler is none.
 */
export function splitPlanFromProvider(
  provider: string,
  expectedCanonical: string,
): { plan: string } | null {
  const expected = specificProviderWords(expectedCanonical);

  if (expected.length === 0) {
    return null;
  }

  const tokens = provider.split(/\s+/).filter((token) => token.length > 0);
  const planTokens: string[] = [];
  let consumed = 0;

  for (const token of tokens) {
    const words = specificProviderWords(token);

    if (consumed < expected.length) {
      if (words.length === 0) {
        continue;
      }

      const fits = words.every((word, index) => expected[consumed + index] === word);

      if (!fits || consumed + words.length > expected.length) {
        return null;
      }

      consumed += words.length;

      continue;
    }

    if (words.length > 0) {
      planTokens.push(token);
    }
  }

  return consumed === expected.length && planTokens.length > 0
    ? { plan: planTokens.join(" ") }
    : null;
}
