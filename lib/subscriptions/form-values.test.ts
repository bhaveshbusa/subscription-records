import { describe, expect, it } from "vitest";

import { emptyReminderPreferencesView } from "@/lib/reminders/preferences";
import {
  canRecordTermsChange,
  EMPTY_FORM_CONFIRM,
  needsTermsIntent,
  termsEdits,
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
  reminderPreferences: emptyReminderPreferencesView({
    cadence: "monthly",
    nextRenewal: "2026-09-12",
  }),
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
      currency: "GBP",
      cadence: "monthly",
      nextRenewal: "2026-09-12",
      startedOn: "",
      endsOn: "",
      trialEndsOn: "",
      autoRenewal: "",
      notes: "",
      renewalReminder: "unset",
      renewalLeadValue: "",
      renewalLeadUnit: "",
      trialReminder: "unset",
      trialLeadValue: "3",
      trialLeadUnit: "days",
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
      provider: "confirmed",
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

  it("does not send reminder preferences on a notes-only save", () => {
    expect(
      toEditBody({
        initial,
        current: { ...initial, notes: "Keep this" },
        amountMinor: 999,
      }),
    ).toEqual({ ok: true, body: { notes: "Keep this" } });
  });

  it("sends a renewal reminder choice without treating cadence as consent", () => {
    expect(
      toEditBody({
        initial,
        current: {
          ...initial,
          cadence: "yearly",
          renewalReminder: "enabled",
          renewalLeadValue: "1",
          renewalLeadUnit: "months",
        },
        amountMinor: 999,
        termsIntent: "correction",
      }),
    ).toEqual({
      ok: true,
      body: {
        cadence: "yearly",
        reminderPreferences: {
          renewal: { state: "enabled", leadValue: 1, leadUnit: "months" },
        },
      },
    });
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
          provider: false,
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
          provider: false,
          amount: true,
          cadence: false,
          nextRenewal: false,
          trialEndsOn: false,
          autoRenewal: false,
        },
      }),
    ).toEqual({ ok: true, body: { amountMinor: 999 } });
  });

  it("confirms the provider alone, sending its unchanged name and nothing else", () => {
    expect(
      toEditBody({
        initial,
        current: initial,
        amountMinor: 999,
        confirm: { ...EMPTY_FORM_CONFIRM, provider: true },
      }),
    ).toEqual({ ok: true, body: { provider: "TestCo" } });
  });

  it("prefills the currency and sends it only when it changes, together with the amount", () => {
    expect(initial.currency).toBe("GBP");
    expect(
      toEditBody({
        initial,
        current: { ...initial, currency: "USD" },
        amountMinor: 999,
        termsIntent: "correction",
      }),
    ).toEqual({ ok: true, body: { amountMinor: 999, currency: "USD" } });
    expect(termsEdits(initial, { ...initial, currency: "USD" }, 999, 999)).toEqual([
      {
        field: "amount",
        change: "replaced",
        from: 999,
        to: 999,
        fromCurrency: "GBP",
        toCurrency: "USD",
      },
    ]);
    expect(needsTermsIntent(initial, { ...initial, currency: "USD" }, 999, 999)).toBe(true);
  });

  it("filling a blank amount in a new currency is completion, not a terms change", () => {
    const blank = { ...initial, amount: "" };

    expect(
      toEditBody({
        initial: blank,
        current: { ...blank, amount: "4.99", currency: "EUR" },
        amountMinor: 499,
      }),
    ).toEqual({ ok: true, body: { amountMinor: 499, currency: "EUR" } });
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

  it("saves a price nobody had recorded without asking what kind of edit it is", () => {
    const blank = toSubscriptionFormValues({
      ...detail,
      amount: { value: null, status: "empty", confidence: null },
      cadence: { value: null, status: "empty", confidence: null },
    });

    expect(needsTermsIntent(blank, { ...blank, amount: "12.99" }, null, 1299)).toBe(false);
    expect(
      toEditBody({
        initial: blank,
        current: { ...blank, amount: "12.99", cadence: "monthly" },
        amountMinor: 1299,
      }),
    ).toEqual({ ok: true, body: { amountMinor: 1299, cadence: "monthly" } });
  });

  it("saves a plan nobody had recorded the same way", () => {
    expect(needsTermsIntent(initial, { ...initial, plan: "Family" }, 999, 999)).toBe(false);
    expect(
      toEditBody({
        initial,
        current: { ...initial, plan: "Family" },
        amountMinor: 999,
      }),
    ).toEqual({ ok: true, body: { plan: "Family" } });
  });

  it("does not ask about clearing a value back to unknown", () => {
    expect(needsTermsIntent(initial, { ...initial, amount: "" }, 999, null)).toBe(false);
    expect(
      toEditBody({ initial, current: { ...initial, amount: "" }, amountMinor: null }),
    ).toEqual({ ok: true, body: { amountMinor: null } });
  });

  it("asks nothing when an unchanged value is confirmed or only notes are saved", () => {
    expect(needsTermsIntent(initial, initial, 999, 999)).toBe(false);
    expect(
      toEditBody({
        initial,
        current: initial,
        amountMinor: 999,
        confirm: { ...EMPTY_FORM_CONFIRM, amount: true },
      }),
    ).toEqual({ ok: true, body: { amountMinor: 999 } });
    expect(
      toEditBody({
        initial,
        current: { ...initial, notes: "on the joint card" },
        amountMinor: 999,
      }),
    ).toEqual({ ok: true, body: { notes: "on the joint card" } });
  });

  it("still asks when a recorded value is replaced by a different one", () => {
    expect(needsTermsIntent(initial, { ...initial, amount: "12.99" }, 999, 1299)).toBe(true);
    expect(
      toEditBody({ initial, current: { ...initial, amount: "12.99" }, amountMinor: 1299 }),
    ).toEqual({
      ok: false,
      message: "Say whether this is a correction or an actual terms change.",
    });
  });

  it("keeps the terms-change action available when the old terms were unknown", () => {
    const blank = toSubscriptionFormValues({
      ...detail,
      amount: { value: null, status: "empty", confidence: null },
    });

    expect(canRecordTermsChange(blank, { ...blank, amount: "15.00" }, null, 1500)).toBe(true);
    expect(
      toEditBody({
        initial: blank,
        current: { ...blank, amount: "15.00" },
        amountMinor: 1500,
        termsIntent: "terms_change",
        termsEffectiveFrom: "2026-03-01",
      }),
    ).toEqual({
      ok: true,
      body: { amountMinor: 1500, termsChange: { effectiveFrom: "2026-03-01" } },
    });
  });

  it("refuses a terms change on an edit that changes no terms", () => {
    expect(
      toEditBody({
        initial,
        current: { ...initial, notes: "moved to the joint card" },
        amountMinor: 999,
        termsIntent: "terms_change",
        termsEffectiveFrom: "2026-03-01",
      }),
    ).toMatchObject({ ok: false });
  });

  it("completes one field and changes another in a single edit", () => {
    const partial = toSubscriptionFormValues({
      ...detail,
      cadence: { value: null, status: "empty", confidence: null },
    });
    const current = { ...partial, cadence: "monthly" as const, amount: "12.99" };

    /** The replaced amount is what makes the question worth asking. */
    expect(needsTermsIntent(partial, current, 999, 1299)).toBe(true);
    expect(termsEdits(partial, current, 999, 1299)).toEqual([
      { field: "amount", change: "replaced", from: 999, to: 1299 },
      { field: "cadence", change: "first_fill", from: null, to: "monthly" },
    ]);
    expect(
      toEditBody({
        initial: partial,
        current,
        amountMinor: 1299,
        termsIntent: "terms_change",
        termsEffectiveFrom: "2026-08-01",
      }),
    ).toEqual({
      ok: true,
      body: {
        amountMinor: 1299,
        cadence: "monthly",
        termsChange: { effectiveFrom: "2026-08-01" },
      },
    });
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
