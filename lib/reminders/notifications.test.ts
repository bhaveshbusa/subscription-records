import { describe, expect, it } from "vitest";

import type { ScheduleFacts } from "@/lib/subscriptions/schedule";

import { projectVisibleReminder, reminderDue, reminderOccurrenceId } from "./notifications";

function facts(overrides: Partial<ScheduleFacts> = {}): ScheduleFacts {
  return {
    status: "active",
    autoRenewal: "yes",
    autoRenewalStatus: "confirmed",
    cadence: "monthly",
    cadenceStatus: "confirmed",
    nextRenewal: "2026-10-15",
    nextRenewalStatus: "confirmed",
    trialEndsOn: null,
    ...overrides,
  };
}

const monthLead = {
  subscriptionId: "sub-1",
  target: "renewal" as const,
  state: "enabled" as const,
  leadValue: 1,
  leadUnit: "months" as const,
};

describe("reminderDue", () => {
  it("uses the expected next renewal when the row qualifies", () => {
    expect(
      reminderDue({
        target: "renewal",
        facts: facts({ nextRenewal: "2026-06-15" }),
        trialEndStatus: "empty",
        today: "2026-09-08",
      }),
    ).toEqual({
      dueDate: "2026-09-15",
      basis: "expected",
      status: "inferred",
    });
  });

  it("keeps the stored date when auto-renewal is unknown", () => {
    expect(
      reminderDue({
        target: "renewal",
        facts: facts({ autoRenewal: null, autoRenewalStatus: "empty" }),
        trialEndStatus: "empty",
        today: "2026-09-08",
      }),
    ).toEqual({
      dueDate: "2026-10-15",
      basis: "recorded",
      status: "confirmed",
    });
  });

  it("does not invent a renewal deadline when the stored date is missing", () => {
    expect(
      reminderDue({
        target: "renewal",
        facts: facts({ nextRenewal: null, nextRenewalStatus: "empty" }),
        trialEndStatus: "empty",
        today: "2026-09-08",
      }),
    ).toBeNull();
  });

  it("uses the stored trial end, not a paid renewal", () => {
    expect(
      reminderDue({
        target: "trial_end",
        facts: facts({
          status: "trial",
          nextRenewal: null,
          trialEndsOn: "2026-09-14",
        }),
        trialEndStatus: "confirmed",
        today: "2026-09-14",
      }),
    ).toEqual({
      dueDate: "2026-09-14",
      basis: "recorded",
      status: "confirmed",
    });
  });
});

describe("projectVisibleReminder", () => {
  it("is absent 14 September, visible 15 September through 15 October, and gone 16 October", () => {
    const source = {
      preference: monthLead,
      facts: facts({ autoRenewal: null, autoRenewalStatus: "empty" }),
      trialEndStatus: "empty" as const,
    };

    expect(projectVisibleReminder({ ...source, today: "2026-09-14" })).toBeNull();
    expect(projectVisibleReminder({ ...source, today: "2026-09-15" })).toMatchObject({
      dueDate: "2026-10-15",
      reminderDate: "2026-09-15",
      basis: "recorded",
      id: reminderOccurrenceId("sub-1", "renewal", "2026-10-15"),
    });
    expect(projectVisibleReminder({ ...source, today: "2026-10-15" })?.dueDate).toBe("2026-10-15");
    expect(projectVisibleReminder({ ...source, today: "2026-10-16" })).toBeNull();
  });

  it("repeated loads of the same occurrence keep one stable id", () => {
    const source = {
      preference: monthLead,
      facts: facts({ autoRenewal: null, autoRenewalStatus: "empty" }),
      trialEndStatus: "empty" as const,
    };
    const first = projectVisibleReminder({ ...source, today: "2026-09-20" });
    const second = projectVisibleReminder({ ...source, today: "2026-10-01" });

    expect(first?.id).toBe(second?.id);
    expect(first?.id).toBe("sub-1:renewal:2026-10-15");
  });

  it("does not invent a card when the due date is unknown", () => {
    expect(
      projectVisibleReminder({
        preference: monthLead,
        facts: facts({ nextRenewal: null, nextRenewalStatus: "empty", autoRenewal: null }),
        trialEndStatus: "empty",
        today: "2026-09-15",
      }),
    ).toBeNull();
  });

  it("labels an expected due date inferred/expected", () => {
    const card = projectVisibleReminder({
      preference: monthLead,
      facts: facts({ nextRenewal: "2026-06-15" }),
      trialEndStatus: "empty",
      today: "2026-09-08",
    });

    expect(card).toMatchObject({
      dueDate: "2026-09-15",
      reminderDate: "2026-08-15",
      basis: "expected",
      status: "inferred",
    });
  });

  it("lets a later auto-renewal occurrence appear only inside its own window", () => {
    const recorded = facts({ nextRenewal: "2026-06-15" });
    const threeDays = {
      ...monthLead,
      leadValue: 3,
      leadUnit: "days" as const,
    };

    /** 15 September is the current expected date; 3-day lead starts 12 September. */
    expect(
      projectVisibleReminder({
        preference: threeDays,
        facts: recorded,
        trialEndStatus: "empty",
        today: "2026-09-11",
      }),
    ).toBeNull();
    expect(
      projectVisibleReminder({
        preference: threeDays,
        facts: recorded,
        trialEndStatus: "empty",
        today: "2026-09-15",
      })?.dueDate,
    ).toBe("2026-09-15");

    /**
     * The next day the September occurrence is gone. October's window starts
     * 12 October, so 16 September is not a card.
     */
    expect(
      projectVisibleReminder({
        preference: threeDays,
        facts: recorded,
        trialEndStatus: "empty",
        today: "2026-09-16",
      }),
    ).toBeNull();
    expect(
      projectVisibleReminder({
        preference: threeDays,
        facts: recorded,
        trialEndStatus: "empty",
        today: "2026-10-12",
      })?.dueDate,
    ).toBe("2026-10-15");
  });

  it("keeps a trial reminder visible on trial end and drops it the next day", () => {
    const trial = facts({
      status: "trial",
      nextRenewal: null,
      trialEndsOn: "2026-09-14",
    });
    const preference = {
      subscriptionId: "sub-trial",
      target: "trial_end" as const,
      state: "enabled" as const,
      leadValue: 3,
      leadUnit: "days" as const,
    };

    expect(
      projectVisibleReminder({
        preference,
        facts: trial,
        trialEndStatus: "confirmed",
        today: "2026-09-10",
      }),
    ).toBeNull();
    expect(
      projectVisibleReminder({
        preference,
        facts: trial,
        trialEndStatus: "confirmed",
        today: "2026-09-14",
      }),
    ).toMatchObject({
      dueDate: "2026-09-14",
      reminderDate: "2026-09-11",
      basis: "recorded",
    });
    expect(
      projectVisibleReminder({
        preference,
        facts: trial,
        trialEndStatus: "confirmed",
        today: "2026-09-15",
      }),
    ).toBeNull();
  });
});
