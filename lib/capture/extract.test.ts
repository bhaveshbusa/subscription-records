import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MessageCreator } from "./anthropic";
import { CANDIDATE_TOOL_NAME, MAX_CANDIDATES } from "./candidates";
import { ExtractionReadError, extractCandidates, ExtractorUnavailableError } from "./extract";
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

/**
 * What the SDK hands back when the reply ran out of room: the tool call has
 * started but its JSON never finished, so the fields the schema needs are simply
 * not there. This is the shape SUB-54 was reported as - a 16-name list that came
 * back as "candidates Required".
 */
function truncatedReply(): ReturnType<MessageCreator> {
  return Promise.resolve({
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-4-5",
    stop_reason: "max_tokens",
    stop_sequence: null,
    usage: { input_tokens: 900, output_tokens: 2048 },
    content: [{ type: "tool_use", id: "toolu_1", name: CANDIDATE_TOOL_NAME, input: {} }],
  } as Awaited<ReturnType<MessageCreator>>);
}

/** A list of bare names, the most ordinary thing a new user pastes. */
function bareNames(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    provider: `Service ${index + 1}`,
    confidence: "high" as const,
    evidence: `Service ${index + 1}`,
  }));
}

describe("extractCandidates", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

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
    expect(createMessage.mock.calls[0][0].system).toContain("trialEndsOn");
    expect(createMessage.mock.calls[0][0].system).toContain("reminderPreferences");
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

  it("accepts a reminder turned off even when the model also sends a lead", async () => {
    const extraction = await extractCandidates("Turn the GitHub reminder off", {
      environment: WITH_KEY,
      createMessage: () =>
        toolReply({
          candidates: [
            {
              provider: "GitHub",
              reminderPreferences: {
                renewal: { state: "off", leadValue: 1, leadUnit: "months" },
              },
              confidence: "high",
              evidence: "Turn the GitHub reminder off",
            },
          ],
        }),
    });

    expect(extraction.candidates[0]).toMatchObject({
      provider: "GitHub",
      reminderPreferences: { renewal: { state: "off" } },
    });
    expect(extraction.candidates[0].reminderPreferences?.renewal).toEqual({ state: "off" });
  });

  it("fails loudly when the model answers with something invalid", async () => {
    await expect(
      extractCandidates("Netflix", {
        environment: WITH_KEY,
        createMessage: () =>
          toolReply({ candidates: [{ provider: "", confidence: "certain", evidence: "" }] }),
      }),
    ).rejects.toMatchObject({ reason: "malformed" });
  });

  it("keeps the schema complaint in the log rather than in front of the user", async () => {
    const failed = await extractCandidates("Netflix", {
      environment: WITH_KEY,
      createMessage: () =>
        toolReply({ candidates: [{ provider: "", confidence: "certain", evidence: "" }] }),
    }).catch((error: unknown) => error);

    expect((failed as Error).message).not.toMatch(/did not validate|Required|String must/);
    expect((failed as Error).message).toMatch(/could not read/);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("candidates did not validate"),
    );
  });

  it("says a truncated reply was too long to read, not that a field is missing", async () => {
    const failed = await extractCandidates(bareNames(16).map((c) => c.provider).join("\n"), {
      environment: WITH_KEY,
      createMessage: truncatedReply,
    }).catch((error: unknown) => error);

    expect(failed).toBeInstanceOf(ExtractionReadError);
    expect((failed as ExtractionReadError).reason).toBe("truncated");
    expect((failed as Error).message).toMatch(/too long to read in one go/);
    expect((failed as Error).message).toMatch(/smaller batches/);
    expect((failed as Error).message).not.toMatch(/candidates|Required|validate|schema/i);
  });

  it("logs the stop reason and the tokens the reply actually spent", async () => {
    await extractCandidates("Netflix", {
      environment: WITH_KEY,
      createMessage: truncatedReply,
    }).catch(() => null);

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("stop_reason=max_tokens"),
    );
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("output_tokens=2048"),
    );

    await extractCandidates("Netflix", {
      environment: WITH_KEY,
      createMessage: () =>
        toolReply({
          candidates: [{ provider: "Netflix", confidence: "high", evidence: "Netflix" }],
        }),
    });

    expect(console.info).toHaveBeenCalledWith(
      expect.stringContaining("read 1 candidates"),
    );
  });

  it("treats an empty list as an answer rather than as a failure", async () => {
    const extraction = await extractCandidates("How much did I spend last month?", {
      environment: WITH_KEY,
      createMessage: () => toolReply({ candidates: [] }),
    });

    expect(extraction.candidates).toHaveLength(0);
    expect(extraction.notice).toBeNull();
    expect(console.info).toHaveBeenCalledWith(
      expect.stringContaining("read 0 candidates"),
    );
  });

  it("budgets for the largest reply the schema allows", async () => {
    const createMessage = vi.fn<MessageCreator>(() =>
      toolReply({ candidates: bareNames(1) }),
    );

    await extractCandidates("Netflix", { environment: WITH_KEY, createMessage });

    /**
     * MAX_CANDIDATES entries, each carrying a 500-character `evidence` span plus
     * its own fields: roughly 300 output tokens apiece, and room for a sentence
     * before the tool call. The 2048 this replaced could not return the 25
     * candidates the tool advertises.
     */
    expect(createMessage.mock.calls[0][0].max_tokens).toBeGreaterThanOrEqual(
      MAX_CANDIDATES * 300,
    );
  });

  it("reads a list of 25 bare names without dropping any", async () => {
    const extraction = await extractCandidates(
      bareNames(MAX_CANDIDATES).map((candidate) => candidate.provider).join("\n"),
      {
        environment: WITH_KEY,
        createMessage: () => toolReply({ candidates: bareNames(MAX_CANDIDATES) }),
      },
    );

    expect(extraction.candidates).toHaveLength(MAX_CANDIDATES);
    expect(extraction.notice).toMatch(new RegExp(`${MAX_CANDIDATES} subscriptions`));
  });

  it("names the limit rather than losing the tail of a longer list", async () => {
    const extraction = await extractCandidates("a very long list", {
      environment: WITH_KEY,
      createMessage: () => toolReply({ candidates: bareNames(MAX_CANDIDATES + 6) }),
    });

    expect(extraction.candidates).toHaveLength(MAX_CANDIDATES);
    expect(extraction.notice).toMatch(/most one capture holds/);
    expect(extraction.notice).toMatch(/send the rest in another message/);
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
    ).rejects.toMatchObject({ reason: "malformed" });

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("no candidate tool call"),
    );
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
