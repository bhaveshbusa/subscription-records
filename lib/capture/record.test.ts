import { describe, expect, it } from "vitest";

import type { ExtractionCandidate } from "./candidates";
import type { LedgerEntry } from "./match";
import { toChargePayload, toUpdatePayload } from "./record";

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

describe("toChargePayload", () => {
  it("carries the payment, and no terms for it to overwrite", () => {
    const payload = toChargePayload(
      candidate({ paidOn: "2026-03-04", amountMinor: 1499, currency: "GBP" }),
      row(),
    );

    expect(payload).toEqual({
      charge: {
        paidOn: "2026-03-04",
        amountMinor: 1499,
        currency: "GBP",
        idempotencyKey: "chat:00000000-0000-4000-8000-00000000aa01:2026-03-04:1499:GBP",
      },
    });
  });

  it("gives the same payment the same key however often it is reported", () => {
    const first = toChargePayload(
      candidate({ paidOn: "2026-03-04", amountMinor: 1599 }),
      row(),
    );
    const again = toChargePayload(
      candidate({ paidOn: "2026-03-04", amountMinor: 1599, evidence: "paid again" }),
      row(),
    );

    expect(first?.charge?.idempotencyKey).toBe(again?.charge?.idempotencyKey);
  });

  it("falls back to the currency the ledger already records", () => {
    const payload = toChargePayload(
      candidate({ paidOn: "2026-03-04", amountMinor: 1599 }),
      row({ currency: "USD" }),
    );

    expect(payload?.charge).toMatchObject({ currency: "USD" });
  });

  it("is nothing without an amount, because a charge needs one", () => {
    expect(toChargePayload(candidate({ paidOn: "2026-03-04" }), row())).toBeNull();
    expect(toChargePayload(candidate({ amountMinor: 1599 }), row())).toBeNull();
  });
});
