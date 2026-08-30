import { describe, expect, it } from "vitest";

import type { ExtractionCandidate } from "./candidates";
import type { LedgerEntry } from "./match";
import { differingAccount, readIdentityReply, reactivationOf } from "./reactivation";

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

function row(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: "00000000-0000-4000-8000-00000000aa01",
    provider_canonical: "netflix",
    provider_display: "Netflix",
    status: "cancelled",
    amount_minor: 1599,
    currency: "GBP",
    cadence: "monthly",
    next_renewal: null,
    plan: "Standard",
    account_hint: "home@example.com",
    amount_field_status: "confirmed",
    cadence_field_status: "confirmed",
    renewal_field_status: "confirmed",
    status_field_status: "confirmed",
    ...overrides,
  };
}

describe("reactivationOf", () => {
  it("reads a resubscription of a cancelled record", () => {
    expect(
      reactivationOf(
        candidate({ evidence: "I resubscribed to Netflix", subscriptionStatus: "active" }),
        row(),
      ),
    ).toBe(true);
  });

  it("treats a payment on a cancelled record as it running again", () => {
    expect(
      reactivationOf(
        candidate({ paidOn: "2026-04-02", amountMinor: 1599, evidence: "Netflix £15.99" }),
        row(),
      ),
    ).toBe(true);
  });

  it("leaves a running subscription alone, so a payment stays a charge", () => {
    expect(
      reactivationOf(candidate({ paidOn: "2026-04-02" }), row({ status: "active" })),
    ).toBe(false);
  });

  it("still expects the last payments of a cancellation that runs on", () => {
    expect(
      reactivationOf(candidate({ paidOn: "2026-04-02" }), row({ status: "cancel_scheduled" })),
    ).toBe(false);
  });

  it("does not read wanting it back as having it back", () => {
    expect(
      reactivationOf(candidate({ evidence: "I should resubscribe to Netflix" }), row()),
    ).toBe(false);
  });

  it("is not a reactivation when the message ends it again", () => {
    expect(
      reactivationOf(
        candidate({ evidence: "cancelled Netflix", lifecycle: "cancelled" }),
        row({ status: "cancel_scheduled" }),
      ),
    ).toBe(false);
  });
});

describe("differingAccount", () => {
  it("is nothing when the message names the account already on record", () => {
    expect(
      differingAccount(candidate({ accountHint: "Home@Example.com " }), row()),
    ).toBeNull();
  });

  it("is nothing when the message names no account", () => {
    expect(differingAccount(candidate(), row())).toBeNull();
  });

  it("carries both accounts when they differ, so the turn can ask", () => {
    expect(differingAccount(candidate({ accountHint: "work@example.com" }), row())).toEqual({
      hint: "work@example.com",
      previous: "home@example.com",
    });
  });
});

describe("readIdentityReply", () => {
  it("reads the same subscription starting again", () => {
    expect(readIdentityReply("same one", "Netflix")).toBe("same");
    expect(readIdentityReply("yes, that's the one", "Netflix")).toBe("same");
  });

  it("reads a second subscription of its own", () => {
    expect(readIdentityReply("a new one", "Netflix")).toBe("new");
    expect(readIdentityReply("no", "Netflix")).toBe("new");
    expect(readIdentityReply("different account", "Netflix")).toBe("new");
  });

  it("leaves a message about something else to the extractor", () => {
    expect(
      readIdentityReply(
        "forget that for now, I also pay £9 a month for Spotify and £4 for iCloud storage",
        "Netflix",
      ),
    ).toBeNull();
  });
});
