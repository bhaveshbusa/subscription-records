import { describe, expect, it } from "vitest";

import type { ExtractionCandidate } from "./candidates";
import {
  lifecycleOf,
  readCancelTiming,
  readCancelTimingReply,
  readLifecycleClaim,
  trustedStatus,
} from "./lifecycle";

const NOW = new Date("2026-09-04T12:00:00.000Z");

function candidate(overrides: Partial<ExtractionCandidate> = {}): ExtractionCandidate {
  return {
    provider: "Netflix",
    amountMinor: null,
    currency: null,
    cadence: null,
    nextRenewal: null,
    paidOn: null,
    lifecycle: null,
    endsOn: null,
    confidence: "high",
    evidence: "I cancelled Netflix",
    ...overrides,
  };
}

describe("readLifecycleClaim", () => {
  it("asks when a cancellation does not say when it took effect", () => {
    expect(readLifecycleClaim("I cancelled Netflix", NOW)).toEqual({
      claim: "ambiguous_cancel",
      ask: "when",
    });
    expect(readLifecycleClaim("unsubscribed from Netflix", NOW)).toEqual({
      claim: "ambiguous_cancel",
      ask: "when",
    });
  });

  it("asks immediately versus period end only for a recent cancel with no date", () => {
    expect(readLifecycleClaim("I just cancelled Netflix", NOW)).toEqual({
      claim: "ambiguous_cancel",
      ask: "now_or_period",
    });
  });

  it("reads a cancellation that stopped in the past, without asking", () => {
    expect(readLifecycleClaim("I cancelled Netflix three months ago", NOW)).toEqual({
      claim: "cancelled",
      endsOn: "2026-06-04",
    });
    expect(readLifecycleClaim("I cancelled Netflix in March", NOW)).toEqual({
      claim: "cancelled",
      endsOn: "2026-03-04",
    });
    expect(readLifecycleClaim("I cancelled Netflix last year", NOW)).toEqual({
      claim: "cancelled",
      endsOn: "2025-09-04",
    });
    expect(readLifecycleClaim("cancelled Netflix on 2026-03-01", NOW)).toEqual({
      claim: "cancelled",
      endsOn: "2026-03-01",
    });
  });

  it("reads a cancellation that stopped the subscription straight away", () => {
    expect(readLifecycleClaim("I cancelled Netflix immediately", NOW)).toEqual({
      claim: "cancelled",
      endsOn: null,
    });
    expect(readLifecycleClaim("cancelled Netflix, lost access right away", NOW)).toEqual({
      claim: "cancelled",
      endsOn: null,
    });
  });

  it("reads a cancellation that runs to the end of the period, with its date", () => {
    expect(readLifecycleClaim("I cancelled Netflix at the end of the month", NOW)).toEqual({
      claim: "cancel_scheduled",
      endsOn: null,
    });
    expect(readLifecycleClaim("cancelled Netflix, runs until 2026-09-12", NOW)).toEqual({
      claim: "cancel_scheduled",
      endsOn: "2026-09-12",
    });
  });

  it("reads billing that stopped without anyone cancelling as a lapse", () => {
    expect(readLifecycleClaim("Netflix lapsed", NOW)).toEqual({
      claim: "lapsed",
      endsOn: null,
    });
    expect(readLifecycleClaim("my card expired so Netflix did not renew", NOW)).toEqual({
      claim: "lapsed",
      endsOn: null,
    });
  });

  it("never reads not using a subscription as cancelling it", () => {
    expect(readLifecycleClaim("I don't use Netflix any more", NOW)).toBeNull();
    expect(readLifecycleClaim("I never watch Netflix", NOW)).toBeNull();
    expect(readLifecycleClaim("stopped using Netflix months ago", NOW)).toBeNull();
  });

  it("never reads wanting to cancel as having cancelled", () => {
    expect(readLifecycleClaim("I really should cancel Netflix", NOW)).toBeNull();
    expect(readLifecycleClaim("I keep meaning to cancel Netflix", NOW)).toBeNull();
    expect(readLifecycleClaim("I'm going to cancel Netflix tomorrow", NOW)).toBeNull();
    expect(readLifecycleClaim("I haven't cancelled Netflix yet", NOW)).toBeNull();
  });
});

describe("lifecycleOf", () => {
  it("keeps a claim the words back up, and the date the extractor read", () => {
    expect(
      lifecycleOf(
        candidate({
          lifecycle: "cancel_scheduled",
          endsOn: "2026-09-12",
          evidence: "I cancelled Netflix at the end of the month",
        }),
        NOW,
      ),
    ).toEqual({ claim: "cancel_scheduled", endsOn: "2026-09-12" });
  });

  it("drops a cancellation the words do not support", () => {
    expect(
      lifecycleOf(
        candidate({
          lifecycle: "cancelled",
          evidence: "I don't use Netflix any more",
        }),
        NOW,
      ),
    ).toBeNull();
    expect(
      lifecycleOf(
        candidate({ lifecycle: "cancelled", evidence: "I should cancel Netflix" }),
        NOW,
      ),
    ).toBeNull();
  });

  it("reads a status the extractor put in the wrong field", () => {
    expect(lifecycleOf(candidate({ subscriptionStatus: "cancelled" }), NOW)).toEqual({
      claim: "ambiguous_cancel",
      ask: "when",
    });
  });

  it("takes a future stated end date as a scheduled cancellation", () => {
    expect(
      lifecycleOf(candidate({ lifecycle: "cancelled", endsOn: "2026-09-12" }), NOW),
    ).toEqual({
      claim: "cancel_scheduled",
      endsOn: "2026-09-12",
    });
  });

  it("takes a past stated end date as a cancellation that already happened", () => {
    expect(
      lifecycleOf(
        candidate({
          lifecycle: "cancelled",
          endsOn: "2026-06-04",
          evidence: "I cancelled Netflix three months ago",
        }),
        NOW,
      ),
    ).toEqual({ claim: "cancelled", endsOn: "2026-06-04" });
  });

  it("ignores a lifecycle claim on a message with no lifecycle in it", () => {
    expect(
      lifecycleOf(
        candidate({ lifecycle: "lapsed", evidence: "Netflix £15.99 a month" }),
        NOW,
      ),
    ).toBeNull();
  });
});

describe("trustedStatus", () => {
  it("keeps a status that is not about the end of a subscription", () => {
    expect(trustedStatus(candidate({ subscriptionStatus: "trial", evidence: "free trial" }))).toBe(
      "trial",
    );
  });

  it("holds back an unqualified cancellation, since its timing is a question", () => {
    expect(trustedStatus(candidate({ lifecycle: "cancelled" }), NOW)).toBeNull();
  });

  it("holds back a lifecycle status the words do not support", () => {
    expect(
      trustedStatus(
        candidate({ subscriptionStatus: "cancelled", evidence: "I never watch Netflix" }),
        NOW,
      ),
    ).toBeNull();
  });
});

describe("readCancelTiming", () => {
  it("reads a bare answer about when the subscription stopped", () => {
    expect(readCancelTiming("at the end", NOW)).toEqual({
      claim: "cancel_scheduled",
      endsOn: null,
    });
    expect(readCancelTiming("end of the month", NOW)).toEqual({
      claim: "cancel_scheduled",
      endsOn: null,
    });
    expect(readCancelTiming("straight away", NOW)).toEqual({ claim: "cancelled", endsOn: null });
    expect(readCancelTiming("now", NOW)).toEqual({ claim: "cancelled", endsOn: null });
  });

  it("reads a relative past date as the day it already stopped", () => {
    expect(readCancelTiming("three months ago", NOW)).toEqual({
      claim: "cancelled",
      endsOn: "2026-06-04",
    });
  });

  it("takes a bare future date as the day it runs to, and a past date as stopped", () => {
    expect(readCancelTiming("2026-09-12", NOW)).toEqual({
      claim: "cancel_scheduled",
      endsOn: "2026-09-12",
    });
    expect(readCancelTiming("2026-03-01", NOW)).toEqual({
      claim: "cancelled",
      endsOn: "2026-03-01",
    });
  });

  it("is silent about a reply that answers something else", () => {
    expect(readCancelTiming("£15.99 a month", NOW)).toBeNull();
  });

  it("leaves a message that names its own subscription to the extractor", () => {
    expect(
      readCancelTimingReply(
        "I cancelled Spotify at the end of the month, and Figma too",
        "Netflix",
        NOW,
      ),
    ).toBeNull();
    expect(
      readCancelTimingReply("Netflix runs to the end of the month, I think", "Netflix", NOW),
    ).toEqual({ claim: "cancel_scheduled", endsOn: null });
  });
});
