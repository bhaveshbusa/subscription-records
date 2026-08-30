import { z } from "zod";

import type { AudioMediaType } from "./audio";

/** Whisper on Groq: fast, cheap, and the model reads brand names well enough. */
export const DEFAULT_TRANSCRIPTION_MODEL = "whisper-large-v3-turbo";

const TRANSCRIPTION_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

/**
 * Given to the transcriber as context rather than as text to transcribe: it
 * spells the words a voice note about subscriptions is full of, so "add Notion"
 * does not come back as "add motion".
 */
const TRANSCRIPTION_PROMPT =
  "Someone is listing the subscriptions they pay for, and the prices, billing periods, and renewal dates they remember.";

/** A recording on its way to a transcriber. */
export type AudioToRead = {
  bytes: Uint8Array;
  mediaType: AudioMediaType;
  fileName: string;
};

/** What was said, as the only thing taken from the recording. */
export type Transcript = { text: string };

/** Only the call this module makes, so a test can stand in for the network. */
export type Transcriber = (audio: AudioToRead) => Promise<Transcript>;

export type TranscriberOptions = {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
};

const transcriptSchema = z.object({ text: z.string() });

/**
 * Sends the bytes the server already holds, so the private bucket stays private
 * and no link to a recording is ever minted. Throws when the transcriber cannot
 * be reached or answers with something else, so a broken key is reported rather
 * than looking like a recording with nothing in it.
 */
export function groqTranscriber(options: TranscriberOptions): Transcriber {
  const call = options.fetchImpl ?? fetch;

  return async (audio) => {
    const form = new FormData();

    form.append(
      "file",
      new Blob([new Uint8Array(audio.bytes)], { type: audio.mediaType }),
      audio.fileName,
    );
    form.append("model", options.model ?? DEFAULT_TRANSCRIPTION_MODEL);
    form.append("response_format", "json");
    form.append("prompt", TRANSCRIPTION_PROMPT);

    const response = await call(TRANSCRIPTION_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${options.apiKey}` },
      body: form,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");

      throw new Error(
        `the transcriber answered ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
      );
    }

    const parsed = transcriptSchema.safeParse(await response.json().catch(() => null));

    if (!parsed.success) {
      throw new Error("the transcriber answered without a transcript");
    }

    return { text: parsed.data.text };
  };
}
