import { describe, expect, it } from "vitest";

import type { ExtractionCandidate } from "./candidates";
import { matchCandidate, type LedgerEntry } from "./match";

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
    ...overrides,
  };
}

function candidate(provider: string): ExtractionCandidate {
  return {
    provider,
    amountMinor: null,
    currency: null,
    cadence: null,
    nextRenewal: null,
    confidence: "high",
    evidence: provider,
  };
}

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
    const ledger = [entry({ provider_canonical: "adobe", provider_display: "Adobe" })];

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

  it("does not match an unrelated provider", () => {
    expect(matchCandidate(candidate("Spotify"), [entry()])).toBeNull();
  });

  it("does not match on a short shared prefix", () => {
    const ledger = [entry({ provider_canonical: "the-athletic" })];

    expect(matchCandidate(candidate("The Times"), ledger)).toBeNull();
  });
});
