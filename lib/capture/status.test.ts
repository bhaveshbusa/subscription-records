import { describe, expect, it } from "vitest";

import type { ExtractionCandidate } from "./candidates";
import { isCurrentTrial, newHoldingStatus, statedStatus } from "./status";

const NOW = new Date("2026-09-10T09:00:00.000Z");

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

describe("newHoldingStatus", () => {
  it("reads a bare name as a subscription the person holds", () => {
    expect(newHoldingStatus(candidate(), NOW)).toEqual({
      value: "active",
      /** Read from the act of recording it, not from any words in it. */
      status: "inferred",
      confidence: null,
    });
  });

  it("does not need a price or a date to know it is held", () => {
    const priced = newHoldingStatus(
      candidate({
        amountMinor: 1000,
        currency: "GBP",
        cadence: "monthly",
        evidence: "ChatGPT subscription is £10 per month",
      }),
      NOW,
    );

    expect(priced?.value).toBe("active");
    expect(newHoldingStatus(candidate(), NOW)?.value).toBe("active");
  });

  it("keeps a stated trial, with the confidence the reading came with", () => {
    expect(
      newHoldingStatus(
        candidate({
          subscriptionStatus: "trial",
          confidence: "medium",
          evidence: "these are my trial subscriptions",
        }),
        NOW,
      ),
    ).toEqual({ value: "trial", status: "proposed", confidence: "medium" });
  });

  it("reads a trial with no end date as a trial the person is on now", () => {
    expect(
      newHoldingStatus(candidate({ subscriptionStatus: "trial" }), NOW)?.value,
    ).toBe("trial");
  });

  it("reads a trial end still to come as a current trial", () => {
    expect(
      newHoldingStatus(
        candidate({
          trialEndsOn: "2026-10-10",
          amountMinor: 1299,
          cadence: "monthly",
          evidence: "My ChatGPT trial ends on 10 October; after that it is £12.99 per month",
        }),
        NOW,
      )?.value,
    ).toBe("trial");
  });

  it("does not make a current trial out of one that has already ended", () => {
    expect(
      newHoldingStatus(
        candidate({
          subscriptionStatus: "trial",
          trialEndsOn: "2026-03-01",
          evidence: "the Netflix trial ended on 1 March",
        }),
        NOW,
      ),
    ).toMatchObject({ value: "active" });
  });

  it("leaves a subscription unread when the message cannot settle whether it ended", () => {
    expect(
      newHoldingStatus(
        candidate({
          subscriptionStatus: "cancelled",
          evidence: "I cancelled Netflix",
        }),
        NOW,
      ),
    ).toBeNull();
  });

  it("does not read wanting to cancel as having cancelled", () => {
    expect(
      newHoldingStatus(
        candidate({
          subscriptionStatus: "cancelled",
          evidence: "I keep meaning to cancel Netflix",
        }),
        NOW,
      ),
    ).toMatchObject({ value: "active" });
  });

  it("keeps unknown when the reading says the input is unclear", () => {
    expect(
      newHoldingStatus(candidate({ subscriptionStatus: "unknown" }), NOW),
    ).toMatchObject({ value: "unknown", status: "proposed" });
  });
});

describe("statedStatus", () => {
  it("says nothing about a message that only carries a price", () => {
    expect(
      statedStatus(
        candidate({ amountMinor: 1299, cadence: "monthly", evidence: "Netflix is £12.99" }),
        NOW,
      ),
    ).toBeNull();
  });

  it("passes a stated trial through", () => {
    expect(statedStatus(candidate({ subscriptionStatus: "trial" }), NOW)).toBe("trial");
  });
});

describe("isCurrentTrial", () => {
  it("counts a trial with no stated end, and one ending today", () => {
    expect(isCurrentTrial({ trialEndsOn: null }, NOW)).toBe(true);
    expect(isCurrentTrial({ trialEndsOn: "2026-09-10" }, NOW)).toBe(true);
  });

  it("does not count one that ended yesterday", () => {
    expect(isCurrentTrial({ trialEndsOn: "2026-09-09" }, NOW)).toBe(false);
  });
});
