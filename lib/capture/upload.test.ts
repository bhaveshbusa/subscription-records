import { describe, expect, it } from "vitest";

import { MAX_IMAGE_BYTES } from "./image";
import { MAX_PDF_BYTES } from "./pdf";
import {
  captureExtension,
  captureFileKind,
  isCaptureMediaType,
  maxCaptureBytes,
  parseFileCaptureBody,
} from "./upload";

function body(overrides: Record<string, unknown> = {}) {
  return {
    fileName: "netflix-receipt.png",
    mediaType: "image/png",
    byteSize: 24_000,
    ...overrides,
  };
}

describe("parseFileCaptureBody", () => {
  it("accepts a screenshot the reader can read", () => {
    const parsed = parseFileCaptureBody(body());

    expect(parsed).toEqual({
      success: true,
      input: { fileName: "netflix-receipt.png", mediaType: "image/png", byteSize: 24_000 },
    });
  });

  it("accepts a PDF invoice", () => {
    const parsed = parseFileCaptureBody(
      body({ fileName: "invoice.pdf", mediaType: "application/pdf", byteSize: 180_000 }),
    );

    expect(parsed.success).toBe(true);
  });

  it("refuses a file no reader can read, before any bytes move", () => {
    expect(parseFileCaptureBody(body({ mediaType: "text/csv" })).success).toBe(false);
    expect(parseFileCaptureBody(body({ mediaType: "image/gif" })).success).toBe(false);
  });

  it("holds each kind to its own size ceiling", () => {
    expect(parseFileCaptureBody(body({ byteSize: MAX_IMAGE_BYTES + 1 })).success).toBe(false);
    expect(
      parseFileCaptureBody({
        fileName: "invoice.pdf",
        mediaType: "application/pdf",
        byteSize: MAX_IMAGE_BYTES + 1,
      }).success,
    ).toBe(true);
    expect(
      parseFileCaptureBody({
        fileName: "invoice.pdf",
        mediaType: "application/pdf",
        byteSize: MAX_PDF_BYTES + 1,
      }).success,
    ).toBe(false);
  });

  it("says which limit an oversized image broke", () => {
    const parsed = parseFileCaptureBody(body({ byteSize: MAX_IMAGE_BYTES + 1 }));

    expect(parsed.success).toBe(false);

    if (!parsed.success) {
      expect(parsed.issues[0].field).toBe("byteSize");
      expect(parsed.issues[0].message).toContain(String(MAX_IMAGE_BYTES));
    }
  });

  it("refuses an empty upload", () => {
    expect(parseFileCaptureBody(body({ byteSize: 0 })).success).toBe(false);
  });

  it("refuses a caller that tries to choose its own storage key", () => {
    const parsed = parseFileCaptureBody(body({ storageKey: "captures/someone-else/x.png" }));

    expect(parsed.success).toBe(false);
  });

  it("names the field that was wrong", () => {
    const parsed = parseFileCaptureBody(body({ fileName: "" }));

    expect(parsed.success).toBe(false);

    if (!parsed.success) {
      expect(parsed.issues[0].field).toBe("fileName");
    }
  });
});

describe("media types", () => {
  it("knows the extension each stored object gets", () => {
    expect(captureExtension("image/jpeg")).toBe("jpg");
    expect(captureExtension("image/webp")).toBe("webp");
    expect(captureExtension("application/pdf")).toBe("pdf");
  });

  it("recognises only what a reader accepts", () => {
    expect(isCaptureMediaType("image/png")).toBe(true);
    expect(isCaptureMediaType("application/pdf")).toBe(true);
    expect(isCaptureMediaType("image/gif")).toBe(false);
    expect(isCaptureMediaType("text/plain")).toBe(false);
  });

  it("sends each media type to its own reader", () => {
    expect(captureFileKind("application/pdf")).toBe("pdf");
    expect(captureFileKind("image/png")).toBe("image");
  });

  it("gives a document more room than a screenshot", () => {
    expect(maxCaptureBytes("application/pdf")).toBe(MAX_PDF_BYTES);
    expect(maxCaptureBytes("image/png")).toBe(MAX_IMAGE_BYTES);
  });
});
