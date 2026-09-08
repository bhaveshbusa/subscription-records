import { addDays, calendarToday, shiftCalendarMonths } from "@/lib/subscriptions/dates";
import type { Cadence } from "@/lib/subscriptions/params";

export const REMINDER_TARGETS = ["renewal", "trial_end"] as const;
export type ReminderTarget = (typeof REMINDER_TARGETS)[number];

export const REMINDER_LEAD_UNITS = ["days", "months"] as const;
export type ReminderLeadUnit = (typeof REMINDER_LEAD_UNITS)[number];

export type ReminderConsent = "unset" | "off" | "enabled";

export type SuggestedPreference =
  | { state: "off"; leadValue: null; leadUnit: null }
  | { state: "enabled"; leadValue: number; leadUnit: ReminderLeadUnit };

export type ReminderOccurrence = "unknown" | "upcoming" | "visible" | "past";

export type ReminderPreview = {
  dueDate: string | null;
  reminderDate: string | null;
  occurrence: ReminderOccurrence;
};

/** Weekly/monthly renewal suggests off; yearly one calendar month; trial three days. */
export function suggestedPreference(
  target: ReminderTarget,
  cadence: Cadence | null,
): SuggestedPreference {
  if (target === "trial_end") {
    return { state: "enabled", leadValue: 3, leadUnit: "days" };
  }

  if (cadence === "yearly") {
    return { state: "enabled", leadValue: 1, leadUnit: "months" };
  }

  return { state: "off", leadValue: null, leadUnit: null };
}

/** Reminder start = due date minus lead, with calendar-month clamping. */
export function reminderStartDate(
  dueDate: string,
  leadValue: number,
  leadUnit: ReminderLeadUnit,
): string {
  if (leadUnit === "days") {
    return addDays(dueDate, -leadValue);
  }

  return shiftCalendarMonths(dueDate, -leadValue);
}

/**
 * Date preview for a supplied target. Unknown due dates produce no dated card.
 * Inclusive window: reminderDate <= today <= dueDate. Past when today > dueDate.
 */
export function previewReminder(options: {
  dueDate: string | null;
  state: ReminderConsent;
  leadValue: number | null;
  leadUnit: ReminderLeadUnit | null;
  today?: string;
}): ReminderPreview {
  if (
    options.state !== "enabled" ||
    options.leadValue === null ||
    options.leadUnit === null ||
    options.dueDate === null
  ) {
    return { dueDate: options.dueDate, reminderDate: null, occurrence: "unknown" };
  }

  const today = options.today ?? calendarToday();
  const reminderDate = reminderStartDate(options.dueDate, options.leadValue, options.leadUnit);

  if (today > options.dueDate) {
    return { dueDate: options.dueDate, reminderDate, occurrence: "past" };
  }

  if (today < reminderDate) {
    return { dueDate: options.dueDate, reminderDate, occurrence: "upcoming" };
  }

  return { dueDate: options.dueDate, reminderDate, occurrence: "visible" };
}
