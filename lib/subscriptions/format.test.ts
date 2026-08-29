import { describe, expect, it } from "vitest";

import {
  cadenceLabel,
  eventTypeLabel,
  fieldStatusLabel,
  formatDate,
  formatMoneyMinor,
  formatMonthlyEquivalent,
  statusLabel,
  trustLabel,
} from "./format";

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

  it("labels every field status", () => {
    expect(fieldStatusLabel("empty")).toBe("Missing");
    expect(fieldStatusLabel("proposed")).toBe("Proposed");
    expect(fieldStatusLabel("inferred")).toBe("Inferred");
    expect(fieldStatusLabel("confirmed")).toBe("Confirmed");
    expect(fieldStatusLabel("deferred")).toBe("Deferred");
    expect(fieldStatusLabel("conflicted")).toBe("Conflicted");
  });

  it("labels event types", () => {
    expect(eventTypeLabel("started")).toBe("Started");
    expect(eventTypeLabel("converted_to_paid")).toBe("Converted to paid");
    expect(eventTypeLabel("payment_failed")).toBe("Payment failed");
    expect(eventTypeLabel("cancelled")).toBe("Cancelled");
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
