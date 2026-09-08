import { describe, expect, it } from "vitest";

import { parseProposalPayload } from "./payload";

function issues(kind: Parameters<typeof parseProposalPayload>[0], payload: unknown) {
  const parsed = parseProposalPayload(kind, payload);

  return parsed.success ? [] : parsed.issues.map((issue) => issue.field);
}

describe("parseProposalPayload", () => {
  it("accepts a create payload with proposed terms", () => {
    const parsed = parseProposalPayload("create", {
      provider: { value: "Substack", status: "confirmed", confidence: "high" },
      amountMinor: { value: 500, status: "proposed", confidence: "medium" },
      cadence: { value: "monthly", status: "inferred" },
      nextRenewal: { value: "2026-09-12", status: "proposed" },
    });

    expect(parsed.success).toBe(true);
  });

  it("refuses a payload that asks for confirmed money or dates", () => {
    expect(
      issues("create", {
        provider: { value: "Substack", status: "confirmed" },
        amountMinor: { value: 500, status: "confirmed" },
      }),
    ).toContain("amountMinor.status");
    expect(
      issues("create", {
        provider: { value: "Substack", status: "confirmed" },
        nextRenewal: { value: "2026-09-12", status: "confirmed" },
      }),
    ).toContain("nextRenewal.status");
  });

  it("requires a provider on a create and a field on an update", () => {
    expect(issues("create", { plan: "Reader" })).toContain("provider");
    expect(issues("update", {})).toContain("payload");
  });

  it("rejects impossible dates and unknown fields", () => {
    expect(
      issues("update", { nextRenewal: { value: "2026-02-30", status: "proposed" } }),
    ).toContain("nextRenewal.value");
    expect(parseProposalPayload("update", { price: 500 }).success).toBe(false);
  });

  it("takes a change of terms with the day it starts, and needs terms to change", () => {
    const parsed = parseProposalPayload("terms_changed", {
      effectiveFrom: "2026-06-01",
      amountMinor: { value: 1899, status: "proposed" },
    });

    expect(parsed.success).toBe(true);
    expect(issues("terms_changed", { accountHint: "•• 4242" })).toContain("payload");
  });

  it("takes a reactivation back to a running status, with the day it resumed", () => {
    const parsed = parseProposalPayload("reactivated", {
      subscriptionStatus: { value: "active", status: "proposed", confidence: "high" },
      effectiveFrom: "2026-04-02",
      amountMinor: { value: 1599, status: "proposed" },
    });

    expect(parsed.success).toBe(true);
  });

  it("refuses a reactivation that leaves the subscription stopped", () => {
    expect(
      issues("reactivated", {
        subscriptionStatus: { value: "cancelled", status: "proposed" },
      }),
    ).toContain("subscriptionStatus");
    expect(issues("reactivated", { plan: "Standard" })).toContain("subscriptionStatus");
  });

  it("takes a reminder preference on an update, and still accepts old payloads that omit new fields", () => {
    const reminder = parseProposalPayload("update", {
      reminderPreferences: { renewal: { state: "off" } },
    });
    const old = parseProposalPayload("create", {
      provider: { value: "Substack", status: "proposed" },
      amountMinor: { value: 500, status: "proposed" },
    });

    expect(reminder.success).toBe(true);
    expect(old.success).toBe(true);
    if (old.success) {
      expect(old.payload.trialEndsOn).toBeUndefined();
      expect(old.payload.autoRenewal).toBeUndefined();
      expect(old.payload.reminderPreferences).toBeUndefined();
    }
  });

  it("strips leftover lead fields when a reminder is turned off", () => {
    const parsed = parseProposalPayload("update", {
      reminderPreferences: {
        renewal: { state: "off", leadValue: 1, leadUnit: "months" },
      },
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.payload.reminderPreferences).toEqual({ renewal: { state: "off" } });
    }
  });

  it("refuses confirmed auto-renewal or trial end in the payload", () => {
    expect(
      issues("update", {
        trialEndsOn: { value: "2026-09-14", status: "confirmed" },
      }),
    ).toContain("trialEndsOn.status");
    expect(
      issues("update", {
        autoRenewal: { value: "yes", status: "confirmed" },
      }),
    ).toContain("autoRenewal.status");
  });

  it("normalises blank text to null and upper-cases currency", () => {
    const parsed = parseProposalPayload("update", { plan: "  ", currency: "usd" });

    expect(parsed.success && parsed.payload).toEqual({ plan: null, currency: "USD" });
  });
});
