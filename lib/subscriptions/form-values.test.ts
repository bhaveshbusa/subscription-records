import { describe, expect, it } from "vitest";

import {
  needsTermsIntent,
  toEditBody,
  toSubscriptionFormTrust,
  toSubscriptionFormValues,
} from "./form-values";
import type { SubscriptionDetail } from "./projection";

const detail = {
  id: "00000000-0000-4000-8000-00000000a001",
  provider: { value: "TestCo", status: "confirmed", confidence: "high" },
  plan: { value: null, status: "empty", confidence: null },
  status: { value: "active", status: "confirmed", confidence: "high" },
  amount: { value: { minor: 999, currency: "GBP" }, status: "confirmed", confidence: "high" },
  cadence: { value: "monthly", status: "confirmed", confidence: "high" },
  nextRenewal: { value: "2026-09-12", status: "confirmed", confidence: "high" },
  trialEndsOn: { value: null, status: "empty", confidence: null },
  autoRenewal: { value: null, status: "empty", confidence: null },
  monthlyEquivalentMinor: 999,
  updatedAt: "2026-08-29T00:00:00.000Z",
  accountHint: null,
  startedOn: null,
  endsOn: null,
  notes: null,
  currency: "GBP",
  amendments: [],
  events: [],
} satisfies SubscriptionDetail;

describe("toSubscriptionFormValues", () => {
  it("prefills the form from a record", () => {
    expect(toSubscriptionFormValues(detail)).toEqual({
      provider: "TestCo",
      plan: "",
      accountHint: "",
      status: "active",
      amount: "9.99",
      cadence: "monthly",
      nextRenewal: "2026-09-12",
      startedOn: "",
      endsOn: "",
      trialEndsOn: "",
      autoRenewal: "",
      notes: "",
    });
  });

  it("shows an unknown term as a blank field rather than a zero", () => {
    expect(
      toSubscriptionFormValues({
        ...detail,
        amount: { value: null, status: "empty", confidence: null },
        cadence: { value: null, status: "empty", confidence: null },
        nextRenewal: { value: null, status: "empty", confidence: null },
        trialEndsOn: { value: null, status: "empty", confidence: null },
        autoRenewal: { value: null, status: "empty", confidence: null },
      }),
    ).toMatchObject({
      amount: "",
      cadence: "",
      nextRenewal: "",
      trialEndsOn: "",
      autoRenewal: "",
    });
  });
});

describe("toSubscriptionFormTrust", () => {
  it("copies money and date trust for the edit form", () => {
    expect(
      toSubscriptionFormTrust({
        ...detail,
        amount: { value: { minor: 5999, currency: "GBP" }, status: "inferred", confidence: "medium" },
        cadence: { value: "monthly", status: "proposed", confidence: "medium" },
        nextRenewal: { value: "2026-09-12", status: "inferred", confidence: "low" },
        trialEndsOn: { value: "2026-09-20", status: "proposed", confidence: "medium" },
        autoRenewal: { value: "yes", status: "inferred", confidence: "low" },
      }),
    ).toEqual({
      amount: "inferred",
      cadence: "proposed",
      nextRenewal: "inferred",
      trialEndsOn: "proposed",
      autoRenewal: "inferred",
    });
  });
});

describe("toEditBody", () => {
  const initial = toSubscriptionFormValues(detail);

  it("sends only notes when nothing else changed", () => {
    expect(
      toEditBody({
        initial,
        current: { ...initial, notes: "Keep this" },
        amountMinor: 999,
      }),
    ).toEqual({ ok: true, body: { notes: "Keep this" } });
  });

  it("does not send unchanged inferred money or dates, even if they are still filled", () => {
    const inferred = toSubscriptionFormValues({
      ...detail,
      amount: { value: { minor: 5999, currency: "GBP" }, status: "inferred", confidence: "medium" },
      cadence: { value: "monthly", status: "inferred", confidence: "medium" },
      nextRenewal: { value: "2026-09-12", status: "inferred", confidence: "low" },
    });

    expect(
      toEditBody({
        initial: inferred,
        current: { ...inferred, notes: "Checking" },
        amountMinor: 5999,
      }),
    ).toEqual({ ok: true, body: { notes: "Checking" } });
  });

  it("does not send unchanged trial end or auto-renewal on a notes-only save", () => {
    const inferred = toSubscriptionFormValues({
      ...detail,
      trialEndsOn: { value: "2026-09-20", status: "proposed", confidence: "medium" },
      autoRenewal: { value: "yes", status: "inferred", confidence: "low" },
    });

    expect(
      toEditBody({
        initial: inferred,
        current: { ...inferred, notes: "Checking" },
        amountMinor: 999,
      }),
    ).toEqual({ ok: true, body: { notes: "Checking" } });
  });

  it("can confirm an unchanged trial end or auto-renewal without sending other terms", () => {
    const withFacts = toSubscriptionFormValues({
      ...detail,
      trialEndsOn: { value: "2026-09-20", status: "proposed", confidence: "medium" },
      autoRenewal: { value: "yes", status: "inferred", confidence: "low" },
    });

    expect(
      toEditBody({
        initial: withFacts,
        current: withFacts,
        amountMinor: 999,
        confirm: {
          amount: false,
          cadence: false,
          nextRenewal: false,
          trialEndsOn: true,
          autoRenewal: true,
        },
      }),
    ).toEqual({
      ok: true,
      body: { trialEndsOn: "2026-09-20", autoRenewal: "yes" },
    });
  });

  it("can confirm an unchanged amount without sending other terms", () => {
    expect(
      toEditBody({
        initial,
        current: initial,
        amountMinor: 999,
        confirm: {
          amount: true,
          cadence: false,
          nextRenewal: false,
          trialEndsOn: false,
          autoRenewal: false,
        },
      }),
    ).toEqual({ ok: true, body: { amountMinor: 999 } });
  });

  it("asks whether a price change is a correction or a terms change", () => {
    expect(
      toEditBody({
        initial,
        current: { ...initial, amount: "12.99" },
        amountMinor: 1299,
      }),
    ).toMatchObject({
      ok: false,
      message: "Say whether this is a correction or an actual terms change.",
    });
  });

  it("records trial paid-plan amount and cadence without asking correction vs terms change", () => {
    const trial = toSubscriptionFormValues({
      ...detail,
      status: { value: "trial", status: "confirmed", confidence: "high" },
      amount: { value: null, status: "empty", confidence: null },
      cadence: { value: null, status: "empty", confidence: null },
      nextRenewal: { value: null, status: "empty", confidence: null },
    });

    expect(
      toEditBody({
        initial: trial,
        current: { ...trial, amount: "10.00", cadence: "monthly" },
        amountMinor: 1000,
      }),
    ).toEqual({ ok: true, body: { amountMinor: 1000, cadence: "monthly" } });
    expect(
      needsTermsIntent(trial, { ...trial, amount: "10.00", cadence: "monthly" }, null, 1000),
    ).toBe(false);
  });

  it("records a later trial paid-plan change in place, not as a terms change", () => {
    const trial = toSubscriptionFormValues({
      ...detail,
      status: { value: "trial", status: "confirmed", confidence: "high" },
    });

    expect(
      toEditBody({
        initial: trial,
        current: { ...trial, amount: "12.99" },
        amountMinor: 1299,
      }),
    ).toEqual({ ok: true, body: { amountMinor: 1299 } });
  });

  it("records a correction as the new amount only", () => {
    expect(
      toEditBody({
        initial,
        current: { ...initial, amount: "12.99" },
        amountMinor: 1299,
        termsIntent: "correction",
      }),
    ).toEqual({ ok: true, body: { amountMinor: 1299 } });
  });

  it("records an actual terms change with the user-specified effective date", () => {
    expect(
      toEditBody({
        initial,
        current: { ...initial, amount: "12.99" },
        amountMinor: 1299,
        termsIntent: "terms_change",
        termsEffectiveFrom: "2026-04-01",
      }),
    ).toEqual({
      ok: true,
      body: { amountMinor: 1299, termsChange: { effectiveFrom: "2026-04-01" } },
    });
  });

  it("refuses a terms change with no effective date", () => {
    expect(
      toEditBody({
        initial,
        current: { ...initial, amount: "12.99" },
        amountMinor: 1299,
        termsIntent: "terms_change",
        termsEffectiveFrom: "",
      }).ok,
    ).toBe(false);
  });

  it("changing cadence does not send auto-renewal", () => {
    expect(
      toEditBody({
        initial,
        current: { ...initial, cadence: "yearly" },
        amountMinor: 999,
        termsIntent: "correction",
      }),
    ).toEqual({ ok: true, body: { cadence: "yearly" } });
  });

  it("treats cancel as a status change only until save applies the lifecycle writer", () => {
    expect(
      toEditBody({
        initial,
        current: { ...initial, status: "cancelled", endsOn: "2026-03-01" },
        amountMinor: 999,
      }),
    ).toEqual({ ok: true, body: { status: "cancelled", endsOn: "2026-03-01" } });
  });
});
