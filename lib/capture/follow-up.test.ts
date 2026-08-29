import { describe, expect, it } from "vitest";

import type { ExtractionCandidate } from "./candidates";
import { chooseFollowUp, type FollowUpCandidate } from "./follow-up";

function candidate(overrides: Partial<FollowUpCandidate> = {}): FollowUpCandidate {
  const base: ExtractionCandidate = {
    provider: "Netflix",
    amountMinor: 1599,
    currency: "GBP",
    cadence: "monthly",
    nextRenewal: "2026-09-12",
    confidence: "high",
    evidence: "Netflix",
  };

  return { ...base, ...overrides };
}

describe("chooseFollowUp", () => {
  it("asks for a missing amount first", () => {
    expect(
      chooseFollowUp([
        candidate({ provider: "Linear", cadence: null, amountMinor: null }),
        candidate({ nextRenewal: null }),
      ]),
    ).toMatchObject({ reason: "amount", provider: "Linear" });
  });

  it("asks for a cadence once every amount is known", () => {
    expect(chooseFollowUp([candidate({ cadence: null, nextRenewal: null })])).toMatchObject({
      reason: "cadence",
    });
  });

  it("asks for a renewal date once amounts and cadences are known", () => {
    expect(chooseFollowUp([candidate({ nextRenewal: null })])).toMatchObject({
      reason: "renewal",
    });
  });

  it("asks about a duplicate only when nothing is missing", () => {
    expect(chooseFollowUp([candidate({ duplicateOf: "Netflix" })])).toMatchObject({
      reason: "duplicate",
      provider: "Netflix",
    });
  });

  it("asks nothing when a complete candidate is new", () => {
    expect(chooseFollowUp([candidate()])).toBeNull();
    expect(chooseFollowUp([])).toBeNull();
  });
});
