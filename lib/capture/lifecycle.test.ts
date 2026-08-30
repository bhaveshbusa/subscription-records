import { describe, expect, it } from "vitest";

import type { ExtractionCandidate } from "./candidates";
import {
  lifecycleOf,
  readCancelTiming,
  readCancelTimingReply,
  readLifecycleClaim,
  trustedStatus,
} from "./lifecycle";

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
  it("asks about timing when a cancellation does not say when it took effect", () => {
    expect(readLifecycleClaim("I cancelled Netflix")).toEqual({
      claim: "ambiguous_cancel",
    });
    expect(readLifecycleClaim("unsubscribed from Netflix")).toEqual({
      claim: "ambiguous_cancel",
    });
  });

  it("reads a cancellation that stopped the subscription straight away", () => {
    expect(readLifecycleClaim("I cancelled Netflix immediately")).toEqual({
      claim: "cancelled",
      endsOn: null,
    });
    expect(readLifecycleClaim("cancelled Netflix, lost access right away")).toEqual({
      claim: "cancelled",
      endsOn: null,
    });
  });

  it("reads a cancellation that runs to the end of the period, with its date", () => {
    expect(readLifecycleClaim("I cancelled Netflix at the end of the month")).toEqual({
      claim: "cancel_scheduled",
      endsOn: null,
    });
    expect(readLifecycleClaim("cancelled Netflix, runs until 2026-09-12")).toEqual({
      claim: "cancel_scheduled",
      endsOn: "2026-09-12",
    });
  });

  it("reads billing that stopped without anyone cancelling as a lapse", () => {
    expect(readLifecycleClaim("Netflix lapsed")).toEqual({
      claim: "lapsed",
      endsOn: null,
    });
    expect(readLifecycleClaim("my card expired so Netflix did not renew")).toEqual({
      claim: "lapsed",
      endsOn: null,
    });
  });

  it("never reads not using a subscription as cancelling it", () => {
    expect(readLifecycleClaim("I don't use Netflix any more")).toBeNull();
    expect(readLifecycleClaim("I never watch Netflix")).toBeNull();
    expect(readLifecycleClaim("stopped using Netflix months ago")).toBeNull();
  });

  it("never reads wanting to cancel as having cancelled", () => {
    expect(readLifecycleClaim("I really should cancel Netflix")).toBeNull();
    expect(readLifecycleClaim("I keep meaning to cancel Netflix")).toBeNull();
    expect(readLifecycleClaim("I'm going to cancel Netflix tomorrow")).toBeNull();
    expect(readLifecycleClaim("I haven't cancelled Netflix yet")).toBeNull();
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
      ),
    ).toBeNull();
    expect(
      lifecycleOf(
        candidate({ lifecycle: "cancelled", evidence: "I should cancel Netflix" }),
      ),
    ).toBeNull();
  });

  it("reads a status the extractor put in the wrong field", () => {
    expect(
      lifecycleOf(candidate({ subscriptionStatus: "cancelled" })),
    ).toEqual({ claim: "ambiguous_cancel" });
  });

  it("takes a stated end date as the answer to the timing question", () => {
    expect(lifecycleOf(candidate({ lifecycle: "cancelled", endsOn: "2026-09-12" }))).toEqual({
      claim: "cancel_scheduled",
      endsOn: "2026-09-12",
    });
  });

  it("ignores a lifecycle claim on a message with no lifecycle in it", () => {
    expect(
      lifecycleOf(candidate({ lifecycle: "lapsed", evidence: "Netflix £15.99 a month" })),
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
    expect(trustedStatus(candidate({ lifecycle: "cancelled" }))).toBeNull();
  });

  it("holds back a lifecycle status the words do not support", () => {
    expect(
      trustedStatus(
        candidate({ subscriptionStatus: "cancelled", evidence: "I never watch Netflix" }),
      ),
    ).toBeNull();
  });
});

describe("readCancelTiming", () => {
  it("reads a bare answer about when the subscription stopped", () => {
    expect(readCancelTiming("at the end")).toEqual({
      claim: "cancel_scheduled",
      endsOn: null,
    });
    expect(readCancelTiming("end of the month")).toEqual({
      claim: "cancel_scheduled",
      endsOn: null,
    });
    expect(readCancelTiming("straight away")).toEqual({ claim: "cancelled", endsOn: null });
    expect(readCancelTiming("now")).toEqual({ claim: "cancelled", endsOn: null });
  });

  it("takes a bare date as the day it runs to", () => {
    expect(readCancelTiming("2026-09-12")).toEqual({
      claim: "cancel_scheduled",
      endsOn: "2026-09-12",
    });
  });

  it("is silent about a reply that answers something else", () => {
    expect(readCancelTiming("£15.99 a month")).toBeNull();
  });

  it("leaves a message that names its own subscription to the extractor", () => {
    expect(
      readCancelTimingReply(
        "I cancelled Spotify at the end of the month, and Figma too",
        "Netflix",
      ),
    ).toBeNull();
    expect(readCancelTimingReply("Netflix runs to the end of the month, I think", "Netflix")).toEqual(
      { claim: "cancel_scheduled", endsOn: null },
    );
  });
});
