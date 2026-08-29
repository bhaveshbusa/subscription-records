import { describe, expect, it } from "vitest";

import { formatDate, formatMoneyMinor, formatMonthlyEquivalent, statusLabel, cadenceLabel, trustLabel } from "./format";

describe("subscription formatting", () => {
  it("formats GBP minor units and fallback currencies", () => {
    expect(formatMoneyMinor(1599, "GBP")).toBe("£15.99");
    expect(formatMoneyMinor(1234, "USD")).toBe("US$12.34");
  });

  it("formats monthly equivalents", () => {
    expect(formatMonthlyEquivalent(1299)).toBe("£12.99/mo");
    expect(formatMonthlyEquivalent(null)).toBe("—");
  });

  it("formats dates in UTC", () => {
    expect(formatDate("2026-09-12")).toBe("12 Sep 2026");
    expect(formatDate(null)).toBe("—");
  });

  it("labels every subscription status and cadence", () => {
    expect(statusLabel("cancel_scheduled")).toBe("Cancel scheduled");
    expect(statusLabel("lapsed")).toBe("Lapsed");
    expect(statusLabel("active")).toBe("Active");
    expect(cadenceLabel("yearly")).toBe("Yearly");
    expect(cadenceLabel(null)).toBe("—");
  });

  it("labels the worst field trust status", () => {
    const item = {
      amount: { status: "inferred" },
      cadence: { status: "deferred" },
      nextRenewal: { status: "conflicted" },
    } as Parameters<typeof trustLabel>[0];

    expect(trustLabel(item)).toBe("Conflicted");
    expect(
      trustLabel({
        amount: { status: "confirmed" },
        cadence: { status: "confirmed" },
        nextRenewal: { status: "empty" },
      } as Parameters<typeof trustLabel>[0]),
    ).toBe("Missing");
  });
});
