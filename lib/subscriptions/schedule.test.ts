import { describe, expect, it } from "vitest";

import {
  hasUsableExpectedSchedule,
  isHoldingOverdue,
  nextOccurrenceOnOrAfter,
  occurrenceFromAnchor,
  resolveExpectedNextRenewal,
  resolveScheduleDueOn,
  type ScheduleFacts,
} from "./schedule";

function facts(overrides: Partial<ScheduleFacts> = {}): ScheduleFacts {
  return {
    status: "active",
    autoRenewal: "yes",
    autoRenewalStatus: "confirmed",
    cadence: "monthly",
    cadenceStatus: "confirmed",
    nextRenewal: "2026-01-31",
    nextRenewalStatus: "confirmed",
    trialEndsOn: null,
    ...overrides,
  };
}

describe("occurrenceFromAnchor", () => {
  it("keeps the original day when a later month is long enough", () => {
    expect(occurrenceFromAnchor("2026-01-31", "monthly", 0)).toBe("2026-01-31");
    expect(occurrenceFromAnchor("2026-01-31", "monthly", 1)).toBe("2026-02-28");
    expect(occurrenceFromAnchor("2026-01-31", "monthly", 2)).toBe("2026-03-31");
    expect(occurrenceFromAnchor("2026-01-31", "monthly", 3)).toBe("2026-04-30");
  });

  it("does not drift after a short month the way stepping would", () => {
    /**
     * Stepping 31 Jan → 28 Feb → 28 Mar is the roll-forward bug. Original-anchor
     * from 31 Jan lands on 31 Mar for +2 months.
     */
    expect(occurrenceFromAnchor("2026-01-31", "monthly", 2)).not.toBe("2026-03-28");
    expect(occurrenceFromAnchor("2026-01-31", "monthly", 2)).toBe("2026-03-31");
  });

  it("clamps a leap-day yearly series from the original 29 February", () => {
    expect(occurrenceFromAnchor("2024-02-29", "yearly", 1)).toBe("2025-02-28");
    expect(occurrenceFromAnchor("2024-02-29", "yearly", 2)).toBe("2026-02-28");
    expect(occurrenceFromAnchor("2024-02-29", "yearly", 4)).toBe("2028-02-29");
  });

  it("steps weekly by seven-day multiples of the anchor", () => {
    expect(occurrenceFromAnchor("2026-01-07", "weekly", 3)).toBe("2026-01-28");
  });
});

describe("nextOccurrenceOnOrAfter", () => {
  it("returns the recorded date when it has not passed", () => {
    expect(nextOccurrenceOnOrAfter("2026-04-30", "monthly", "2026-04-10")).toBe("2026-04-30");
  });

  it("projects the April 2026 month-end example from a January 31 anchor", () => {
    expect(nextOccurrenceOnOrAfter("2026-01-31", "monthly", "2026-04-10")).toBe("2026-04-30");
    expect(nextOccurrenceOnOrAfter("2026-01-31", "monthly", "2026-04-30")).toBe("2026-04-30");
    expect(nextOccurrenceOnOrAfter("2026-01-31", "monthly", "2026-05-01")).toBe("2026-05-31");
  });

  it("projects a weekly date from the original weekday", () => {
    expect(nextOccurrenceOnOrAfter("2026-01-07", "weekly", "2026-01-22")).toBe("2026-01-28");
    expect(nextOccurrenceOnOrAfter("2026-01-07", "weekly", "2026-01-21")).toBe("2026-01-21");
  });

  it("projects a leap-year yearly series without inventing 29 February in a common year", () => {
    expect(nextOccurrenceOnOrAfter("2024-02-29", "yearly", "2025-03-01")).toBe("2026-02-28");
    expect(nextOccurrenceOnOrAfter("2024-02-29", "yearly", "2028-02-28")).toBe("2028-02-29");
  });
});

describe("resolveExpectedNextRenewal", () => {
  it("labels a usable projection inferred/expected and keeps the recorded date out of the result", () => {
    expect(resolveExpectedNextRenewal(facts(), "2026-04-10")).toEqual({
      value: "2026-04-30",
      status: "inferred",
      basis: "expected",
    });
  });

  it("omits a date when auto-renewal, cadence, or the recorded date is not confirmed", () => {
    expect(
      resolveExpectedNextRenewal(facts({ autoRenewal: null, autoRenewalStatus: "empty" })),
    ).toBeNull();
    expect(
      resolveExpectedNextRenewal(facts({ autoRenewal: "no", autoRenewalStatus: "confirmed" })),
    ).toBeNull();
    expect(
      resolveExpectedNextRenewal(facts({ cadenceStatus: "inferred" })),
    ).toBeNull();
    expect(
      resolveExpectedNextRenewal(facts({ nextRenewalStatus: "proposed" })),
    ).toBeNull();
    expect(
      resolveExpectedNextRenewal(facts({ cadence: null, cadenceStatus: "empty" })),
    ).toBeNull();
  });

  it("does not invent a date for trial, paused, cancelled, or cancellation-scheduled rows", () => {
    expect(resolveExpectedNextRenewal(facts({ status: "trial" }))).toBeNull();
    expect(resolveExpectedNextRenewal(facts({ status: "paused" }))).toBeNull();
    expect(resolveExpectedNextRenewal(facts({ status: "cancelled" }))).toBeNull();
    expect(resolveExpectedNextRenewal(facts({ status: "cancel_scheduled" }))).toBeNull();
  });

  it("uses the expected date for due-next once the row qualifies", () => {
    expect(resolveScheduleDueOn(facts(), "2026-04-10")).toBe("2026-04-30");
    expect(
      resolveScheduleDueOn(facts({ autoRenewalStatus: "empty", autoRenewal: null }), "2026-04-10"),
    ).toBe("2026-01-31");
  });
});

describe("isHoldingOverdue", () => {
  it("leaves a confirmed auto-renewing active holding out of overdue", () => {
    expect(isHoldingOverdue(facts(), "2026-04-10")).toBe(false);
    expect(hasUsableExpectedSchedule(facts())).toBe(true);
  });

  it("keeps auto-renewal no/unknown and unusable schedules unresolved", () => {
    expect(
      isHoldingOverdue(facts({ autoRenewal: null, autoRenewalStatus: "empty" }), "2026-04-10"),
    ).toBe(true);
    expect(
      isHoldingOverdue(facts({ autoRenewal: "no", autoRenewalStatus: "confirmed" }), "2026-04-10"),
    ).toBe(true);
    expect(isHoldingOverdue(facts({ cadenceStatus: "conflicted" }), "2026-04-10")).toBe(true);
  });

  it("treats a passed trial end as reconciliation work", () => {
    expect(
      isHoldingOverdue(
        facts({
          status: "trial",
          nextRenewal: null,
          nextRenewalStatus: "empty",
          trialEndsOn: "2026-04-01",
        }),
        "2026-04-10",
      ),
    ).toBe(true);
    expect(
      isHoldingOverdue(
        facts({
          status: "trial",
          nextRenewal: null,
          nextRenewalStatus: "empty",
          trialEndsOn: "2026-04-20",
        }),
        "2026-04-10",
      ),
    ).toBe(false);
  });

  it("does not generate an unlimited schedule for paused or cancellation-scheduled rows", () => {
    expect(isHoldingOverdue(facts({ status: "paused" }), "2026-04-10")).toBe(true);
    expect(isHoldingOverdue(facts({ status: "cancel_scheduled" }), "2026-04-10")).toBe(true);
    expect(isHoldingOverdue(facts({ status: "cancelled" }), "2026-04-10")).toBe(false);
  });
});
