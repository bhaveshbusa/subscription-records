import { describe, expect, it } from "vitest";

import { addDays, advanceByCadence, shiftCalendarMonths } from "./dates";

describe("addDays", () => {
  it("crosses a month and a year without a timezone shifting the day", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe("advanceByCadence", () => {
  it("moves on by one billing period", () => {
    expect(advanceByCadence("2026-03-04", "weekly")).toBe("2026-03-11");
    expect(advanceByCadence("2026-03-04", "monthly")).toBe("2026-04-04");
    expect(advanceByCadence("2026-03-04", "yearly")).toBe("2027-03-04");
  });

  it("clamps to the end of a shorter month rather than overflowing it", () => {
    expect(advanceByCadence("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(advanceByCadence("2024-01-31", "monthly")).toBe("2024-02-29");
  });
});

describe("shiftCalendarMonths", () => {
  it("subtracts whole months, clamping the day", () => {
    expect(shiftCalendarMonths("2026-09-04", -3)).toBe("2026-06-04");
    expect(shiftCalendarMonths("2026-03-31", -1)).toBe("2026-02-28");
  });
});
