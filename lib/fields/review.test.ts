import { describe, expect, it } from "vitest";

import {
  acceptLabel,
  confirmActionLabel,
  confirmSummary,
  CONFLICT_REVIEW_NOTE,
  currencyOptions,
  displayFieldValue,
  fieldActions,
  isStaged,
  NOT_RECORDED,
  stageTerm,
  toAcceptConfirm,
  unstageTerm,
} from "./review";

describe("fieldActions", () => {
  it("offers Confirm only for an untrusted value that exists", () => {
    expect(fieldActions("proposed", true)).toEqual({ confirm: true, edit: "edit" });
    expect(fieldActions("inferred", true)).toEqual({ confirm: true, edit: "edit" });
    expect(fieldActions("conflicted", true)).toEqual({ confirm: true, edit: "edit" });
    expect(fieldActions("confirmed", true)).toEqual({ confirm: false, edit: "edit" });
  });

  it("offers Add, never Confirm, for a blank", () => {
    expect(fieldActions("empty", false)).toEqual({ confirm: false, edit: "add" });
    expect(fieldActions("proposed", false)).toEqual({ confirm: false, edit: "add" });
  });

  it("never offers Confirm for a field without trust of its own", () => {
    expect(fieldActions(null, true)).toEqual({ confirm: false, edit: "edit" });
  });
});

describe("field display copy", () => {
  it("names the confirm action after the field, not a generic Confirm", () => {
    expect(confirmActionLabel("Amount")).toBe("Confirm amount");
    expect(confirmActionLabel("Amount after trial")).toBe("Confirm amount after trial");
    expect(confirmActionLabel("Recorded renewal")).toBe("Confirm recorded renewal");
  });

  it("shows Not recorded for a missing value instead of a dash or zero", () => {
    expect(displayFieldValue("—", false)).toBe(NOT_RECORDED);
    expect(displayFieldValue("", false)).toBe(NOT_RECORDED);
    expect(displayFieldValue("£12.00", true)).toBe("£12.00");
  });

  it("explains a conflicted field without replacing the recorded value", () => {
    expect(CONFLICT_REVIEW_NOTE).toContain("nothing is replaced silently");
  });
});

describe("staging terms on a card", () => {
  it("an amount-labelled action stages the amount and its currency, nothing else", () => {
    const staged = stageTerm({}, "amountMinor", 999, "usd");

    expect(staged).toEqual({ amountMinor: 999, currency: "USD" });
    expect(isStaged(staged, "cadence")).toBe(false);
    expect(isStaged(staged, "nextRenewal")).toBe(false);
    expect(isStaged(staged, "autoRenewal")).toBe(false);
  });

  it("cadence never brings auto-renewal with it", () => {
    expect(stageTerm({}, "cadence", "monthly")).toEqual({ cadence: "monthly" });
  });

  it("undoing the amount drops its currency and leaves the rest", () => {
    const staged = stageTerm(stageTerm({}, "amountMinor", 999, "GBP"), "cadence", "yearly");

    expect(unstageTerm(staged, "amountMinor")).toEqual({ cadence: "yearly" });
  });

  it("accepting with nothing staged confirms nothing", () => {
    expect(toAcceptConfirm({}, "active")).toBeUndefined();
  });

  it("a status left as the card shows it is not an extra confirmation", () => {
    expect(toAcceptConfirm({ subscriptionStatus: "active" }, "active")).toBeUndefined();
    expect(toAcceptConfirm({ subscriptionStatus: "trial" }, "active")).toEqual({
      subscriptionStatus: "trial",
    });
  });
});

describe("confirmSummary", () => {
  it("lists every staged value with its unit", () => {
    const staged = {
      provider: true as const,
      amountMinor: 1299,
      currency: "USD",
      cadence: "monthly" as const,
      nextRenewal: "2026-10-01",
      trialEndsOn: "2026-09-20",
      autoRenewal: "yes" as const,
    };

    expect(
      confirmSummary(staged, {
        provider: { value: "Figma", status: "proposed", confidence: "high" },
      }).map((line) => `${line.label}: ${line.value}`),
    ).toEqual([
      "Provider: Figma",
      "Amount: US$12.99 (USD)",
      "Cadence: Monthly",
      "Next renewal: 1 Oct 2026",
      "Trial ends on: 20 Sep 2026",
      "Auto-renewal: Yes",
    ]);
  });

  it("names accepting and confirming as different things", () => {
    expect(acceptLabel()).toBe("Accept");
    expect(acceptLabel()).toBe("Accept");
    expect(acceptLabel()).toBe("Accept");
  });
});

describe("currencyOptions", () => {
  it("always includes the row's own currency", () => {
    expect(currencyOptions("chf")).toEqual(["CHF", "GBP", "USD", "EUR"]);
    expect(currencyOptions("usd")).toEqual(["GBP", "USD", "EUR"]);
  });
});
