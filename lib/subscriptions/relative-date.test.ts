import { describe, expect, it } from "vitest";

import { rollNextRenewal } from "./dates";
import { readPastEventDate } from "./relative-date";

const NOW = new Date("2026-09-04T12:00:00.000Z");

describe("readPastEventDate", () => {
  it("subtracts calendar months for \"N months ago\", clamping the day", () => {
    expect(readPastEventDate("three months ago", NOW)).toBe("2026-06-04");
    expect(readPastEventDate("I cancelled it 3 months ago", NOW)).toBe("2026-06-04");
    expect(readPastEventDate("a month ago", new Date("2026-03-31T12:00:00.000Z"))).toBe(
      "2026-02-28",
    );
  });

  it("reads last week, last month, last year, and yesterday", () => {
    expect(readPastEventDate("yesterday", NOW)).toBe("2026-09-03");
    expect(readPastEventDate("last week", NOW)).toBe("2026-08-28");
    expect(readPastEventDate("last month", NOW)).toBe("2026-08-04");
    expect(readPastEventDate("last year", NOW)).toBe("2025-09-04");
  });

  it("reads a named month on today's day, this year if that date is not future", () => {
    expect(readPastEventDate("in March", NOW)).toBe("2026-03-04");
    expect(readPastEventDate("last March", NOW)).toBe("2026-03-04");
    expect(readPastEventDate("in November", NOW)).toBe("2025-11-04");
  });

  it("keeps a past ISO date and ignores a future one", () => {
    expect(readPastEventDate("ended 2026-03-01", NOW)).toBe("2026-03-01");
    expect(readPastEventDate("ends 2026-12-01", NOW)).toBeNull();
  });
});

describe("rollNextRenewal", () => {
  it("leaves today and future dates alone", () => {
    expect(rollNextRenewal("2026-09-04", "monthly", "2026-09-04")).toBe("2026-09-04");
    expect(rollNextRenewal("2026-10-04", "monthly", "2026-09-04")).toBe("2026-10-04");
  });

  it("advances by cadence until the date is today or later", () => {
    expect(rollNextRenewal("2026-06-04", "monthly", "2026-09-04")).toBe("2026-09-04");
    expect(rollNextRenewal("2026-08-14", "monthly", "2026-09-04")).toBe("2026-09-14");
    expect(rollNextRenewal("2026-08-28", "weekly", "2026-09-04")).toBe("2026-09-04");
  });
});
