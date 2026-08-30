import { describe, expect, it } from "vitest";

import { parseProposalPayload } from "@/lib/proposals/payload";

import {
  daysBetween,
  LAPSE_GRACE_DAYS,
  lapseConfidence,
  lapseCutoff,
  lapseRationale,
  lapseSkipReason,
  toLapsePayload,
} from "./lapse-scan";

const NOW = new Date("2026-03-20T09:00:00.000Z");

describe("lapse scan window", () => {
  it("leaves renewals inside the grace period alone", () => {
    expect(lapseCutoff(NOW)).toBe("2026-03-13");
    expect(daysBetween(lapseCutoff(NOW), "2026-03-20")).toBe(LAPSE_GRACE_DAYS);
  });
});

describe("lapse decision", () => {
  const base = {
    renewalDue: "2026-02-20",
    lastPaidOn: null,
    hasPendingLapse: false,
    declinedRenewals: [] as string[],
  };

  it("raises an overdue renewal with no payment since", () => {
    expect(lapseSkipReason(base)).toBeNull();
  });

  it("leaves a subscription that was paid on or after the renewal", () => {
    expect(lapseSkipReason({ ...base, lastPaidOn: "2026-02-20" })).toBe("billing_continued");
    expect(lapseSkipReason({ ...base, lastPaidOn: "2026-03-01" })).toBe("billing_continued");
  });

  it("still raises when the last payment is the period before the missed renewal", () => {
    expect(lapseSkipReason({ ...base, lastPaidOn: "2026-01-20" })).toBeNull();
  });

  it("does not ask twice while a lapse is waiting in the inbox", () => {
    expect(lapseSkipReason({ ...base, hasPendingLapse: true })).toBe("already_proposed");
  });

  it("does not ask again about a renewal the user rejected", () => {
    expect(lapseSkipReason({ ...base, declinedRenewals: ["2026-02-20"] })).toBe("declined");
    expect(lapseSkipReason({ ...base, declinedRenewals: ["2026-01-20"] })).toBeNull();
  });
});

describe("lapse proposal", () => {
  it("proposes the status rather than confirming it, and ends on the missed renewal", () => {
    const payload = toLapsePayload({
      next_renewal: "2026-02-20",
      renewal_field_status: "confirmed",
    });
    const parsed = parseProposalPayload("lapsed", payload);

    expect(parsed.success).toBe(true);
    expect(payload).toMatchObject({
      subscriptionStatus: { value: "lapsed", status: "proposed", confidence: "medium" },
      endsOn: "2026-02-20",
    });
  });

  it("trusts an inferred renewal date less than a confirmed one", () => {
    expect(lapseConfidence({ renewal_field_status: "confirmed" })).toBe("medium");
    expect(lapseConfidence({ renewal_field_status: "inferred" })).toBe("low");
    expect(lapseConfidence({ renewal_field_status: "proposed" })).toBe("low");
  });

  it("says how overdue the renewal is", () => {
    expect(lapseRationale({ next_renewal: "2026-02-20" }, NOW)).toContain("2026-02-20");
    expect(lapseRationale({ next_renewal: "2026-02-20" }, NOW)).toContain("28 days ago");
  });
});
