import type { ProposedReminderPreferences } from "@/lib/reminders/preferences";
import type { ReminderLeadUnit } from "@/lib/reminders/dates";
import type { AutoRenewal } from "@/lib/subscriptions/params";
import { readStatedCalendarDate } from "@/lib/subscriptions/relative-date";

import type { ExtractionCandidate } from "./candidates";

export const UNSUPPORTED_STAGE_ONE_REASONS = [
  "paid_trial",
  "different_payment_start",
] as const;

export type UnsupportedStageOneReason = (typeof UNSUPPORTED_STAGE_ONE_REASONS)[number];

export type UnsupportedStageOne = {
  reason: UnsupportedStageOneReason;
  detail: string;
};

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

const INTENT_REMINDER_PATTERN =
  /\bremind me to cancel\b|\breminder to cancel\b/i;

const TRIAL_PATTERN = /\btrial\b/i;

const TRIAL_END_PATTERN =
  /\btrial\s+(?:ends?|ending|expires?|expiry)\b|\bends?\s+(?:on\s+)?(?:the\s+)?trial\b/i;

const AUTO_RENEW_YES =
  /\bauto[- ]renew(?:s|al)?(?:\s+is)?\s+on\b|\bauto[- ]renews\b|\bautomatically renews\b|\bauto[- ]renew(?:al)?(?:\s+is)?\s+(?:enabled|yes)\b/i;

const AUTO_RENEW_NO =
  /\bauto[- ]renew(?:s|al)?(?:\s+is)?\s+off\b|\bdoes not auto[- ]renew\b|\bno auto[- ]renew(?:al)?\b|\bauto[- ]renew(?:al)?(?:\s+is)?\s+(?:disabled|no)\b/i;

const PAID_TRIAL_PATTERN =
  /\bpaid trial\b|\btrial (?:for|at|of|costs?)\s*[£$€]?\s*\d|\b[£$€]\s*\d+(?:[.,]\d{1,2})?\s*(?:for\s+(?:the\s+)?)?trial\b/i;

const FIRST_PAYMENT_PATTERN =
  /\bfirst (?:payment|charge|bill)(?:\s+(?:on|from|starts?))?\b|\bpayment starts?\s+(?:on|from)\b/i;

const REMINDER_OFF_PATTERN =
  /\bturn(?:ing)?(?:\s+(?:that|the|my))?(?:\s+\w+)?\s+reminder off\b|\bdon'?t remind me\b|\bno reminder\b|\breminder off\b/i;

const REMINDER_ENABLE_PATTERN =
  /\bremind me\b|\breminder\b/i;

const LEAD_PATTERN =
  /\b(a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+)\s+(days?|weeks?|months?)\s+before\b/i;

function parseCount(raw: string): number | null {
  if (/^\d+$/.test(raw)) {
    return Number(raw);
  }

  return NUMBER_WORDS[raw.toLowerCase()] ?? null;
}

export function isTrialCandidate(candidate: Pick<ExtractionCandidate, "subscriptionStatus" | "trialEndsOn">) {
  return candidate.subscriptionStatus === "trial" || Boolean(candidate.trialEndsOn);
}

export function isPreferenceOnly(candidate: ExtractionCandidate): boolean {
  const prefs = candidate.reminderPreferences;

  if (!prefs || (prefs.renewal === undefined && prefs.trialEnd === undefined)) {
    return false;
  }

  return (
    !candidate.plan &&
    !candidate.accountHint &&
    candidate.amountMinor == null &&
    !candidate.currency &&
    !candidate.cadence &&
    !candidate.nextRenewal &&
    !candidate.paidOn &&
    !candidate.subscriptionStatus &&
    !candidate.lifecycle &&
    !candidate.endsOn &&
    !candidate.trialEndsOn &&
    !candidate.autoRenewal
  );
}

export function readTrialStatus(segment: string): "trial" | null {
  return TRIAL_PATTERN.test(segment) ? "trial" : null;
}

export function readTrialEndsOn(segment: string, now: Date): string | null {
  if (!TRIAL_END_PATTERN.test(segment) && !TRIAL_PATTERN.test(segment)) {
    return null;
  }

  return readStatedCalendarDate(segment, now);
}

export function readAutoRenewal(segment: string): AutoRenewal | null {
  if (AUTO_RENEW_YES.test(segment)) {
    return "yes";
  }

  if (AUTO_RENEW_NO.test(segment)) {
    return "no";
  }

  return null;
}

function reminderTarget(segment: string): "renewal" | "trialEnd" {
  return /\btrial\b/i.test(segment) ? "trialEnd" : "renewal";
}

function leadFromWords(
  segment: string,
  target: "renewal" | "trialEnd",
): { leadValue: number; leadUnit: ReminderLeadUnit } {
  const lead = LEAD_PATTERN.exec(segment);

  if (!lead) {
    if (target === "trialEnd") {
      return { leadValue: 3, leadUnit: "days" };
    }

    return { leadValue: 1, leadUnit: "months" };
  }

  const count = parseCount(lead[1]);
  const unit = lead[2].toLowerCase();

  if (count === null || count < 1) {
    if (target === "trialEnd") {
      return { leadValue: 3, leadUnit: "days" };
    }

    return { leadValue: 1, leadUnit: "months" };
  }

  if (unit.startsWith("month")) {
    return { leadValue: count, leadUnit: "months" };
  }

  const days = unit.startsWith("week") ? count * 7 : count;

  return { leadValue: days, leadUnit: "days" };
}

export function readReminderPreferences(segment: string): ProposedReminderPreferences | null {
  if (INTENT_REMINDER_PATTERN.test(segment)) {
    return null;
  }

  const target = reminderTarget(segment);

  if (REMINDER_OFF_PATTERN.test(segment)) {
    return target === "trialEnd" ? { trialEnd: { state: "off" } } : { renewal: { state: "off" } };
  }

  if (!REMINDER_ENABLE_PATTERN.test(segment)) {
    return null;
  }

  const lead = leadFromWords(segment, target);
  const enabled = { state: "enabled" as const, leadValue: lead.leadValue, leadUnit: lead.leadUnit };

  return target === "trialEnd" ? { trialEnd: enabled } : { renewal: enabled };
}

export function readUnsupportedStageOne(
  segment: string,
  trialEndsOn: string | null,
  now: Date,
): UnsupportedStageOne | null {
  if (PAID_TRIAL_PATTERN.test(segment)) {
    return {
      reason: "paid_trial",
      detail:
        "Stage one models trials as free. The paid-plan amount after trial is kept; a current trial charge is outside this model. Reject and recapture, or enter the rest by hand.",
    };
  }

  const firstPaymentPhrase = FIRST_PAYMENT_PATTERN.exec(segment);

  if (!firstPaymentPhrase) {
    return null;
  }

  const firstPayment = readStatedCalendarDate(segment.slice(firstPaymentPhrase.index), now);

  if (firstPayment && trialEndsOn && firstPayment !== trialEndsOn) {
    return {
      reason: "different_payment_start",
      detail:
        "Stage one starts paid service at trial end if you continue. A later first-payment date is outside this model and was not rewritten. Reject and recapture, or enter the rest by hand.",
    };
  }

  return null;
}

export function preferenceOrphanNotice(provider: string): string {
  return `There's no ${provider} in the ledger to attach this reminder to. Add it first, or edit the record by hand.`;
}

export function preferenceAmbiguousNotice(provider: string): string {
  return `This reminder looks like your existing ${provider}. Recapture with the exact name, or set it on that record by hand.`;
}
