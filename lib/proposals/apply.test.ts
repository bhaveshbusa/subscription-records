import { describe, expect, it } from "vitest";

import type { SubscriptionRow } from "@/lib/subscriptions/projection";

import { toProposedInsertValues, toProposedUpdateValues } from "./apply";

const NOW = new Date("2026-03-01T00:00:00.000Z");

function row(overrides: Partial<SubscriptionRow> = {}): SubscriptionRow {
  return {
    id: "00000000-0000-4000-8000-00000000aa01",
    user_id: "00000000-0000-4000-8000-000000000001",
    provider_canonical: "netflix",
    provider_display: "Netflix",
    plan: "Standard",
    account_hint: null,
    status: "active",
    amount_minor: 1599,
    currency: "GBP",
    cadence: "monthly",
    next_renewal: "2026-03-12",
    started_on: null,
    ends_on: null,
    notes: null,
    provider_field_status: "confirmed",
    amount_field_status: "confirmed",
    cadence_field_status: "confirmed",
    renewal_field_status: "confirmed",
    status_field_status: "confirmed",
    amount_confidence: "high",
    cadence_confidence: "high",
    renewal_confidence: "high",
    provider_confidence: "high",
    status_confidence: "high",
    deferred_until: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  } as SubscriptionRow;
}

describe("toProposedInsertValues", () => {
  it("keeps the payload's trust, so money and dates stay proposed", () => {
    const values = toProposedInsertValues("00000000-0000-4000-8000-000000000001", {
      provider: { value: "Substack", status: "confirmed", confidence: "high" },
      amountMinor: { value: 500, status: "proposed", confidence: "medium" },
      cadence: { value: "monthly", status: "inferred" },
      nextRenewal: { value: "2026-09-12", status: "proposed", confidence: "low" },
      subscriptionStatus: { value: "active", status: "proposed" },
    });

    expect(values).toMatchObject({
      provider_canonical: "substack",
      provider_display: "Substack",
      provider_field_status: "confirmed",
      amount_minor: 500,
      amount_field_status: "proposed",
      amount_confidence: "medium",
      cadence: "monthly",
      cadence_field_status: "inferred",
      cadence_confidence: null,
      next_renewal: "2026-09-12",
      renewal_field_status: "proposed",
      status: "active",
      status_field_status: "proposed",
    });
  });

  it("leaves fields the payload omits empty rather than guessing", () => {
    const values = toProposedInsertValues("00000000-0000-4000-8000-000000000001", {
      provider: { value: "Substack", status: "inferred" },
    });

    expect(values).toMatchObject({
      status: "unknown",
      amount_minor: null,
      amount_field_status: "empty",
      cadence: null,
      cadence_field_status: "empty",
      next_renewal: null,
      renewal_field_status: "empty",
      currency: "GBP",
    });
  });
});

describe("toProposedUpdateValues", () => {
  it("only touches the fields the payload carries", () => {
    const { values, conflicts } = toProposedUpdateValues(
      row({ amount_field_status: "proposed" }),
      { plan: "Family" },
      NOW,
    );

    expect(values).toEqual({ plan: "Family", updated_at: NOW });
    expect(conflicts).toEqual([]);
  });

  it("applies terms over an unconfirmed field, keeping the proposal's status", () => {
    const { values, conflicts } = toProposedUpdateValues(
      row({ amount_field_status: "proposed", cadence_field_status: "empty", cadence: null }),
      {
        amountMinor: { value: 1799, status: "inferred", confidence: "medium" },
        cadence: { value: "yearly", status: "proposed" },
      },
      NOW,
    );

    expect(values).toMatchObject({
      amount_minor: 1799,
      amount_field_status: "inferred",
      amount_confidence: "medium",
      cadence: "yearly",
      cadence_field_status: "proposed",
    });
    expect(conflicts).toEqual([]);
  });

  it("flags a confirmed field instead of overwriting it", () => {
    const { values, conflicts } = toProposedUpdateValues(
      row(),
      {
        amountMinor: { value: 1799, status: "proposed" },
        nextRenewal: { value: "2026-04-12", status: "proposed" },
      },
      NOW,
    );

    expect(values).toEqual({
      amount_field_status: "conflicted",
      renewal_field_status: "conflicted",
      updated_at: NOW,
    });
    expect(conflicts).toEqual(["amount", "nextRenewal"]);
  });

  it("agreeing with a confirmed field is neither a write nor a conflict", () => {
    const { values, conflicts } = toProposedUpdateValues(
      row(),
      { amountMinor: { value: 1599, status: "proposed" } },
      NOW,
    );

    expect(values).toEqual({ updated_at: NOW });
    expect(conflicts).toEqual([]);
  });
});
