import type { FieldStatus, SubscriptionRow } from "@/lib/subscriptions/projection";
import {
  resolveExpectedNextRenewal,
  scheduleFactsFromRow,
  type ScheduleFacts,
} from "@/lib/subscriptions/schedule";

import { previewReminder, type ReminderLeadUnit, type ReminderTarget } from "./dates";

export type ReminderDateBasis = "expected" | "recorded";

/**
 * One visible Inbox reminder. The id is subscription + target + due date, so
 * repeated loads of the same occurrence stay one card.
 */
export type ReminderOccurrence = {
  id: string;
  subscriptionId: string;
  target: ReminderTarget;
  dueDate: string;
  reminderDate: string;
  basis: ReminderDateBasis;
  status: FieldStatus;
};

export type ReminderPreferenceSource = {
  subscriptionId: string;
  target: ReminderTarget;
  state: "enabled";
  leadValue: number;
  leadUnit: ReminderLeadUnit;
};

export function reminderOccurrenceId(
  subscriptionId: string,
  target: ReminderTarget,
  dueDate: string,
): string {
  return `${subscriptionId}:${target}:${dueDate}`;
}

/**
 * The date this preference is watching. Renewal uses the shared schedule
 * due date (expected when the row qualifies). Trial end is the stored trial
 * end. Unknown targets produce no dated card.
 */
export function reminderDue(options: {
  target: ReminderTarget;
  facts: ScheduleFacts;
  trialEndStatus: FieldStatus;
  today: string;
}): { dueDate: string; basis: ReminderDateBasis; status: FieldStatus } | null {
  if (options.target === "trial_end") {
    if (!options.facts.trialEndsOn) {
      return null;
    }

    return {
      dueDate: options.facts.trialEndsOn,
      basis: "recorded",
      status: options.trialEndStatus,
    };
  }

  const expected = resolveExpectedNextRenewal(options.facts, options.today);

  if (expected) {
    return {
      dueDate: expected.value,
      basis: "expected",
      status: expected.status,
    };
  }

  if (!options.facts.nextRenewal) {
    return null;
  }

  return {
    dueDate: options.facts.nextRenewal,
    basis: "recorded",
    status: options.facts.nextRenewalStatus,
  };
}

/**
 * A card only when the preference is enabled and today sits in the inclusive
 * window reminderDate ≤ today ≤ dueDate. Upcoming and past occurrences are
 * not Inbox cards. The current due date is the only occurrence considered:
 * a later auto-renewal cycle can appear only once *its* window is active.
 */
export function projectVisibleReminder(options: {
  preference: ReminderPreferenceSource;
  facts: ScheduleFacts;
  trialEndStatus: FieldStatus;
  today: string;
}): ReminderOccurrence | null {
  const due = reminderDue({
    target: options.preference.target,
    facts: options.facts,
    trialEndStatus: options.trialEndStatus,
    today: options.today,
  });

  if (!due) {
    return null;
  }

  const preview = previewReminder({
    dueDate: due.dueDate,
    state: options.preference.state,
    leadValue: options.preference.leadValue,
    leadUnit: options.preference.leadUnit,
    today: options.today,
  });

  if (preview.occurrence !== "visible" || !preview.reminderDate || !preview.dueDate) {
    return null;
  }

  return {
    id: reminderOccurrenceId(
      options.preference.subscriptionId,
      options.preference.target,
      due.dueDate,
    ),
    subscriptionId: options.preference.subscriptionId,
    target: options.preference.target,
    dueDate: due.dueDate,
    reminderDate: preview.reminderDate,
    basis: due.basis,
    status: due.status,
  };
}

export function reminderFactsFromRow(row: SubscriptionRow): {
  facts: ScheduleFacts;
  trialEndStatus: FieldStatus;
} {
  return {
    facts: scheduleFactsFromRow(row),
    trialEndStatus: row.trial_end_field_status,
  };
}
