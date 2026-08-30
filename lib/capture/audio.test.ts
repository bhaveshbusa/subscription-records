import { describe, expect, it } from "vitest";

import { audioExtension, baseMediaType, isAudioMediaType } from "./audio";
import { captureExtension, captureFileKind, isCaptureMediaType, maxCaptureBytes } from "./upload";

describe("audio media types", () => {
  it("accepts what a browser recorder produces", () => {
    expect(isAudioMediaType("audio/webm")).toBe(true);
    expect(isAudioMediaType("audio/mp4")).toBe(true);
  });

  it("rejects anything that is not a recording", () => {
    expect(isAudioMediaType("video/webm")).toBe(false);
    expect(isAudioMediaType("audio/flac")).toBe(false);
    /** Codec parameters belong to the recorder; the stored type is the container. */
    expect(isAudioMediaType("audio/webm;codecs=opus")).toBe(false);
  });

  it("reads a recorder's type as the container it wrote", () => {
    expect(baseMediaType("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(baseMediaType("AUDIO/MP4")).toBe("audio/mp4");
  });

  it("names the stored file after its container", () => {
    expect(audioExtension("audio/webm")).toBe("webm");
    expect(audioExtension("audio/mp4")).toBe("m4a");
  });
});

describe("audio as a capture upload", () => {
  it("is a capture the upload routes will sign for", () => {
    expect(isCaptureMediaType("audio/webm")).toBe(true);
    expect(captureFileKind("audio/webm")).toBe("audio");
    expect(captureExtension("audio/mp4")).toBe("m4a");
  });

  it("has a size limit of its own, not an image's", () => {
    expect(maxCaptureBytes("audio/webm")).toBe(10 * 1024 * 1024);
    expect(maxCaptureBytes("image/png")).toBeLessThan(maxCaptureBytes("audio/webm"));
  });
});
