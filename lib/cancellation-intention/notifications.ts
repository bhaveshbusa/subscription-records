/**
 * Cancellation-intention Reminders eligibility (SUB-64).
 *
 * Unlike renewal/trial preference cards (reminderDate ≤ today ≤ dueDate, then
 * gone), an open intention is eligible from `remind_on` onward with no
 * automatic expiry. Missed dates do not clear the intention.
 */

export type CancellationIntentionOccurrence = {
  id: string;
  kind: "cancellation_intention";
  subscriptionId: string;
  remindOn: string;
  /** Sort / display key — same as remindOn; no separate due. */
  dueDate: string;
  reminderDate: string;
};

export function cancellationIntentionOccurrenceId(
  subscriptionId: string,
  remindOn: string,
): string {
  return `${subscriptionId}:cancel_intention:${remindOn}`;
}

/**
 * Visible in Reminders when the intention is open and remind_on ≤ today.
 * Before that date the plan stays on the open row only.
 */
export function projectVisibleCancellationIntention(options: {
  subscriptionId: string;
  remindOn: string;
  today: string;
}): CancellationIntentionOccurrence | null {
  if (options.remindOn > options.today) {
    return null;
  }

  return {
    id: cancellationIntentionOccurrenceId(options.subscriptionId, options.remindOn),
    kind: "cancellation_intention",
    subscriptionId: options.subscriptionId,
    remindOn: options.remindOn,
    dueDate: options.remindOn,
    reminderDate: options.remindOn,
  };
}
