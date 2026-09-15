import { describe, expect, it } from "vitest";

import { confirmTermsOnAccept } from "./confirm";

describe("confirmTermsOnAccept", () => {
  it("confirms every money, date and auto-renewal value on the proposal", () => {
    expect(
      confirmTermsOnAccept({
        amountMinor: { value: 999, status: "inferred" },
        currency: "gbp",
        cadence: { value: "monthly", status: "proposed" },
        nextRenewal: { value: "2026-10-01", status: "inferred" },
        trialEndsOn: { value: "2026-09-20", status: "proposed" },
        autoRenewal: { value: "yes", status: "proposed" },
        subscriptionStatus: { value: "active", status: "proposed" },
      }),
    ).toEqual({
      amountMinor: 999,
      currency: "GBP",
      cadence: "monthly",
      nextRenewal: "2026-10-01",
      trialEndsOn: "2026-09-20",
      autoRenewal: "yes",
    });
  });

  it("does not confirm auto-renewal from cadence alone", () => {
    expect(
      confirmTermsOnAccept({
        cadence: { value: "yearly", status: "proposed" },
      }),
    ).toEqual({ cadence: "yearly" });
  });

  it("lets edits override present values without inventing omitted fields", () => {
    expect(
      confirmTermsOnAccept(
        {
          amountMinor: { value: 500, status: "proposed" },
          cadence: { value: "monthly", status: "proposed" },
        },
        { amountMinor: 750, currency: "USD", subscriptionStatus: "trial" },
      ),
    ).toEqual({
      amountMinor: 750,
      currency: "USD",
      cadence: "monthly",
      subscriptionStatus: "trial",
    });
  });

  it("returns undefined when the proposal has no confirmable terms", () => {
    expect(
      confirmTermsOnAccept({
        plan: "Plus",
        subscriptionStatus: { value: "active", status: "proposed" },
      }),
    ).toBeUndefined();
  });
});
