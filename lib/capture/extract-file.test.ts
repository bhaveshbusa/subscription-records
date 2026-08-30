import { describe, expect, it, vi } from "vitest";

import type { MessageCreator } from "./anthropic";
import { CANDIDATE_TOOL_NAME } from "./candidates";
import {
  extractAudioCandidates,
  extractFileCandidates,
  extractImageCandidates,
  extractPdfCandidates,
  ExtractorUnavailableError,
  heardNotice,
  IMAGE_FIXTURE_LABEL,
  PDF_NAME_FIXTURE_LABEL,
  PDF_TEXT_FIXTURE_LABEL,
} from "./extract";
import { MAX_PDF_PAGES } from "./pdf";
import { samplePdf } from "./pdf-sample";

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

const INVOICE_LINES = [
  "Acme Billing - Invoice 4021",
  "Netflix Standard subscription",
  "GBP 10.99 monthly, next renewal 14 September 2026",
];

function invoicePdf(pages = 1): Uint8Array {
  return samplePdf(
    Array.from({ length: pages }, (_, page) =>
      page === 0 ? INVOICE_LINES : [`Page ${page + 1} of terms and conditions`],
    ),
  );
}

/** No text layer at all: the shape of a scanned or photographed bill. */
function scannedPdf(pages = 1): Uint8Array {
  return samplePdf(
    Array.from({ length: pages }, () => ["scan"]),
    { text: false },
  );
}

describe("extractPdfCandidates", () => {
  it("reads the document's own text layer and sends that, not its pages", async () => {
    const createMessage = vi.fn<MessageCreator>(() =>
      toolReply({
        candidates: [
          {
            provider: "Netflix",
            amountMinor: 1099,
            currency: "gbp",
            cadence: "monthly",
            nextRenewal: "2026-09-14",
            confidence: "high",
            evidence: "Netflix Standard GBP 10.99 monthly",
          },
        ],
      }),
    );

    const extraction = await extractPdfCandidates(
      { bytes: invoicePdf(), fileName: "invoice-4021.pdf" },
      { environment: WITH_KEY, createMessage },
    );

    expect(extraction).toMatchObject({ mode: "claude", notice: null });
    expect(extraction.candidates[0]).toMatchObject({
      provider: "Netflix",
      amountMinor: 1099,
      currency: "GBP",
      cadence: "monthly",
    });

    const [params] = createMessage.mock.calls[0];
    const sent = JSON.stringify(params.messages);

    expect(sent).toContain("Netflix Standard subscription");
    expect(sent).not.toContain("document");
    expect(params.system).toContain("PDF");
  });

  it("stops at the page cap and says how much of the document was read", async () => {
    const createMessage = vi.fn<MessageCreator>(() => toolReply({ candidates: [] }));

    const extraction = await extractPdfCandidates(
      { bytes: invoicePdf(MAX_PDF_PAGES + 3), fileName: "statement.pdf" },
      { environment: WITH_KEY, createMessage },
    );

    expect(extraction.notice).toBe(
      `Only the first ${MAX_PDF_PAGES} of ${MAX_PDF_PAGES + 3} pages were read.`,
    );

    const sent = JSON.stringify(createMessage.mock.calls[0][0].messages);

    expect(sent).toContain(`Page ${MAX_PDF_PAGES} of terms`);
    expect(sent).not.toContain(`Page ${MAX_PDF_PAGES + 1} of terms`);
  });

  it("looks at the pages of a document that carries no text", async () => {
    const createMessage = vi.fn<MessageCreator>(() => toolReply({ candidates: [] }));
    const bytes = scannedPdf();

    await extractPdfCandidates(
      { bytes, fileName: "scan.pdf" },
      { environment: WITH_KEY, createMessage },
    );

    expect(createMessage.mock.calls[0][0].messages).toEqual([
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: Buffer.from(bytes).toString("base64"),
            },
          },
        ],
      },
    ]);
  });

  it("refuses a long document it would have to read as pages, rather than paying for it", async () => {
    const createMessage = vi.fn<MessageCreator>(() => toolReply({ candidates: [] }));

    await expect(
      extractPdfCandidates(
        { bytes: scannedPdf(MAX_PDF_PAGES + 1), fileName: "scan.pdf" },
        { environment: WITH_KEY, createMessage },
      ),
    ).rejects.toThrow(/page cap/);
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("is unavailable rather than guessing when a deployment has no key", async () => {
    await expect(
      extractPdfCandidates(
        { bytes: invoicePdf(), fileName: "invoice.pdf" },
        { environment: { NODE_ENV: "production" } },
      ),
    ).rejects.toThrow(ExtractorUnavailableError);
  });

  it("pattern-matches the document's own text in development, and says so", async () => {
    const extraction = await extractPdfCandidates(
      { bytes: invoicePdf(), fileName: "untitled.pdf" },
      { environment: { NODE_ENV: "development" } },
    );

    expect(extraction).toMatchObject({ mode: "fixture", notice: PDF_TEXT_FIXTURE_LABEL });
    expect(extraction.candidates.map((candidate) => candidate.provider)).toContain("Netflix");
  });

  it("falls back to the file name in development when there is no text layer", async () => {
    const extraction = await extractPdfCandidates(
      { bytes: scannedPdf(), fileName: "netflix-invoice.pdf" },
      { environment: { NODE_ENV: "development" } },
    );

    expect(extraction).toMatchObject({ mode: "fixture", notice: PDF_NAME_FIXTURE_LABEL });
    expect(extraction.candidates[0]).toMatchObject({ provider: "Netflix" });
  });
});

const RECORDING = {
  bytes: new Uint8Array([26, 69, 223, 163]),
  mediaType: "audio/webm" as const,
  fileName: "voice-note.webm",
};

describe("extractAudioCandidates", () => {
  it("turns a spoken \"add Notion\" into a candidate through the text reader", async () => {
    const createMessage = vi.fn<MessageCreator>(() =>
      toolReply({
        candidates: [{ provider: "Notion", confidence: "medium", evidence: "add Notion" }],
      }),
    );

    const extraction = await extractAudioCandidates(RECORDING, {
      environment: { ...WITH_KEY, GROQ_API_KEY: "gsk-test" },
      createMessage,
      transcribe: () => Promise.resolve({ text: " add Notion " }),
    });

    expect(extraction).toMatchObject({ mode: "claude", notice: heardNotice("add Notion") });
    expect(extraction.candidates[0]).toMatchObject({ provider: "Notion" });
    /** The transcript, and nothing about the recording, is what the reader sees. */
    expect(JSON.stringify(createMessage.mock.calls[0][0].messages)).toContain("add Notion");
  });

  it("says nothing was said rather than proposing nothing quietly", async () => {
    await expect(
      extractAudioCandidates(RECORDING, {
        environment: { ...WITH_KEY, GROQ_API_KEY: "gsk-test" },
        createMessage: () => toolReply({ candidates: [] }),
        transcribe: () => Promise.resolve({ text: "   " }),
      }),
    ).rejects.toThrow(/nothing was said/);
  });

  it("is unavailable without a transcription key, in development too", async () => {
    await expect(
      extractAudioCandidates(RECORDING, { environment: { NODE_ENV: "development" } }),
    ).rejects.toThrow(ExtractorUnavailableError);
  });
});

describe("extractFileCandidates", () => {
  it("sends each stored kind to its own reader", async () => {
    const pdf = await extractFileCandidates(
      { kind: "pdf", bytes: invoicePdf(), fileName: "invoice.pdf" },
      { environment: { NODE_ENV: "development" } },
    );
    const image = await extractFileCandidates(
      { kind: "image", ...SCREENSHOT },
      { environment: { NODE_ENV: "development" } },
    );

    expect(pdf.notice).toBe(PDF_TEXT_FIXTURE_LABEL);
    expect(image.notice).toBe(IMAGE_FIXTURE_LABEL);
  });

  it("sends a recording to the transcriber, then to the text reader", async () => {
    const transcribe = vi.fn(() => Promise.resolve({ text: "add Notion" }));

    const audio = await extractFileCandidates(
      { kind: "audio", ...RECORDING },
      {
        environment: { ...WITH_KEY, GROQ_API_KEY: "gsk-test" },
        createMessage: () =>
          toolReply({
            candidates: [{ provider: "Notion", confidence: "low", evidence: "add Notion" }],
          }),
        transcribe,
      },
    );

    expect(transcribe).toHaveBeenCalledWith(expect.objectContaining(RECORDING));
    expect(audio.candidates[0]).toMatchObject({ provider: "Notion" });
  });
});
