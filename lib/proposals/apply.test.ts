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
      trial_ends_on: null,
      auto_renewal: null,
      notes: null,
      provider_field_status: "confirmed",
      amount_field_status: "confirmed",
      cadence_field_status: "confirmed",
      renewal_field_status: "confirmed",
      status_field_status: "confirmed",
      trial_end_field_status: "empty",
      auto_renewal_field_status: "empty",
      amount_confidence: "high",
      cadence_confidence: "high",
      renewal_confidence: "high",
      provider_confidence: "high",
      status_confidence: "high",
      trial_end_confidence: null,
      auto_renewal_confidence: null,
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
      /** Accepting the card established the status it displayed (SUB-60). */
      status_field_status: "confirmed",
      trial_ends_on: null,
      trial_end_field_status: "empty",
      auto_renewal: null,
      auto_renewal_field_status: "empty",
    });
  });

  it("confirms the provider alone when the person says the name is right", () => {
    const values = toProposedInsertValues(
      "00000000-0000-4000-8000-000000000001",
      {
        provider: { value: "Figma", status: "proposed", confidence: "high" },
        amountMinor: { value: 500, status: "proposed", confidence: "medium" },
        cadence: { value: "monthly", status: "inferred", confidence: "low" },
      },
      { provider: true },
    );

    expect(values).toMatchObject({
      provider_display: "Figma",
      provider_field_status: "confirmed",
      provider_confidence: null,
      amount_field_status: "proposed",
      cadence_field_status: "inferred",
    });
  });

  it("a provider confirmation on an update overrides a conflicting confirmed name", () => {
    const { values, conflicts } = toProposedUpdateValues(
      row({ provider_display: "Netflx", provider_field_status: "confirmed" }),
      { provider: { value: "Netflix", status: "proposed", confidence: "high" } },
      NOW,
      { provider: true },
    );

    expect(conflicts).toEqual([]);
    expect(values).toMatchObject({
      provider_display: "Netflix",
      provider_field_status: "confirmed",
    });
    expect(values.amount_minor).toBeUndefined();
  });

  it("confirms only the terms the person set on the card", () => {
    const values = toProposedInsertValues(
      "00000000-0000-4000-8000-000000000001",
      {
        provider: { value: "Figma", status: "proposed", confidence: "high" },
        amountMinor: { value: 500, status: "proposed", confidence: "medium" },
        nextRenewal: { value: "2026-09-12", status: "proposed" },
      },
      { amountMinor: 1200, currency: "USD" },
    );

    expect(values).toMatchObject({
      amount_minor: 1200,
      amount_field_status: "confirmed",
      amount_confidence: null,
      currency: "USD",
      next_renewal: "2026-09-12",
      renewal_field_status: "proposed",
    });
  });

  it("establishes the status the card displayed, and nothing else with it", () => {
    const values = toProposedInsertValues("00000000-0000-4000-8000-000000000001", {
      provider: { value: "Spotify", status: "proposed", confidence: "high" },
      subscriptionStatus: { value: "active", status: "inferred", confidence: null },
      amountMinor: { value: 999, status: "proposed", confidence: "medium" },
    });

    expect(values).toMatchObject({
      status: "active",
      /** Accepting is the person's own decision about their own ledger. */
      status_field_status: "confirmed",
      status_confidence: null,
      /** Status is not money: the amount is still only proposed. */
      amount_minor: 999,
      amount_field_status: "proposed",
    });
  });

  it("takes the status the person picked on the card over the one it read", () => {
    const values = toProposedInsertValues(
      "00000000-0000-4000-8000-000000000001",
      {
        provider: { value: "Figma", status: "proposed", confidence: "high" },
        subscriptionStatus: { value: "active", status: "inferred", confidence: null },
      },
      { subscriptionStatus: "trial" },
    );

    expect(values).toMatchObject({
      status: "trial",
      status_field_status: "confirmed",
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
      trial_ends_on: null,
      trial_end_field_status: "empty",
      auto_renewal: null,
      auto_renewal_field_status: "empty",
      currency: "GBP",
    });
  });

  it("writes proposed trial end and auto-renewal from the payload", () => {
    const values = toProposedInsertValues("00000000-0000-4000-8000-000000000001", {
      provider: { value: "Canva", status: "proposed", confidence: "high" },
      subscriptionStatus: { value: "trial", status: "proposed" },
      trialEndsOn: { value: "2026-09-14", status: "proposed" },
      autoRenewal: { value: "yes", status: "proposed" },
      amountMinor: { value: 1000, status: "proposed" },
      cadence: { value: "monthly", status: "proposed" },
    });

    expect(values).toMatchObject({
      status: "trial",
      trial_ends_on: "2026-09-14",
      trial_end_field_status: "proposed",
      auto_renewal: "yes",
      auto_renewal_field_status: "proposed",
      amount_minor: 1000,
      amount_field_status: "proposed",
      next_renewal: null,
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

  it("keeps a settled status against a reading that disagrees with it", () => {
    const { values, conflicts } = toProposedUpdateValues(
      row({ status: "trial", status_field_status: "confirmed" }),
      { subscriptionStatus: { value: "active", status: "proposed", confidence: "low" } },
      NOW,
    );

    /** An update proposes; it does not get to overwrite a settled answer. */
    expect(values.status).toBeUndefined();
    expect(values.status_field_status).toBe("conflicted");
    expect(conflicts).toEqual(["status"]);
  });

  it("lets the person's own pick change a settled status", () => {
    const { values, conflicts } = toProposedUpdateValues(
      row({ status: "trial", status_field_status: "confirmed" }),
      { subscriptionStatus: { value: "active", status: "proposed", confidence: "low" } },
      NOW,
      { subscriptionStatus: "paused" },
    );

    expect(values).toMatchObject({ status: "paused", status_field_status: "confirmed" });
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

  it("a confirmation from the card overrides a confirmed field instead of conflicting", () => {
    const { values, conflicts } = toProposedUpdateValues(
      row(),
      { amountMinor: { value: 1799, status: "proposed" } },
      NOW,
      { amountMinor: 1899 },
    );

    expect(values).toMatchObject({
      amount_minor: 1899,
      amount_field_status: "confirmed",
      amount_confidence: null,
    });
    expect(conflicts).toEqual([]);
  });

  it("confirms a term the proposal never quoted", () => {
    const { values } = toProposedUpdateValues(
      row({ cadence: null, cadence_field_status: "empty" }),
      { plan: "Family" },
      NOW,
      { cadence: "yearly" },
    );

    expect(values).toMatchObject({ cadence: "yearly", cadence_field_status: "confirmed" });
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

  it("flags confirmed trial end and auto-renewal instead of overwriting them", () => {
    const { values, conflicts } = toProposedUpdateValues(
      row({
        trial_ends_on: "2026-09-14",
        trial_end_field_status: "confirmed",
        auto_renewal: "yes",
        auto_renewal_field_status: "confirmed",
      }),
      {
        trialEndsOn: { value: "2026-10-01", status: "proposed" },
        autoRenewal: { value: "no", status: "proposed" },
      },
      NOW,
    );

    expect(values).toEqual({
      trial_end_field_status: "conflicted",
      auto_renewal_field_status: "conflicted",
      updated_at: NOW,
    });
    expect(conflicts).toEqual(["trialEndsOn", "autoRenewal"]);
  });

  it("omitting trial and auto-renewal leaves those columns untouched", () => {
    const { values } = toProposedUpdateValues(
      row({
        trial_ends_on: "2026-09-14",
        trial_end_field_status: "confirmed",
        auto_renewal: "yes",
        auto_renewal_field_status: "confirmed",
      }),
      { plan: "Family" },
      NOW,
    );

    expect(values).toEqual({ plan: "Family", updated_at: NOW });
  });
});
