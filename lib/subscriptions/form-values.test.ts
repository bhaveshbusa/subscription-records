import { describe, expect, it } from "vitest";

import { toSubscriptionFormValues } from "./form-values";
import type { SubscriptionDetail } from "./projection";

const detail = {
  id: "00000000-0000-4000-8000-00000000a001",
  provider: { value: "TestCo", status: "confirmed", confidence: "high" },
  plan: { value: null, status: "empty", confidence: null },
  status: { value: "active", status: "confirmed", confidence: "high" },
  amount: { value: { minor: 999, currency: "GBP" }, status: "confirmed", confidence: "high" },
  cadence: { value: "monthly", status: "confirmed", confidence: "high" },
  nextRenewal: { value: "2026-09-12", status: "confirmed", confidence: "high" },
  monthlyEquivalentMinor: 999,
  needsAttention: false,
  updatedAt: "2026-08-29T00:00:00.000Z",
  accountHint: null,
  startedOn: null,
  endsOn: null,
  notes: null,
  currency: "GBP",
  amendments: [],
  events: [],
  charges: [],
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
      }),
    ).toMatchObject({ amount: "", cadence: "", nextRenewal: "" });
  });
});
