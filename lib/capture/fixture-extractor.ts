import { CADENCES, type Cadence } from "@/lib/subscriptions/params";
import { addDays } from "@/lib/subscriptions/dates";
import { today } from "@/lib/subscriptions/query";
import { canonicalProvider } from "@/lib/subscriptions/write";

import { MAX_CANDIDATES, type ExtractionCandidate } from "./candidates";
import { readLifecycleClaim } from "./lifecycle";
import { readReactivationClaim } from "./reactivation";

/**
 * Development stand-in for the model. It is deliberately dumb: split the message
 * into segments, read a name and any price or cadence the text spells out, and
 * never invent a value. It exists so `/chat` can be clicked through without an
 * Anthropic key, and every response it produces is labelled as a fixture.
 */
export const FIXTURE_EXTRACTOR_LABEL =
  "Development fixture extractor - no Anthropic key, so this was pattern-matched, not read by Claude.";

/** Display spellings the fixtures know, so cards read like the seeded ledger. */
const FIXTURE_PROVIDERS = [
  "Netflix",
  "Spotify",
  "iCloud",
  "Claude Pro",
  "Cursor",
  "GitHub",
  "Adobe",
  "Notion",
  "1Password",
  "The Athletic",
  "Disney+",
  "Substack",
  "Linear",
  "Figma",
  "Dropbox",
  "Duolingo",
  "Strava",
  "Audible",
  "YouTube Premium",
];

const FIXTURE_PROVIDERS_BY_KEY = new Map(
  FIXTURE_PROVIDERS.map((provider) => [canonicalProvider(provider), provider]),
);

/** Leading words people type before the name; none of them are the name. */
const LEAD_INS = [
  "i just subscribed to",
  "i subscribed to",
  "i signed up for",
  "i've subscribed to",
  "i am subscribed to",
  "i'm subscribed to",
  "i pay for",
  "i'm paying for",
  "im paying for",
  "paying for",
  "subscribed to",
  "signed up for",
  "i have a",
  "i have",
  "i've got a",
  "i've got",
  "ive got",
  "i use",
  "i paid",
  "paid",
  "payment for",
  "charged for",
  "charged",
  "we pay for",
  "i have",
  "i've",
  "ive",
  "i",
  "we",
  "just",
  "my",
  "renewed",
  "also",
  "and",
];

const CADENCE_WORDS: Array<{ pattern: RegExp; cadence: Cadence }> = [
  {
    pattern: /\b(?:per|a|each|every)\s*week\b|\bweekly\b|\/\s*w(?:k|eek)?\b/i,
    cadence: "weekly",
  },
  {
    pattern:
      /\b(?:per|a|each|every)\s*month\b|\bmonthly\b|\bp\/?m\b|\/\s*mo(?:nth)?\b/i,
    cadence: "monthly",
  },
  {
    pattern:
      /\b(?:per|a|each|every)\s*(?:year|annum)\b|\byearly\b|\bannually\b|\bp\/?a\b|\/\s*(?:yr|year)\b/i,
    cadence: "yearly",
  },
];

const CURRENCY_SYMBOLS = new Map([
  ["£", "GBP"],
  ["$", "USD"],
  ["€", "EUR"],
]);

const AMOUNT_PATTERN =
  /(?:([£$€])\s*(\d+(?:[.,]\d{1,2})?)|(\d+(?:[.,]\d{1,2})?)\s*(GBP|USD|EUR|gbp|usd|eur))/;
const ISO_DATE_PATTERN = /\b(\d{4}-\d{2}-\d{2})\b/;
/** Words that say the money has already left the account. */
const PAYMENT_PATTERN = /\b(?:paid|payment|charged|billed|took)\b/i;
const RELATIVE_DAYS: Array<{ pattern: RegExp; days: number }> = [
  { pattern: /\btoday\b/i, days: 0 },
  { pattern: /\byesterday\b/i, days: -1 },
];
/**
 * Lifecycle wording, which `readLifecycleClaim` has already read. It is removed
 * before the provider is read, so "I cancelled Netflix at the end of the month"
 * names Netflix rather than the cancellation.
 */
const LIFECYCLE_NOISE =
  /\bcancel\w*\b|\bunsubscribed\b|\blapsed\b|\bexpired\b|\bran out\b|\brun out\b|\bimmediately\b|\bstraight away\b|\bright away\b|\bright now\b|\binstantly\b|\bat once\b|\beffective\b|\bas of\b|\b(?:the |my |this |current )?(?:end|last day) of (?:the |my |this |current )?(?:billing )?(?:period|month|year|term|cycle|subscription)\b|\bperiod[- ]end\b|\bruns? (?:on|through|until|till|to)\b|\bstays? (?:on|active) until\b|\buntil\b|\btill\b|\bno longer\b|\bany ?more\b|\bdo ?n'?t use\b|\bnever (?:use|watch|open)\b|\bstopped using\b|\bpayment (?:failed|bounced|declined)\b|\bcard (?:expired|declined|failed)\b|\bdid ?n'?t renew\b|\bwas ?n'?t renewed\b/gi;

/**
 * Wording that says the subscription is on again, which `readReactivationClaim`
 * has already read. Removed before the provider is read, so "I resubscribed to
 * Netflix" names Netflix rather than the restart.
 */
const REACTIVATION_NOISE =
  /\bre-?subscrib\w*\b|\bre-?activat\w*\b|\bre-?joined\b|\bre-?started\b|\bsigned back up\b|\bsigned up again\b|\bwent back\b|\bcame back\b|\bback on\b|\bagain\b/gi;

/** Whose account pays: an address, or a phrase like "the work account". */
const ACCOUNT_EMAIL_PATTERN = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/;
const ACCOUNT_PHRASE_PATTERN =
  /\b(?:on|under|using|with|via)\s+(?:the\s+|my\s+|our\s+|his\s+|her\s+|their\s+)?([\w'\u2019-]+(?:\s+[\w'\u2019-]+)?\s+account)\b/i;

const SEGMENT_SEPARATORS = /[\n\r]+|[,;•·]|(?:\s+[-–—]\s+)|\band\b/i;
const LIST_MARKER = /^\s*(?:[-*•·]|\d+[.)])\s*/;
const NOISE_SEGMENT =
  /^(?:hi|hey|hello|thanks|thank you|please|ok|okay|yes|no|here(?:'s| is)? (?:my|the) list|my subscriptions|subscriptions|list)$/i;

function toMinorUnits(raw: string): number {
  const normalized = raw.replace(",", ".");
  const [whole, fraction = ""] = normalized.split(".");

  return Number(whole) * 100 + Number(fraction.padEnd(2, "0").slice(0, 2));
}

function readAmount(segment: string) {
  const match = AMOUNT_PATTERN.exec(segment);

  if (!match) {
    return null;
  }

  const [, symbol, symbolValue, codeValue, code] = match;
  const value = symbol ? symbolValue : codeValue;

  return {
    text: match[0],
    amountMinor: toMinorUnits(value),
    currency: symbol
      ? (CURRENCY_SYMBOLS.get(symbol) ?? null)
      : code.toUpperCase(),
  };
}

/**
 * A payment already made, with the day it happened. "today" and "yesterday"
 * resolve against `now`; anything else needs an ISO date or falls back to today,
 * since the message says the payment has already happened.
 */
function readPayment(segment: string, now: Date, isoDate: string | null) {
  if (!PAYMENT_PATTERN.test(segment)) {
    return null;
  }

  for (const { pattern, days } of RELATIVE_DAYS) {
    const match = pattern.exec(segment);

    if (match) {
      return { text: match[0], paidOn: addDays(today(now), days) };
    }
  }

  return { text: null, paidOn: isoDate ?? today(now) };
}

/** The account the message names, and the words it was named in. */
function readAccountHint(
  segment: string,
): { text: string; accountHint: string } | null {
  const email = ACCOUNT_EMAIL_PATTERN.exec(segment);

  if (email) {
    return { text: email[0], accountHint: email[0] };
  }

  const phrase = ACCOUNT_PHRASE_PATTERN.exec(segment);

  return phrase ? { text: phrase[0], accountHint: phrase[1] } : null;
}

function readCadence(
  segment: string,
): { text: string; cadence: Cadence } | null {
  for (const { pattern, cadence } of CADENCE_WORDS) {
    const match = pattern.exec(segment);

    if (match && CADENCES.includes(cadence)) {
      return { text: match[0], cadence };
    }
  }

  return null;
}

function stripLeadIns(segment: string): string {
  let text = segment;
  let changed = true;

  while (changed) {
    changed = false;
    const lowered = text.toLowerCase();

    for (const leadIn of LEAD_INS) {
      if (lowered.startsWith(`${leadIn} `)) {
        text = text.slice(leadIn.length + 1).trimStart();
        changed = true;
        break;
      }
    }
  }

  return text;
}

function readProvider(
  segment: string,
): { provider: string; known: boolean } | null {
  const words = segment.split(/\s+/).filter((word) => /[a-z0-9]/i.test(word));

  /** Longest known name first, so `YouTube Premium` beats `YouTube`. */
  for (let length = Math.min(words.length, 4); length > 0; length -= 1) {
    const candidate = words.slice(0, length).join(" ");
    const known = FIXTURE_PROVIDERS_BY_KEY.get(canonicalProvider(candidate));

    if (known) {
      return { provider: known, known: true };
    }
  }

  const guess = words
    .slice(0, 3)
    .join(" ")
    .replace(/^["'“”]+|["'“”.!?:]+$/g, "")
    .trim();

  if (guess.length === 0 || guess.length > 120) {
    return null;
  }

  return { provider: guess, known: false };
}

export function extractWithFixtures(
  text: string,
  now = new Date(),
): ExtractionCandidate[] {
  const candidates: ExtractionCandidate[] = [];

  for (const rawSegment of text.split(SEGMENT_SEPARATORS)) {
    const segment = rawSegment.replace(LIST_MARKER, "").trim();

    if (segment.length === 0 || NOISE_SEGMENT.test(segment)) {
      continue;
    }

    const amount = readAmount(segment);
    const cadence = readCadence(segment);
    const isoDate = ISO_DATE_PATTERN.exec(segment);
    const payment = readPayment(segment, now, isoDate?.[1] ?? null);
    const account = readAccountHint(segment);
    let remainder = stripLeadIns(segment);

    for (const spelled of [
      amount?.text,
      cadence?.text,
      isoDate?.[0],
      payment?.text,
      account?.text,
    ]) {
      if (spelled) {
        remainder = remainder.replace(spelled, " ");
      }
    }

    const lifecycle = readLifecycleClaim(segment, now);
    const reactivated = lifecycle === null && readReactivationClaim(segment);

    remainder = stripLeadIns(
      remainder
        .replace(LIFECYCLE_NOISE, " ")
        .replace(REACTIVATION_NOISE, " ")
        .replace(/\b(?:at|for|to|renews?|on|costs?|subscriptions?)\b/gi, " ")
        .trim(),
    );

    const provider = readProvider(remainder);

    if (!provider) {
      continue;
    }

    candidates.push({
      provider: provider.provider,
      accountHint: account?.accountHint ?? null,
      amountMinor: amount?.amountMinor ?? null,
      currency: amount?.currency ?? null,
      cadence: cadence?.cadence ?? null,
      /** A stated date belongs to the payment when the message reports one. */
      nextRenewal: payment ? null : (isoDate?.[1] ?? null),
      paidOn: payment?.paidOn ?? null,
      /** "I resubscribed" says the subscription is running, and says so outright. */
      subscriptionStatus: reactivated ? "active" : null,
      /** An unqualified cancellation stays a question, so it carries no end date. */
      lifecycle:
        lifecycle === null
          ? null
          : lifecycle.claim === "ambiguous_cancel"
            ? "cancelled"
            : lifecycle.claim,
      endsOn:
        lifecycle && lifecycle.claim !== "ambiguous_cancel" ? lifecycle.endsOn : null,
      confidence: provider.known ? "high" : "low",
      evidence: segment.slice(0, 500),
    });

    if (candidates.length === MAX_CANDIDATES) {
      break;
    }
  }

  return candidates;
}
