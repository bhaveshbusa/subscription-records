import { describe, expect, it } from "vitest";

import { emptyReminderPreferencesView, toReminderPreferencesView } from "@/lib/reminders/preferences";

import {
  reminderInputFromSuggestion,
  reminderPreferenceBody,
  reminderPreferenceSummary,
  reminderPreviewCopy,
  suggestionActionLabel,
  suggestionCopy,
  suggestionMatchesStored,
  suggestionValueLabel,
} from "./copy";

const unsetMonthly = emptyReminderPreferencesView({
  cadence: "monthly",
  nextRenewal: "2026-10-12",
  today: "2026-09-14",
}).renewal;

const unsetYearly = emptyReminderPreferencesView({
  cadence: "yearly",
  nextRenewal: "2026-10-12",
  today: "2026-09-14",
}).renewal;

describe("reminder preference copy", () => {
  it("keeps Not set, Off and Enabled distinct", () => {
    expect(reminderPreferenceSummary("unset", null, null)).toBe("Not set");
    expect(reminderPreferenceSummary("off", null, null)).toBe("Off");
    expect(reminderPreferenceSummary("enabled", 1, "months")).toBe("Enabled · 1 month before");
    expect(reminderPreferenceSummary("enabled", 3, "days")).toBe("Enabled · 3 days before");
  });

  it("explains an enabled preference with no dated target", () => {
    const unknown = toReminderPreferencesView({
      cadence: "yearly",
      nextRenewal: null,
      trialEndsOn: null,
      rows: [{ target: "renewal", state: "enabled", leadValue: 1, leadUnit: "months" }],
      today: "2026-09-14",
    }).renewal;

    expect(reminderPreviewCopy(unknown)).toBe(
      "Enabled, but there is no date yet so no reminder can be shown.",
    );
  });

  it("does not treat a suggestion as stored consent", () => {
    expect(suggestionMatchesStored(unsetMonthly)).toBe(false);
    expect(suggestionValueLabel(unsetMonthly.suggestion)).toBe("Off");
    expect(suggestionCopy(unsetMonthly.suggestion)).toBe("Suggested: Off");
    expect(suggestionActionLabel(unsetMonthly.suggestion)).toBe("Use Off");
    expect(reminderInputFromSuggestion(unsetMonthly.suggestion)).toEqual({ state: "off" });
  });

  it("names enabled lead suggestions for the adopt CTA", () => {
    expect(suggestionValueLabel(unsetYearly.suggestion)).toBe("1 month before");
    expect(suggestionCopy(unsetYearly.suggestion)).toBe("Suggested: 1 month before");
    expect(suggestionActionLabel(unsetYearly.suggestion)).toBe("Use 1 month before");
    expect(reminderInputFromSuggestion(unsetYearly.suggestion)).toEqual({
      state: "enabled",
      leadValue: 1,
      leadUnit: "months",
    });
  });

  it("sends only the named preference in a write body", () => {
    expect(reminderPreferenceBody("renewal", { state: "off" })).toEqual({
      reminderPreferences: { renewal: { state: "off" } },
    });
    expect(reminderPreferenceBody("trialEnd", { state: "enabled", leadValue: 3, leadUnit: "days" })).toEqual({
      reminderPreferences: { trialEnd: { state: "enabled", leadValue: 3, leadUnit: "days" } },
    });
    expect(Object.keys(reminderPreferenceBody("renewal", { state: "unset" }))).toEqual([
      "reminderPreferences",
    ]);
  });
});
