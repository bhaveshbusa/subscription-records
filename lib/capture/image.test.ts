import { describe, expect, it } from "vitest";

import {
  imageExtension,
  isImageMediaType,
  MAX_IMAGE_BYTES,
  parseImageCaptureBody,
} from "./image";

function body(overrides: Record<string, unknown> = {}) {
  return {
    fileName: "netflix-receipt.png",
    mediaType: "image/png",
    byteSize: 24_000,
    ...overrides,
  };
}

describe("parseImageCaptureBody", () => {
  it("accepts a screenshot the reader can read", () => {
    const parsed = parseImageCaptureBody(body());

    expect(parsed).toEqual({
      success: true,
      input: { fileName: "netflix-receipt.png", mediaType: "image/png", byteSize: 24_000 },
    });
  });

  it("refuses a file that is not an image, before any bytes move", () => {
    const parsed = parseImageCaptureBody(body({ mediaType: "application/pdf" }));

    expect(parsed.success).toBe(false);
  });

  it("refuses an image past the size the reader accepts", () => {
    const parsed = parseImageCaptureBody(body({ byteSize: MAX_IMAGE_BYTES + 1 }));

    expect(parsed.success).toBe(false);
  });

  it("refuses an empty upload", () => {
    expect(parseImageCaptureBody(body({ byteSize: 0 })).success).toBe(false);
  });

  it("refuses a caller that tries to choose its own storage key", () => {
    const parsed = parseImageCaptureBody(body({ storageKey: "captures/someone-else/x.png" }));

    expect(parsed.success).toBe(false);
  });

  it("names the field that was wrong", () => {
    const parsed = parseImageCaptureBody(body({ fileName: "" }));

    expect(parsed.success).toBe(false);

    if (!parsed.success) {
      expect(parsed.issues[0].field).toBe("fileName");
    }
  });
});

describe("media types", () => {
  it("knows the extension each stored object gets", () => {
    expect(imageExtension("image/jpeg")).toBe("jpg");
    expect(imageExtension("image/webp")).toBe("webp");
  });

  it("recognises only what a vision reader accepts", () => {
    expect(isImageMediaType("image/png")).toBe(true);
    expect(isImageMediaType("image/gif")).toBe(false);
    expect(isImageMediaType("text/plain")).toBe(false);
  });
});
