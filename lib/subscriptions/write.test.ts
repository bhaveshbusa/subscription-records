import { describe, expect, it } from "vitest";

import {
  canonicalProvider,
  endingKindFor,
  isManualReactivation,
  parseCreateBody,
  parseUpdateBody,
  toInsertValues,
  toUpdateValues,
} from "./write";

const USER = "00000000-0000-4000-8000-0000000000f1";

function created(body: unknown) {
  const parsed = parseCreateBody(body);

  if (!parsed.success) {
    throw new Error(parsed.issues.map((issue) => `${issue.field}: ${issue.message}`).join(", "));
  }

  return toInsertValues(USER, parsed.input);
}

function updated(body: unknown) {
  const parsed = parseUpdateBody(body);

  if (!parsed.success) {
    throw new Error(parsed.issues.map((issue) => `${issue.field}: ${issue.message}`).join(", "));
  }

  return toUpdateValues(parsed.input, new Date("2026-03-01T10:00:00.000Z"));
}

describe("parseCreateBody", () => {
  it("accepts a provider on its own", () => {
    expect(parseCreateBody({ provider: "TestCo" }).success).toBe(true);
  });

  it("requires a provider", () => {
    expect(parseCreateBody({}).success).toBe(false);
    expect(parseCreateBody({ provider: "  " }).success).toBe(false);
  });

  it("rejects amounts that are not whole minor units and unknown cadences", () => {
    expect(parseCreateBody({ provider: "TestCo", amountMinor: 9.99 }).success).toBe(false);
    expect(parseCreateBody({ provider: "TestCo", amountMinor: -1 }).success).toBe(false);
    expect(parseCreateBody({ provider: "TestCo", cadence: "daily" }).success).toBe(false);
  });

  it("accepts trial end and auto-renewal, and rejects an invented auto-renewal value", () => {
    expect(
      parseCreateBody({
        provider: "TestCo",
        trialEndsOn: "2026-09-14",
        autoRenewal: "yes",
      }).success,
    ).toBe(true);
    expect(parseCreateBody({ provider: "TestCo", autoRenewal: "maybe" }).success).toBe(false);
  });

  it("rejects unknown fields, including a client-supplied user", () => {
    expect(parseCreateBody({ provider: "TestCo", userId: USER }).success).toBe(false);
    expect(parseCreateBody({ provider: "TestCo", amount_field_status: "confirmed" }).success).toBe(
      false,
    );
  });
});

describe("parseUpdateBody", () => {
  it("accepts a single field and rejects an empty body", () => {
    expect(parseUpdateBody({ amountMinor: 999 }).success).toBe(true);
    expect(parseUpdateBody({ notes: "Just a note" }).success).toBe(true);
    expect(parseUpdateBody({}).success).toBe(false);
  });

  it("accepts a reminder-only update and does not treat unset as off", () => {
    expect(
      parseUpdateBody({ reminderPreferences: { renewal: { state: "off" } } }).success,
    ).toBe(true);
    expect(
      parseUpdateBody({
        reminderPreferences: {
          renewal: { state: "enabled", leadValue: 1, leadUnit: "months" },
        },
      }).success,
    ).toBe(true);
    expect(parseUpdateBody({ reminderPreferences: { renewal: { state: "unset" } } }).success).toBe(
      true,
    );
    expect(parseUpdateBody({ reminderPreferences: {} }).success).toBe(false);
    expect(
      parseUpdateBody({ reminderPreferences: { renewal: { state: "enabled" } } }).success,
    ).toBe(false);
  });

  it("accepts clearing a term", () => {
    expect(parseUpdateBody({ amountMinor: null, cadence: null, nextRenewal: null }).success).toBe(
      true,
    );
  });

  it("accepts a terms change only when a term is present", () => {
    expect(
      parseUpdateBody({
        amountMinor: 1299,
        termsChange: { effectiveFrom: "2026-04-01" },
      }).success,
    ).toBe(true);
    expect(parseUpdateBody({ termsChange: { effectiveFrom: "2026-04-01" } }).success).toBe(false);
    expect(parseUpdateBody({ amountMinor: 1299, termsChange: {} }).success).toBe(false);
  });
});

describe("endingKindFor", () => {
  it("routes a holding to cancelled or cancel_scheduled, not an already-ended row", () => {
    expect(endingKindFor("active", "cancelled")).toBe("cancelled");
    expect(endingKindFor("active", "cancel_scheduled")).toBe("cancel_scheduled");
    expect(endingKindFor("cancel_scheduled", "cancelled")).toBe("cancelled");
    expect(endingKindFor("cancelled", "cancelled")).toBeNull();
    expect(endingKindFor("cancelled", "cancel_scheduled")).toBeNull();
    expect(endingKindFor("active", "paused")).toBeNull();
    expect(endingKindFor("active", undefined)).toBeNull();
  });
});

describe("isManualReactivation", () => {
  it("is only a cancelled (or legacy lapsed) row coming back", () => {
    expect(isManualReactivation("cancelled", "active")).toBe(true);
    expect(isManualReactivation("lapsed", "active")).toBe(true);
    expect(isManualReactivation("active", "active")).toBe(false);
    expect(isManualReactivation("cancelled", "cancelled")).toBe(false);
    expect(isManualReactivation("paused", "active")).toBe(false);
  });
});

describe("toInsertValues", () => {
  it("leaves the terms of a provider-only stub empty", () => {
    expect(created({ provider: "TestCo" })).toMatchObject({
      user_id: USER,
      provider_display: "TestCo",
      provider_canonical: "testco",
      provider_field_status: "confirmed",
      status: "unknown",
      currency: "GBP",
      amount_minor: null,
      amount_field_status: "empty",
      amount_confidence: null,
      cadence: null,
      cadence_field_status: "empty",
      next_renewal: null,
      renewal_field_status: "empty",
      trial_ends_on: null,
      trial_end_field_status: "empty",
      auto_renewal: null,
      auto_renewal_field_status: "empty",
      status_field_status: "empty",
    });
  });

  it("confirms the terms the user typed", () => {
    expect(
      created({
        provider: "TestCo",
        status: "active",
        amountMinor: 999,
        cadence: "monthly",
        nextRenewal: "2026-09-12",
      }),
    ).toMatchObject({
      amount_minor: 999,
      amount_field_status: "confirmed",
      amount_confidence: "high",
      cadence: "monthly",
      cadence_field_status: "confirmed",
      next_renewal: "2026-09-12",
      renewal_field_status: "confirmed",
      status: "active",
      status_field_status: "confirmed",
    });
  });

  it("confirms trial end and auto-renewal the user typed, independently of cadence", () => {
    expect(
      created({
        provider: "TestCo",
        status: "trial",
        cadence: "monthly",
        trialEndsOn: "2026-09-14",
        autoRenewal: "yes",
      }),
    ).toMatchObject({
      cadence: "monthly",
      cadence_field_status: "confirmed",
      trial_ends_on: "2026-09-14",
      trial_end_field_status: "confirmed",
      auto_renewal: "yes",
      auto_renewal_field_status: "confirmed",
    });
  });

  it("leaves auto-renewal unknown when only cadence is set", () => {
    expect(
      created({
        provider: "TestCo",
        cadence: "yearly",
      }),
    ).toMatchObject({
      cadence: "yearly",
      cadence_field_status: "confirmed",
      auto_renewal: null,
      auto_renewal_field_status: "empty",
      auto_renewal_confidence: null,
    });
  });
});

describe("toUpdateValues", () => {
  it("only touches the fields in the request", () => {
    expect(Object.keys(updated({ amountMinor: 999 })).sort()).toEqual([
      "amount_confidence",
      "amount_field_status",
      "amount_minor",
      "updated_at",
    ]);
  });

  it("confirms an amount and cadence the user set", () => {
    expect(updated({ amountMinor: 999, cadence: "monthly" })).toMatchObject({
      amount_minor: 999,
      amount_field_status: "confirmed",
      amount_confidence: "high",
      cadence: "monthly",
      cadence_field_status: "confirmed",
      cadence_confidence: "high",
    });
  });

  it("empties a term the user cleared", () => {
    expect(updated({ amountMinor: null, nextRenewal: null })).toMatchObject({
      amount_minor: null,
      amount_field_status: "empty",
      amount_confidence: null,
      next_renewal: null,
      renewal_field_status: "empty",
      renewal_confidence: null,
    });
  });

  it("confirms and clears trial end and auto-renewal independently of cadence", () => {
    expect(
      updated({ trialEndsOn: "2026-09-14", autoRenewal: "no" }),
    ).toMatchObject({
      trial_ends_on: "2026-09-14",
      trial_end_field_status: "confirmed",
      auto_renewal: "no",
      auto_renewal_field_status: "confirmed",
    });
    expect(Object.keys(updated({ cadence: "yearly" })).sort()).toEqual([
      "cadence",
      "cadence_confidence",
      "cadence_field_status",
      "updated_at",
    ]);
    expect(updated({ trialEndsOn: null, autoRenewal: null })).toMatchObject({
      trial_ends_on: null,
      trial_end_field_status: "empty",
      auto_renewal: null,
      auto_renewal_field_status: "empty",
    });
  });
});

describe("canonicalProvider", () => {
  it("matches the seeded naming", () => {
    expect(canonicalProvider("The Athletic")).toBe("the-athletic");
    expect(canonicalProvider("Disney+")).toBe("disney");
    expect(canonicalProvider("  Netflix  ".trim())).toBe("netflix");
  });
});
