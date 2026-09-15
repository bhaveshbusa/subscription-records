import { formatDate } from "@/lib/subscriptions/format";

import type { CancellationIntentionView } from "./intention";

/** Soft open-row copy before remind_on (decision B). */
export function intentionSoftSummary(intention: CancellationIntentionView): string {
  return `Planning to cancel · remind ${formatDate(intention.remindOn)}`;
}

/** Prominent open-row / Reminders copy from remind_on onward. */
export function intentionDueSummary(intention: CancellationIntentionView): string {
  return `Time to cancel · reminded from ${formatDate(intention.remindOn)}`;
}

export function intentionIsDue(intention: CancellationIntentionView, today: string): boolean {
  return intention.remindOn <= today;
}

export function intentionRowHint(intention: CancellationIntentionView, today: string): string {
  return intentionIsDue(intention, today)
    ? intentionDueSummary(intention)
    : intentionSoftSummary(intention);
}
