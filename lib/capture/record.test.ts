import { describe, expect, it } from "vitest";

import type { ExtractionCandidate } from "./candidates";
import type { LedgerEntry } from "./match";
import {
  inferredRenewalFromPaidOn,
  toLifecyclePayload,
  toReactivationPayload,
  toUpdatePayload,
} from "./record";

function row(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: "00000000-0000-4000-8000-00000000aa01",
    provider_canonical: "netflix",
    provider_display: "Netflix",
    status: "active",
    amount_minor: 1599,
    currency: "GBP",
    cadence: "monthly",
    next_renewal: "2026-09-12",
    plan: "Standard",
    account_hint: null,
    amount_field_status: "confirmed",
    cadence_field_status: "confirmed",
    renewal_field_status: "confirmed",
    status_field_status: "confirmed",
    ...overrides,
  };
}

function candidate(overrides: Partial<ExtractionCandidate> = {}): ExtractionCandidate {
  return {
    provider: "Netflix",
    amountMinor: null,
    currency: null,
    cadence: null,
    nextRenewal: null,
    confidence: "high",
    evidence: "Netflix",
    ...overrides,
  };
}

describe("toUpdatePayload", () => {
  it("carries only what the message adds", () => {
    expect(
      toUpdatePayload(candidate({ amountMinor: 1799, cadence: "monthly" }), row()),
    ).toEqual({
      amountMinor: { value: 1799, status: "proposed", confidence: "high" },
    });
  });

  it("never re-proposes the provider, so identity stays the ledger's", () => {
    const payload = toUpdatePayload(candidate({ plan: "Family" }), row());

    expect(payload).toEqual({ plan: "Family" });
  });

  it("is nothing when the message repeats what is already recorded", () => {
    expect(
      toUpdatePayload(
        candidate({ amountMinor: 1599, cadence: "monthly", nextRenewal: "2026-09-12" }),
        row(),
      ),
    ).toBeNull();
  });

  it("proposes money rather than confirming it", () => {
    const payload = toUpdatePayload(
      candidate({ amountMinor: 900 }),
      row({ amount_minor: null, amount_field_status: "empty" }),
    );

    expect(payload?.amountMinor).toMatchObject({ status: "proposed" });
  });
});

describe("toLifecyclePayload", () => {
  it("carries the status and nothing that could rewrite the terms", () => {
    expect(toLifecyclePayload("cancelled", null, row(), "high")).toEqual({
      subscriptionStatus: { value: "cancelled", status: "proposed", confidence: "high" },
    });
  });

  it("ends a cancellation that runs on at the renewal that will not happen", () => {
    expect(toLifecyclePayload("cancel_scheduled", null, row(), "high")).toEqual({
      subscriptionStatus: {
        value: "cancel_scheduled",
        status: "proposed",
        confidence: "high",
      },
      endsOn: "2026-09-12",
    });
  });

  it("prefers the end date the message stated", () => {
    expect(
      toLifecyclePayload("cancel_scheduled", "2026-10-01", row(), "high").endsOn,
    ).toBe("2026-10-01");
  });

  it("invents no end date for a subscription with no renewal on record", () => {
    expect(
      toLifecyclePayload("cancel_scheduled", null, row({ next_renewal: null }), "low"),
    ).toEqual({
      subscriptionStatus: {
        value: "cancel_scheduled",
        status: "proposed",
        confidence: "low",
      },
    });
  });
});

describe("toReactivationPayload", () => {
  it("brings the record back to running without renaming it", () => {
    expect(
      toReactivationPayload(
        candidate({ evidence: "I resubscribed to Netflix" }),
        row({ status: "cancelled" }),
      ),
    ).toEqual({
      subscriptionStatus: { value: "active", status: "proposed", confidence: "high" },
    });
  });

  it("carries the receipt as resumed terms, not as a payment", () => {
    const payload = toReactivationPayload(
      candidate({ paidOn: "2026-04-02", amountMinor: 1799 }),
      row({ status: "cancelled", amount_field_status: "confirmed" }),
    );

    expect(payload.charge).toBeUndefined();
    expect(payload.effectiveFrom).toBe("2026-04-02");
    expect(payload.amountMinor).toMatchObject({ value: 1799, status: "proposed" });
  });

  it("proposes the resumed terms the message states", () => {
    expect(
      toReactivationPayload(
        candidate({ evidence: "back on Netflix, £17.99 a month", amountMinor: 1799 }),
        row({ status: "cancelled" }),
      ).amountMinor,
    ).toMatchObject({ value: 1799, status: "proposed" });
  });
});

describe("inferredRenewalFromPaidOn", () => {
  it("advances from the paid date when cadence is known and renewal is not confirmed", () => {
    expect(
      inferredRenewalFromPaidOn(
        row({ cadence: "monthly", next_renewal: null, renewal_field_status: "empty" }),
        "2026-03-04",
      ),
    ).toBe("2026-04-04");
  });

  it("does not invent a date over a confirmed renewal", () => {
    expect(inferredRenewalFromPaidOn(row(), "2026-03-04")).toBeNull();
  });

  it("keeps a stored future date rather than replacing it", () => {
    expect(
      inferredRenewalFromPaidOn(
        row({ next_renewal: "2026-09-12", renewal_field_status: "inferred" }),
        "2026-03-04",
      ),
    ).toBeNull();
  });
});

describe("toUpdatePayload from a receipt", () => {
  it("proposes a new cost from a receipt, not a charge", () => {
    expect(
      toUpdatePayload(candidate({ paidOn: "2026-03-04", amountMinor: 1499 }), row()),
    ).toEqual({
      amountMinor: { value: 1499, status: "proposed", confidence: "high" },
    });
  });

  it("infers next due from paid-on plus cadence when renewal is not confirmed", () => {
    expect(
      toUpdatePayload(
        candidate({ paidOn: "2026-03-04", amountMinor: 1599 }),
        row({
          amount_minor: 1599,
          next_renewal: null,
          renewal_field_status: "empty",
        }),
      ),
    ).toEqual({
      nextRenewal: { value: "2026-04-04", status: "inferred", confidence: "high" },
    });
  });

  it("is nothing when the receipt repeats a confirmed amount and schedule", () => {
    expect(
      toUpdatePayload(candidate({ paidOn: "2026-03-04", amountMinor: 1599 }), row()),
    ).toBeNull();
  });
});
