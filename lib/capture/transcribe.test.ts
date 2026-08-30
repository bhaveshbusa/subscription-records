import { describe, expect, it, vi } from "vitest";

import { DEFAULT_TRANSCRIPTION_MODEL, groqTranscriber } from "./transcribe";

const RECORDING = {
  bytes: new Uint8Array([26, 69, 223, 163]),
  mediaType: "audio/webm" as const,
  fileName: "voice-note.webm",
};

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("groqTranscriber", () => {
  it("sends the recording's own bytes, so no link to the private object is minted", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.resolve(reply({ text: "add Notion" })));

    const transcript = await groqTranscriber({ apiKey: "gsk-test", fetchImpl })(RECORDING);

    expect(transcript).toEqual({ text: "add Notion" });

    const [url, init] = fetchImpl.mock.calls[0];
    const form = init?.body as FormData;
    const file = form.get("file") as File;

    expect(url).toBe("https://api.groq.com/openai/v1/audio/transcriptions");
    expect(init?.method).toBe("POST");
    expect(form.get("model")).toBe(DEFAULT_TRANSCRIPTION_MODEL);
    expect(file.type).toBe("audio/webm");
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(RECORDING.bytes);
  });

  it("keeps the key in the header and out of the recording it uploads", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.resolve(reply({ text: "" })));

    await groqTranscriber({ apiKey: "gsk-test", model: "whisper-large-v3", fetchImpl })(
      RECORDING,
    );

    const [, init] = fetchImpl.mock.calls[0];

    expect(init?.headers).toEqual({ Authorization: "Bearer gsk-test" });
    expect((init?.body as FormData).get("model")).toBe("whisper-large-v3");
  });

  it("fails loudly when the transcriber refuses, rather than returning silence", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response("rate limited", { status: 429 })),
    );

    await expect(groqTranscriber({ apiKey: "gsk-test", fetchImpl })(RECORDING)).rejects.toThrow(
      /answered 429: rate limited/,
    );
  });

  it("fails when the answer carries no transcript", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.resolve(reply({ error: "nope" })));

    await expect(groqTranscriber({ apiKey: "gsk-test", fetchImpl })(RECORDING)).rejects.toThrow(
      /without a transcript/,
    );
  });
});
