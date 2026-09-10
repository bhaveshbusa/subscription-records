import { describe, expect, it } from "vitest";

import type { ExtractionCandidate } from "./candidates";
import { draftKey, matchCandidate, resolveCandidate, type LedgerEntry } from "./match";

function entry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    provider_canonical: "netflix",
    provider_display: "Netflix",
    status: "active",
    amount_minor: 1599,
    currency: "GBP",
    cadence: "monthly",
    next_renewal: "2026-09-12",
    plan: "Standard",
    account_hint: null,
    amount_field_status: "confirmed",
    cadence_field_status: "confirmed",
    renewal_field_status: "confirmed",
    status_field_status: "confirmed",
    trial_ends_on: null,
    auto_renewal: null,
    trial_end_field_status: "empty",
    auto_renewal_field_status: "empty",
    reminderPreferences: [],
    ...overrides,
  };
}

function candidate(provider: string, accountHint?: string): ExtractionCandidate {
  return {
    provider,
    amountMinor: null,
    currency: null,
    cadence: null,
    nextRenewal: null,
    confidence: "high",
    evidence: provider,
    ...(accountHint ? { accountHint } : {}),
  };
}

const family = entry({ id: "family", account_hint: "family@example.com" });
const me = entry({ id: "me", account_hint: "me@example.com" });

describe("resolveCandidate", () => {
  it("reaches the one holding whose account the message names", () => {
    expect(resolveCandidate(candidate("Netflix", "Family@Example.com"), [me, family])).toEqual({
      outcome: "matched",
      match: { strength: "high", subscription: family },
    });
  });

  it("asks when several holdings match and the message names no account", () => {
    expect(resolveCandidate(candidate("Netflix"), [me, family])).toEqual({
      outcome: "ambiguous",
      options: [me, family],
    });
  });

  it("asks when the message names an account no holding carries", () => {
    expect(resolveCandidate(candidate("Netflix", "work@example.com"), [me, family])).toEqual({
      outcome: "unseen_account",
      hint: "work@example.com",
      holdings: [me, family],
    });
    expect(resolveCandidate(candidate("Netflix", "work@example.com"), [me])).toMatchObject({
      outcome: "unseen_account",
    });
  });

  it("takes a named account to the one holding that has none noted", () => {
    const bare = entry({ id: "bare" });

    expect(resolveCandidate(candidate("Netflix", "me@example.com"), [bare])).toEqual({
      outcome: "matched",
      match: { strength: "high", subscription: bare },
    });
  });

  it("still matches one holding when no account is named on either side", () => {
    expect(resolveCandidate(candidate("Netflix"), [me])).toEqual({
      outcome: "matched",
      match: { strength: "high", subscription: me },
    });
  });

  it("keys a draft by provider and account, however they are written", () => {
    expect(draftKey("Netflix ", " Me@Example.com")).toBe(draftKey("netflix", "me@example.com"));
    expect(draftKey("Netflix", null)).not.toBe(draftKey("Netflix", "me@example.com"));
  });
});

describe("matchCandidate", () => {
  it("matches the same provider written differently", () => {
    expect(matchCandidate(candidate("netflix "), [entry()])).toMatchObject({
      strength: "high",
      subscription: { provider_display: "Netflix" },
    });
  });

  it("matches a name the ledger canonicalises with a hyphen", () => {
    const ledger = [entry({ provider_canonical: "youtube-premium" })];

    expect(matchCandidate(candidate("YouTube Premium"), ledger)).toMatchObject({
      strength: "high",
    });
  });

  it("treats a longer name sharing the ledger's first word as a weaker match", () => {
    const ledger = [
      entry({ provider_canonical: "adobe", provider_display: "Adobe" }),
    ];

    expect(matchCandidate(candidate("Adobe Photoshop"), ledger)).toMatchObject({
      strength: "medium",
    });
  });

  it("prefers the exact provider over one that merely starts the same", () => {
    const ledger = [
      entry({ id: "a", provider_canonical: "adobe" }),
      entry({ id: "b", provider_canonical: "adobe-photoshop" }),
    ];

    expect(matchCandidate(candidate("Adobe Photoshop"), ledger)).toMatchObject({
      strength: "high",
      subscription: { id: "b" },
    });
  });

  it("ignores the words people wrap a name in", () => {
    const ledger = [
      entry({ provider_canonical: "abc", provider_display: "ABC" }),
    ];

    expect(matchCandidate(candidate("ABC subscription"), ledger)).toMatchObject(
      {
        strength: "high",
        subscription: { provider_display: "ABC" },
      },
    );
    expect(matchCandidate(candidate("The ABC plan"), ledger)).toMatchObject({
      strength: "high",
    });
  });

  it("does not match an unrelated provider", () => {
    expect(matchCandidate(candidate("Spotify"), [entry()])).toBeNull();
  });

  it("does not match on a short shared prefix", () => {
    const ledger = [entry({ provider_canonical: "the-athletic" })];

    expect(matchCandidate(candidate("The Times"), ledger)).toBeNull();
  });
});
