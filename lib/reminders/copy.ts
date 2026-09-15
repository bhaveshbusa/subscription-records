import type {
  ReminderConsent,
  ReminderLeadUnit,
  ReminderPreferenceInput,
  ReminderPreferenceView,
  SuggestedPreference,
} from "@/lib/reminders/preferences";
import { formatDate, reminderLeadLabel } from "@/lib/subscriptions/format";

/** Workspace copy: Unset in the ledger form is Not set on the open row. */
export function reminderPreferenceSummary(
  state: ReminderConsent,
  leadValue: number | null,
  leadUnit: ReminderLeadUnit | null,
): string {
  if (state === "unset") {
    return "Not set";
  }

  if (state === "off") {
    return "Off";
  }

  return `Enabled · ${reminderLeadLabel(leadValue, leadUnit)}`;
}

export function reminderPreviewCopy(
  preference: ReminderPreferenceView,
  expectedDue = false,
): string {
  const { preview } = preference;
  const expectedNote = expectedDue
    ? " The due date is the expected next renewal (inferred)."
    : "";

  if (preference.state === "unset") {
    return "Not set. You will not be reminded until you choose.";
  }

  if (preference.state === "off") {
    return "Off. You will not be reminded.";
  }

  if (preview.occurrence === "unknown") {
    return "Enabled, but there is no date yet so no reminder can be shown.";
  }

  if (preview.occurrence === "past") {
    return `The occurrence for ${formatDate(preview.dueDate)} has passed (would have started ${formatDate(preview.reminderDate)}).${expectedNote}`;
  }

  if (preview.occurrence === "upcoming") {
    return `Reminders would show this from ${formatDate(preview.reminderDate)} through ${formatDate(preview.dueDate)}.${expectedNote}`;
  }

  return `Reminders would show this now, from ${formatDate(preview.reminderDate)} through ${formatDate(preview.dueDate)}.${expectedNote}`;
}

/** Short label for the suggested choice — matches stored Off / lead vocabulary. */
export function suggestionValueLabel(
  suggestion: ReminderPreferenceView["suggestion"],
): string {
  if (suggestion.state === "off") {
    return "Off";
  }

  return reminderLeadLabel(suggestion.leadValue, suggestion.leadUnit);
}

export function suggestionCopy(
  suggestion: ReminderPreferenceView["suggestion"],
): string {
  return `Suggested: ${suggestionValueLabel(suggestion)}`;
}

/** Adopt CTA names the suggestion so it is not only “Use this suggestion”. */
export function suggestionActionLabel(
  suggestion: ReminderPreferenceView["suggestion"],
): string {
  return `Use ${suggestionValueLabel(suggestion)}`;
}

/** Consent stays secondary: suggestions are not stored until chosen. */
export const SUGGESTION_CONSENT_CUE = "Not applied until you choose it.";

export function suggestionMatchesStored(preference: ReminderPreferenceView): boolean {
  if (preference.state !== preference.suggestion.state) {
    return false;
  }

  if (preference.state !== "enabled") {
    return true;
  }

  return (
    preference.leadValue === preference.suggestion.leadValue &&
    preference.leadUnit === preference.suggestion.leadUnit
  );
}

/** One named preference only — never price, dates, trust, or auto-renewal. */
export function reminderPreferenceBody(
  target: "renewal" | "trialEnd",
  input: ReminderPreferenceInput,
): { reminderPreferences: { renewal?: ReminderPreferenceInput; trialEnd?: ReminderPreferenceInput } } {
  return { reminderPreferences: { [target]: input } };
}

export function reminderInputFromSuggestion(
  suggestion: SuggestedPreference,
): ReminderPreferenceInput {
  if (suggestion.state === "off") {
    return { state: "off" };
  }

  return {
    state: "enabled",
    leadValue: suggestion.leadValue,
    leadUnit: suggestion.leadUnit,
  };
}
