import { describe, expect, it } from "vitest";


import type { ExtractionCandidate } from "./candidates";
import type { LedgerEntry } from "./match";
import {
  changesTerms,
  inferredRenewalFromPaidOn,
  toCreatePayload,
  toLifecyclePayload,
  toReactivationPayload,
  toUpdatePayload,
} from "./record";

const NOW = new Date("2026-09-10T09:00:00.000Z");

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
    trial_ends_on: null,
    auto_renewal: null,
    trial_end_field_status: "empty",
    auto_renewal_field_status: "empty",
    reminderPreferences: [],
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

  it("proposes trial end and auto-renewal without confirming them", () => {
    const payload = toUpdatePayload(
      candidate({
        trialEndsOn: "2026-09-14",
        autoRenewal: "yes",
        subscriptionStatus: "trial",
        amountMinor: 1000,
        cadence: "monthly",
      }),
      row({
        amount_minor: null,
        amount_field_status: "empty",
        cadence: null,
        cadence_field_status: "empty",
      }),
    );

    expect(payload).toMatchObject({
      trialEndsOn: { value: "2026-09-14", status: "proposed" },
      autoRenewal: { value: "yes", status: "proposed" },
      subscriptionStatus: { value: "trial", status: "proposed" },
      amountMinor: { value: 1000, status: "proposed" },
    });
    expect(payload?.nextRenewal).toBeUndefined();
  });

  it("proposes a reminder change against the existing holding", () => {
    expect(
      toUpdatePayload(
        candidate({
          reminderPreferences: { renewal: { state: "enabled", leadValue: 1, leadUnit: "months" } },
        }),
        row(),
      ),
    ).toEqual({
      reminderPreferences: { renewal: { state: "enabled", leadValue: 1, leadUnit: "months" } },
    });
  });

  it("does not re-propose a reminder the row already holds", () => {
    expect(
      toUpdatePayload(
        candidate({
          reminderPreferences: { renewal: { state: "off" } },
        }),
        row({
          reminderPreferences: [
            { target: "renewal", state: "off", leadValue: null, leadUnit: null },
          ],
        }),
      ),
    ).toBeNull();
  });
});

describe("toUpdatePayload and status", () => {
  it("does not reset a trial to active when the message only carries a price", () => {
    const payload = toUpdatePayload(
      candidate({ amountMinor: 1299, cadence: "monthly", evidence: "Netflix is £12.99" }),
      row({ status: "trial", amount_minor: null, amount_field_status: "empty" }),
      NOW,
    );

    expect(payload?.amountMinor).toMatchObject({ value: 1299 });
    /** The default active a new holding gets never reaches an existing row. */
    expect(payload?.subscriptionStatus).toBeUndefined();
  });

  it("does not reset a cancelled record to active either", () => {
    const payload = toUpdatePayload(
      candidate({ amountMinor: 1599, evidence: "Netflix is £15.99 now" }),
      row({ status: "cancelled", amount_minor: 1299, amount_field_status: "proposed" }),
      NOW,
    );

    expect(payload?.subscriptionStatus).toBeUndefined();
  });

  it("still proposes a status the message actually states", () => {
    const payload = toUpdatePayload(
      candidate({
        subscriptionStatus: "trial",
        trialEndsOn: "2026-10-10",
        evidence: "I am on a Netflix trial until 10 October",
      }),
      row({ status: "active" }),
      NOW,
    );

    expect(payload?.subscriptionStatus).toMatchObject({
      value: "trial",
      status: "proposed",
    });
  });
});

describe("changesTerms", () => {
  const priced = row({ amount_minor: 1299, cadence: "monthly", plan: null });
  const blank = row({ amount_minor: null, cadence: null, plan: null });

  it("calls a first price an update, because there is nothing to supersede", () => {
    const payload = toUpdatePayload(candidate({ amountMinor: 1499 }), blank, NOW);

    expect(payload?.amountMinor).toMatchObject({ value: 1499 });
    expect(changesTerms(payload!, blank)).toBe(false);
  });

  it("calls a replaced price a change of terms", () => {
    const payload = toUpdatePayload(candidate({ amountMinor: 1499 }), priced, NOW);

    expect(changesTerms(payload!, priced)).toBe(true);
  });

  it("treats a first cadence and a first plan the same way", () => {
    expect(
      changesTerms(toUpdatePayload(candidate({ cadence: "monthly" }), blank, NOW)!, blank),
    ).toBe(false);
    expect(changesTerms(toUpdatePayload(candidate({ plan: "Pro" }), blank, NOW)!, blank)).toBe(
      false,
    );
    expect(
      changesTerms(toUpdatePayload(candidate({ cadence: "yearly" }), priced, NOW)!, priced),
    ).toBe(true);
  });

  it("leaves a trial's after-trial price an ordinary update", () => {
    const trial = row({ status: "trial", amount_minor: 1000, cadence: "monthly" });

    expect(changesTerms(toUpdatePayload(candidate({ amountMinor: 1299 }), trial, NOW)!, trial)).toBe(
      false,
    );
  });

  it("is not news about the terms when only a date moves", () => {
    const payload = toUpdatePayload(
      candidate({ nextRenewal: "2026-10-12" }),
      priced,
      NOW,
    );

    expect(changesTerms(payload!, priced)).toBe(false);
  });
});

describe("toCreatePayload", () => {
  it("reads a new subscription as one the person holds", () => {
    const payload = toCreatePayload(candidate({ provider: "Spotify" }), NOW);

    expect(payload.subscriptionStatus).toEqual({
      value: "active",
      status: "inferred",
      confidence: null,
    });
  });

  it("does not wait for a price or a date to call it a holding", () => {
    expect(
      toCreatePayload(
        candidate({ provider: "ChatGPT", amountMinor: 1000, cadence: "monthly" }),
        NOW,
      ).subscriptionStatus,
    ).toMatchObject({ value: "active" });
    expect(
      toCreatePayload(candidate({ provider: "Mobbin" }), NOW).subscriptionStatus,
    ).toMatchObject({ value: "active" });
  });

  it("proposes a current trial, with the paid plan left after trial", () => {
    const payload = toCreatePayload(
      candidate({
        provider: "ChatGPT",
        trialEndsOn: "2026-10-10",
        amountMinor: 1299,
        cadence: "monthly",
        evidence: "ChatGPT trial ends on 10 October; after that it is £12.99 per month",
      }),
      NOW,
    );

    expect(payload.subscriptionStatus).toMatchObject({ value: "trial" });
    expect(payload.trialEndsOn).toMatchObject({ value: "2026-10-10" });
    expect(payload.amountMinor).toMatchObject({ value: 1299, status: "proposed" });
    /** The paid plan starts at trial end; it is not a renewal date. */
    expect(payload.nextRenewal).toBeUndefined();
  });

  it("leaves the status unread when the message cannot settle a cancellation", () => {
    expect(
      toCreatePayload(
        candidate({ subscriptionStatus: "cancelled", evidence: "I cancelled Netflix" }),
        NOW,
      ).subscriptionStatus,
    ).toBeUndefined();
  });

  it("keeps trial end off next renewal and ends on", () => {
    const payload = toCreatePayload(
      candidate({
        provider: "Canva",
        subscriptionStatus: "trial",
        trialEndsOn: "2026-09-14",
        amountMinor: 1000,
        cadence: "monthly",
        autoRenewal: "yes",
        nextRenewal: "2026-09-14",
      }),
      NOW,
    );

    expect(payload).toMatchObject({
      subscriptionStatus: { value: "trial", status: "proposed" },
      trialEndsOn: { value: "2026-09-14", status: "proposed" },
      autoRenewal: { value: "yes", status: "proposed" },
      amountMinor: { value: 1000, status: "proposed" },
      cadence: { value: "monthly", status: "proposed" },
    });
    expect(payload.nextRenewal).toBeUndefined();
    expect(payload.endsOn).toBeUndefined();
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
