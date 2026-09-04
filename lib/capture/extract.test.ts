import { describe, expect, it, vi } from "vitest";

import type { MessageCreator } from "./anthropic";
import { CANDIDATE_TOOL_NAME } from "./candidates";
import { extractCandidates, ExtractorUnavailableError } from "./extract";
import { FIXTURE_EXTRACTOR_LABEL } from "./fixture-extractor";

const WITH_KEY = { ANTHROPIC_API_KEY: "sk-test", NODE_ENV: "production" };

function toolReply(input: unknown): ReturnType<MessageCreator> {
  return Promise.resolve({
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-4-5",
    stop_reason: "tool_use",
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
    content: [{ type: "tool_use", id: "toolu_1", name: CANDIDATE_TOOL_NAME, input }],
  } as Awaited<ReturnType<MessageCreator>>);
}

describe("extractCandidates", () => {
  it("uses the model when a server key exists", async () => {
    const createMessage = vi.fn<MessageCreator>(() =>
      toolReply({
        candidates: [
          {
            provider: "Linear",
            amountMinor: 800,
            currency: "usd",
            cadence: "monthly",
            confidence: "high",
            evidence: "I subscribed to Linear",
          },
        ],
      }),
    );

    const extraction = await extractCandidates("I subscribed to Linear", {
      environment: WITH_KEY,
      createMessage,
    });

    expect(extraction).toMatchObject({ mode: "claude", notice: null });
    expect(extraction.candidates).toHaveLength(1);
    expect(extraction.candidates[0]).toMatchObject({ provider: "Linear", currency: "USD" });
    expect(createMessage).toHaveBeenCalledTimes(1);
    expect(createMessage.mock.calls[0][0]).toMatchObject({
      tool_choice: { type: "tool", name: CANDIDATE_TOOL_NAME },
      messages: [{ role: "user", content: "I subscribed to Linear" }],
    });
    expect(createMessage.mock.calls[0][0].system).toContain(
      "it is not a payment to store",
    );
    expect(createMessage.mock.calls[0][0].system).toContain("three months ago");
  });

  it("collapses two mentions of the same provider into one candidate", async () => {
    const extraction = await extractCandidates("Netflix and netflix", {
      environment: WITH_KEY,
      createMessage: () =>
        toolReply({
          candidates: [
            { provider: "Netflix", confidence: "high", evidence: "Netflix" },
            { provider: "netflix", confidence: "low", evidence: "netflix" },
          ],
        }),
    });

    expect(extraction.candidates).toHaveLength(1);
  });

  it("fails loudly when the model answers with something invalid", async () => {
    await expect(
      extractCandidates("Netflix", {
        environment: WITH_KEY,
        createMessage: () =>
          toolReply({ candidates: [{ provider: "", confidence: "certain", evidence: "" }] }),
      }),
    ).rejects.toThrow(/did not validate/);
  });

  it("fails loudly when the model answers without the tool", async () => {
    await expect(
      extractCandidates("Netflix", {
        environment: WITH_KEY,
        createMessage: () =>
          Promise.resolve({
            content: [{ type: "text", text: "sure!", citations: null }],
          } as Awaited<ReturnType<MessageCreator>>),
      }),
    ).rejects.toThrow(/without recording candidates/);
  });

  it("falls back to labelled fixtures in development", async () => {
    const extraction = await extractCandidates("I subscribed to Linear", {
      environment: { NODE_ENV: "development" },
    });

    expect(extraction).toMatchObject({ mode: "fixture", notice: FIXTURE_EXTRACTOR_LABEL });
    expect(extraction.candidates).toHaveLength(1);
  });

  it("says extraction is unavailable in preview instead of pattern matching", async () => {
    await expect(
      extractCandidates("I subscribed to Linear", {
        environment: { NODE_ENV: "production", VERCEL_ENV: "preview" },
      }),
    ).rejects.toBeInstanceOf(ExtractorUnavailableError);
  });

  it("says extraction is unavailable in production too", async () => {
    await expect(
      extractCandidates("I subscribed to Linear", {
        environment: { NODE_ENV: "production" },
      }),
    ).rejects.toThrow(/ANTHROPIC_API_KEY is not set/);
  });
});
