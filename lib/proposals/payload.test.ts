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

  it("normalises blank text to null and upper-cases currency", () => {
    const parsed = parseProposalPayload("update", { plan: "  ", currency: "usd" });

    expect(parsed.success && parsed.payload).toEqual({ plan: null, currency: "USD" });
  });
});
