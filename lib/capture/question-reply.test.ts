import { describe, expect, it } from "vitest";

import type { ExtractionCandidate } from "./candidates";
import { draftScope } from "./follow-up";
import { applyQuestionContext, contextualizeQuestionReply } from "./question-reply";
import type { QuestionRow } from "./questions";

function question(overrides: Partial<QuestionRow> = {}): QuestionRow {
  return {
    id: "00000000-0000-4000-8000-00000000aa01",
    user_id: "00000000-0000-4000-8000-00000000aa00",
    subscription_id: null,
    capture_id: null,
    scope_key: draftScope("Strava"),
    provider_canonical: "strava",
    provider_display: "Strava",
    reason: "amount",
    state: "asked",
    question: "How much is Strava?",
    candidate: {
      provider: "Strava",
      amountMinor: null,
      currency: null,
      cadence: null,
      confidence: "high",
      evidence: "Strava",
    },
    asked_seq: 1,
    resolved_at: null,
    created_at: new Date("2026-09-01T00:00:00.000Z"),
    updated_at: new Date("2026-09-01T00:00:00.000Z"),
    ...overrides,
  };
}

function candidate(overrides: Partial<ExtractionCandidate> = {}): ExtractionCandidate {
  return {
    provider: "Strava",
    amountMinor: 1200,
    currency: "GBP",
    cadence: "monthly",
    confidence: "high",
    evidence: "Strava £12 monthly",
    ...overrides,
  };
}

describe("contextualizeQuestionReply", () => {
  it("prefixes the selected provider so a terse price can be read", () => {
    expect(contextualizeQuestionReply(question(), "£12 monthly")).toBe("Strava £12 monthly");
  });

  it("leaves a reply that already names the provider alone", () => {
    expect(contextualizeQuestionReply(question(), "Strava is £12 monthly")).toBe(
      "Strava is £12 monthly",
    );
  });
});

describe("applyQuestionContext", () => {
  it("overlays a matching price onto the stored candidate", () => {
    expect(applyQuestionContext(question(), [candidate()])).toEqual([
      expect.objectContaining({
        provider: "Strava",
        amountMinor: 1200,
        currency: "GBP",
        cadence: "monthly",
      }),
    ]);
  });

  it("keeps the stored provider when the extractor guessed a leftover word", () => {
    expect(
      applyQuestionContext(question(), [candidate({ provider: "monthly" })]),
    ).toEqual([
      expect.objectContaining({
        provider: "Strava",
        amountMinor: 1200,
        cadence: "monthly",
      }),
    ]);
  });

  it("ignores a second name in the same reply rather than retargeting", () => {
    expect(
      applyQuestionContext(question(), [
        candidate({ provider: "Figma", amountMinor: 800 }),
        candidate(),
      ]),
    ).toEqual([
      expect.objectContaining({
        provider: "Strava",
        amountMinor: 1200,
      }),
    ]);
  });

  it("returns nothing for a legacy question with no candidate and no overlay", () => {
    expect(applyQuestionContext(question({ candidate: null }), [])).toEqual([]);
  });
});
