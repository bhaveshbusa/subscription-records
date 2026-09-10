import { canonicalProvider } from "@/lib/subscriptions/write";

import type { ExtractionCandidate } from "./candidates";
import { questionCandidate, type QuestionRow } from "./questions";

/**
 * Give the extractor the subscription the selected question is about, so a
 * terse "£12 monthly" can be read as an answer rather than as a message with
 * no provider in it.
 */
export function contextualizeQuestionReply(question: QuestionRow, text: string): string {
  const provider = question.provider_display.trim();

  if (provider.length === 0) {
    return text;
  }

  if (text.toLowerCase().includes(provider.toLowerCase())) {
    return text;
  }

  return `${provider} ${text}`;
}

function overlayFields(
  stored: ExtractionCandidate,
  overlay: ExtractionCandidate,
): ExtractionCandidate {
  return {
    ...stored,
    amountMinor: overlay.amountMinor ?? stored.amountMinor,
    currency: overlay.currency ?? stored.currency,
    cadence: overlay.cadence ?? stored.cadence,
    nextRenewal: overlay.nextRenewal ?? stored.nextRenewal,
    paidOn: overlay.paidOn ?? stored.paidOn,
    plan: overlay.plan ?? stored.plan,
    accountHint: overlay.accountHint ?? stored.accountHint,
    subscriptionStatus: overlay.subscriptionStatus ?? stored.subscriptionStatus,
    lifecycle: overlay.lifecycle ?? stored.lifecycle,
    endsOn: overlay.endsOn ?? stored.endsOn,
    trialEndsOn: overlay.trialEndsOn ?? stored.trialEndsOn,
    autoRenewal: overlay.autoRenewal ?? stored.autoRenewal,
    reminderPreferences: overlay.reminderPreferences ?? stored.reminderPreferences,
    unsupportedStageOne: overlay.unsupportedStageOne ?? stored.unsupportedStageOne,
    evidence: overlay.evidence || stored.evidence,
    confidence: overlay.confidence,
  };
}

/**
 * The candidate the selected question is about, with any fields this reply
 * actually stated overlaid. Unrelated names in the same message are ignored:
 * answering one price question must not retarget another holding.
 */
export function applyQuestionContext(
  question: QuestionRow,
  candidates: ExtractionCandidate[],
): ExtractionCandidate[] {
  const stored = questionCandidate(question);
  const expected = canonicalProvider(question.provider_canonical || question.provider_display);
  const matching = candidates.find(
    (candidate) => canonicalProvider(candidate.provider) === expected,
  );
  const overlay = matching ?? (candidates.length === 1 ? candidates[0] : null);

  if (!stored) {
    return overlay ? [overlay] : [];
  }

  if (!overlay) {
    return [stored];
  }

  return [
    overlayFields(stored, {
      ...overlay,
      provider: stored.provider,
    }),
  ];
}
