import { describe, expect, it } from "vitest";

import { previewReminder, reminderStartDate, suggestedPreference } from "./dates";

describe("suggestedPreference", () => {
  it("suggests off for weekly and monthly renewal, and for unknown cadence", () => {
    expect(suggestedPreference("renewal", "weekly")).toEqual({
      state: "off",
      leadValue: null,
      leadUnit: null,
    });
    expect(suggestedPreference("renewal", "monthly")).toEqual({
      state: "off",
      leadValue: null,
      leadUnit: null,
    });
    expect(suggestedPreference("renewal", null)).toEqual({
      state: "off",
      leadValue: null,
      leadUnit: null,
    });
  });

  it("suggests one calendar month before a yearly renewal", () => {
    expect(suggestedPreference("renewal", "yearly")).toEqual({
      state: "enabled",
      leadValue: 1,
      leadUnit: "months",
    });
  });

  it("suggests three calendar days before trial end, independent of cadence", () => {
    expect(suggestedPreference("trial_end", "monthly")).toEqual({
      state: "enabled",
      leadValue: 3,
      leadUnit: "days",
    });
    expect(suggestedPreference("trial_end", "yearly")).toEqual({
      state: "enabled",
      leadValue: 3,
      leadUnit: "days",
    });
  });
});

describe("reminderStartDate", () => {
  it("subtracts calendar months with month-end clamping", () => {
    expect(reminderStartDate("2026-10-15", 1, "months")).toBe("2026-09-15");
    expect(reminderStartDate("2026-03-31", 1, "months")).toBe("2026-02-28");
    expect(reminderStartDate("2028-03-31", 1, "months")).toBe("2028-02-29");
  });

  it("subtracts whole days", () => {
    expect(reminderStartDate("2026-09-14", 3, "days")).toBe("2026-09-11");
  });
});

describe("previewReminder", () => {
  it("produces no dated card when the preference is unset, off, or the due date is unknown", () => {
    expect(
      previewReminder({
        dueDate: "2026-10-15",
        state: "unset",
        leadValue: 1,
        leadUnit: "months",
        today: "2026-09-15",
      }).occurrence,
    ).toBe("unknown");
    expect(
      previewReminder({
        dueDate: "2026-10-15",
        state: "off",
        leadValue: null,
        leadUnit: null,
        today: "2026-09-15",
      }).reminderDate,
    ).toBe(null);
    expect(
      previewReminder({
        dueDate: null,
        state: "enabled",
        leadValue: 1,
        leadUnit: "months",
        today: "2026-09-15",
      }),
    ).toEqual({ dueDate: null, reminderDate: null, occurrence: "unknown" });
  });

  it("uses an inclusive window from reminder start through the due date", () => {
    const lead = {
      dueDate: "2026-10-15",
      state: "enabled" as const,
      leadValue: 1,
      leadUnit: "months" as const,
    };

    expect(previewReminder({ ...lead, today: "2026-09-14" })).toMatchObject({
      reminderDate: "2026-09-15",
      occurrence: "upcoming",
    });
    expect(previewReminder({ ...lead, today: "2026-09-15" })).toMatchObject({
      reminderDate: "2026-09-15",
      occurrence: "visible",
    });
    expect(previewReminder({ ...lead, today: "2026-10-15" })).toMatchObject({
      occurrence: "visible",
    });
    expect(previewReminder({ ...lead, today: "2026-10-16" })).toMatchObject({
      reminderDate: "2026-09-15",
      occurrence: "past",
    });
  });
});
