import { describe, expect, it, vi } from "vitest";

import type { MessageCreator } from "./anthropic";
import { CANDIDATE_TOOL_NAME } from "./candidates";
import {
  extractImageCandidates,
  ExtractorUnavailableError,
  IMAGE_FIXTURE_LABEL,
} from "./extract";

const WITH_KEY = { ANTHROPIC_API_KEY: "sk-test", NODE_ENV: "production" };

const SCREENSHOT = {
  bytes: new Uint8Array([137, 80, 78, 71]),
  mediaType: "image/png" as const,
  fileName: "netflix-receipt.png",
};

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

describe("extractImageCandidates", () => {
  it("sends the bytes inline, so no readable URL to the private object exists", async () => {
    const createMessage = vi.fn<MessageCreator>(() =>
      toolReply({
        candidates: [
          {
            provider: "Netflix",
            amountMinor: 1599,
            currency: "gbp",
            cadence: "monthly",
            confidence: "high",
            evidence: "Netflix Standard £15.99",
          },
        ],
      }),
    );

    const extraction = await extractImageCandidates(SCREENSHOT, {
      environment: WITH_KEY,
      createMessage,
    });

    expect(extraction).toMatchObject({ mode: "claude", notice: null });
    expect(extraction.candidates[0]).toMatchObject({
      provider: "Netflix",
      amountMinor: 1599,
      currency: "GBP",
    });

    const [params] = createMessage.mock.calls[0];

    expect(params.messages).toEqual([
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: Buffer.from(SCREENSHOT.bytes).toString("base64"),
            },
          },
        ],
      },
    ]);
    expect(JSON.stringify(params)).not.toContain("http");
  });

  it("tells the model to read the image rather than describe it", async () => {
    const createMessage = vi.fn<MessageCreator>(() => toolReply({ candidates: [] }));

    await extractImageCandidates(SCREENSHOT, {
      environment: WITH_KEY,
      createMessage,
    });

    expect(createMessage.mock.calls[0][0].system).toContain("screenshot");
  });

  it("reads nothing out of an image with no subscription in it", async () => {
    const extraction = await extractImageCandidates(SCREENSHOT, {
      environment: WITH_KEY,
      createMessage: () => toolReply({ candidates: [] }),
    });

    expect(extraction.candidates).toEqual([]);
  });

  it("is unavailable rather than guessing when a deployment has no key", async () => {
    await expect(
      extractImageCandidates(SCREENSHOT, { environment: { NODE_ENV: "production" } }),
    ).rejects.toThrow(ExtractorUnavailableError);
  });

  it("says so plainly when a development run only matched the file name", async () => {
    const extraction = await extractImageCandidates(SCREENSHOT, {
      environment: { NODE_ENV: "development" },
    });

    expect(extraction).toMatchObject({ mode: "fixture", notice: IMAGE_FIXTURE_LABEL });
    expect(extraction.candidates[0]).toMatchObject({ provider: "Netflix" });
  });
});
