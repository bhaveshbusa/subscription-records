import { describe, expect, it } from "vitest";

import {
  canonicalProvider,
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

  it("rejects dates that are not real calendar days", () => {
    expect(parseCreateBody({ provider: "TestCo", nextRenewal: "2026-02-30" }).success).toBe(false);
    expect(parseCreateBody({ provider: "TestCo", nextRenewal: "12/09/2026" }).success).toBe(false);
    expect(parseCreateBody({ provider: "TestCo", nextRenewal: "2026-09-12" }).success).toBe(true);
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
    expect(parseUpdateBody({}).success).toBe(false);
  });

  it("accepts clearing a term", () => {
    expect(parseUpdateBody({ amountMinor: null, cadence: null, nextRenewal: null }).success).toBe(
      true,
    );
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
});

describe("canonicalProvider", () => {
  it("matches the seeded naming", () => {
    expect(canonicalProvider("The Athletic")).toBe("the-athletic");
    expect(canonicalProvider("Disney+")).toBe("disney");
    expect(canonicalProvider("  Netflix  ".trim())).toBe("netflix");
  });
});
