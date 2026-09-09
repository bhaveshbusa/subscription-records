import { describe, expect, it } from "vitest";

import {
  classifyCoverage,
  isConfirmedCoverage,
  paidCommitmentMonthlyEquivalentMinor,
  summariseCoverage,
  type CoverageFacts,
} from "./coverage";
import { monthlyEquivalentMinor } from "./projection";

function row(overrides: Partial<CoverageFacts> & Pick<CoverageFacts, "id" | "provider_display">): CoverageFacts {
  return {
    status: "active",
    amount_minor: 1200,
    currency: "GBP",
    cadence: "monthly",
    amount_field_status: "confirmed",
    cadence_field_status: "confirmed",
    ...overrides,
  };
}

describe("classifyCoverage", () => {
  it("treats confirmed amount and cadence on an active holding as confirmed", () => {
    expect(classifyCoverage(row({ id: "a", provider_display: "A" }))).toBe("confirmed");
    expect(isConfirmedCoverage(row({ id: "a", provider_display: "A" }))).toBe(true);
  });

  it("keeps cancel_scheduled in the paid-commitment set", () => {
    expect(
      classifyCoverage(row({ id: "a", provider_display: "A", status: "cancel_scheduled" })),
    ).toBe("confirmed");
  });

  it("puts inferred or proposed money in unconfirmed, not confirmed", () => {
    expect(
      classifyCoverage(
        row({
          id: "a",
          provider_display: "A",
          amount_field_status: "inferred",
          cadence_field_status: "confirmed",
        }),
      ),
    ).toBe("unconfirmed");
    expect(
      classifyCoverage(
        row({
          id: "b",
          provider_display: "B",
          amount_field_status: "confirmed",
          cadence_field_status: "proposed",
        }),
      ),
    ).toBe("unconfirmed");
  });

  it("does not treat conflicted amount or cadence as confirmed coverage", () => {
    expect(
      classifyCoverage(
        row({
          id: "a",
          provider_display: "A",
          amount_field_status: "conflicted",
          cadence_field_status: "confirmed",
        }),
      ),
    ).toBe("unconfirmed");
  });

  it("leaves unknown, paused, and cancelled holdings outside the paid total", () => {
    expect(classifyCoverage(row({ id: "a", provider_display: "A", status: "unknown" }))).toBe(
      "outside",
    );
    expect(classifyCoverage(row({ id: "b", provider_display: "B", status: "paused" }))).toBe(
      "outside",
    );
    expect(classifyCoverage(row({ id: "c", provider_display: "C", status: "cancelled" }))).toBe(
      "outside",
    );
  });

  it("reports missing price or cadence as an omission, not zero", () => {
    expect(
      classifyCoverage(row({ id: "a", provider_display: "A", amount_minor: null })),
    ).toBe("omitted_missing");
    expect(
      classifyCoverage(row({ id: "b", provider_display: "B", cadence: null })),
    ).toBe("omitted_missing");
  });

  it("reports a non-GBP holding as an excluded currency, without converting it", () => {
    expect(
      classifyCoverage(
        row({ id: "a", provider_display: "A", currency: "USD", amount_minor: 1000 }),
      ),
    ).toBe("omitted_currency");
  });

  it("keeps trial paid-plan terms after trial, including when the price is unknown", () => {
    expect(
      classifyCoverage(
        row({
          id: "a",
          provider_display: "A",
          status: "trial",
          amount_minor: 1000,
          cadence: "monthly",
        }),
      ),
    ).toBe("after_trial_stated");
    expect(
      classifyCoverage(
        row({
          id: "b",
          provider_display: "B",
          status: "trial",
          amount_minor: null,
          cadence: "monthly",
        }),
      ),
    ).toBe("after_trial_unknown");
  });
});

describe("summariseCoverage", () => {
  it("splits confirmed and unconfirmed GBP and keeps trials out of the paid total", () => {
    /**
     * Scenario B: £12/month + £120/year = £22/month under the existing rounding.
     * Unconfirmed £6/month is calculable but not confirmed. Missing amount and
     * USD are omissions, not zero. The trial's £10/month sits after trial.
     */
    const twelveAMonth = row({
      id: "1",
      provider_display: "MonthlyCo",
      amount_minor: 1200,
      cadence: "monthly",
    });
    const hundredTwentyAYear = row({
      id: "2",
      provider_display: "YearlyCo",
      amount_minor: 12000,
      cadence: "yearly",
    });
    const sixUnconfirmed = row({
      id: "3",
      provider_display: "MaybeCo",
      amount_minor: 600,
      amount_field_status: "proposed",
    });
    const missing = row({
      id: "4",
      provider_display: "StubCo",
      amount_minor: null,
    });
    const usd = row({
      id: "5",
      provider_display: "DollarCo",
      currency: "USD",
      amount_minor: 1000,
    });
    const trial = row({
      id: "6",
      provider_display: "TrialCo",
      status: "trial",
      amount_minor: 1000,
    });
    const unknownTrial = row({
      id: "7",
      provider_display: "BareTrialCo",
      status: "trial",
      amount_minor: null,
    });

    const independentConfirmed =
      monthlyEquivalentMinor(1200, "monthly")! + monthlyEquivalentMinor(12000, "yearly")!;
    expect(independentConfirmed).toBe(2200);

    const coverage = summariseCoverage([
      twelveAMonth,
      hundredTwentyAYear,
      sixUnconfirmed,
      missing,
      usd,
      trial,
      unknownTrial,
    ]);

    expect(coverage.confirmed).toEqual({ count: 2, monthlyEquivalentMinor: 2200 });
    expect(coverage.unconfirmed.monthlyEquivalentMinor).toBe(600);
    expect(coverage.unconfirmed.items.map((item) => item.provider)).toEqual(["MaybeCo"]);
    expect(paidCommitmentMonthlyEquivalentMinor(coverage)).toBe(2800);
    expect(coverage.afterTrial.monthlyEquivalentMinor).toBe(1000);
    expect(coverage.afterTrial.stated.items.map((item) => item.provider)).toEqual(["TrialCo"]);
    expect(coverage.afterTrial.unknownPrice.items.map((item) => item.provider)).toEqual([
      "BareTrialCo",
    ]);
    expect(coverage.omitted.missingPriceOrCadence.items.map((item) => item.provider)).toEqual([
      "StubCo",
    ]);
    expect(coverage.omitted.excludedCurrency.items).toEqual([
      { subscriptionId: "5", provider: "DollarCo", currency: "USD" },
    ]);
    expect(coverage.confirmed.count + coverage.unconfirmed.count).toBe(3);
    expect(
      coverage.confirmed.count +
        coverage.unconfirmed.count +
        coverage.omitted.missingPriceOrCadence.count +
        coverage.omitted.excludedCurrency.count,
    ).toBe(5);
    expect(coverage.afterTrial.stated.count + coverage.afterTrial.unknownPrice.count).toBe(2);
  });

  it("does not invent a confirmed zero for a free trial with unknown paid terms", () => {
    const coverage = summariseCoverage([
      row({
        id: "1",
        provider_display: "BareTrialCo",
        status: "trial",
        amount_minor: null,
        cadence: null,
        amount_field_status: "empty",
        cadence_field_status: "empty",
      }),
    ]);

    expect(coverage.afterTrial.monthlyEquivalentMinor).toBe(0);
    expect(coverage.afterTrial.unknownPrice.count).toBe(1);
    expect(paidCommitmentMonthlyEquivalentMinor(coverage)).toBe(0);
    expect(coverage.confirmed.count).toBe(0);
  });
});
