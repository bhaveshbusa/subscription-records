"use client";

import { useCallback, useRef, useState } from "react";

import { OutcomeNotice } from "@/components/proposals/outcome-notice";
import { ProposalCard, type Decision } from "@/components/proposals/proposal-card";
import { useProposalDecision } from "@/components/proposals/use-proposal-decision";
import {
  audioExtension,
  baseMediaType,
  isAudioMediaType,
  MAX_RECORDING_MS,
  RECORDING_MIME_TYPES,
} from "@/lib/capture/audio";
import type {
  FileCaptureReading,
  StartedFileCapture,
} from "@/lib/capture/file-capture";
import { MAX_MESSAGE_LENGTH } from "@/lib/capture/message";
import type { ChatCaptureResult } from "@/lib/capture/record";
import {
  CAPTURE_MEDIA_TYPES,
  isCaptureMediaType,
  maxCaptureBytes,
} from "@/lib/capture/upload";
import type { ConfirmedTerms } from "@/lib/proposals/confirm";
import type { ProposalView } from "@/lib/proposals/projection";

type Turn = {
  id: string;
  message: string;
  /** Null while an uploaded file is still being read. */
  result: ChatCaptureResult | null;
  /** Why this file could not be read, when it could not be. */
  failure?: string;
};

type ChatError = { message: string; unavailable: boolean };

const PLACEHOLDER =
  "I subscribed to Linear\n\nor paste a list:\nNetflix\nSpotify\nNotion\n1Password";

/**
 * What this browser can actually record, best first. Chrome and Firefox record
 * Opus in WebM; Safari records MP4. Without a match there is nothing to record
 * into and the button says so rather than failing on the first click.
 */
function supportedRecordingType(): string | null {
  if (typeof MediaRecorder === "undefined") {
    return null;
  }

  return (
    RECORDING_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null
  );
}

async function readError(response: Response): Promise<ChatError> {
  const payload = (await response.json().catch(() => null)) as {
    error?: string;
    message?: string;
    issues?: { message: string }[];
  } | null;

  if (response.status === 401) {
    return { message: "Your session has expired. Sign in again to capture.", unavailable: false };
  }

  if (payload?.error === "extractor_unavailable") {
    return {
      message: payload.message ?? "Extraction is unavailable on this server.",
      unavailable: true,
    };
  }

  if (payload?.error === "extraction_failed") {
    return {
      message: `Extraction failed: ${payload.message ?? "the model did not answer."}`,
      unavailable: false,
    };
  }

  if (payload?.issues?.length) {
    return { message: payload.issues[0].message, unavailable: false };
  }

  if (payload?.error === "storage_unavailable") {
    return {
      message: payload.message ?? "File capture is unavailable on this server.",
      unavailable: true,
    };
  }

  return { message: "We couldn't read that message. Please try again.", unavailable: false };
}

/** A reading of an uploaded file renders as a turn like any other. */
function toResult(reading: FileCaptureReading): ChatCaptureResult {
  return {
    captureId: reading.captureId,
    mode: reading.mode,
    notice: reading.notice,
    proposals: reading.proposals,
    matches: reading.matches,
    followUp: reading.followUp,
    deferred: null,
  };
}

export function CaptureChat() {
  const [message, setMessage] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<ChatError | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const removeProposal = useCallback((id: string) => {
    setTurns((current) =>
      current.map((turn) =>
        turn.result === null
          ? turn
          : {
              ...turn,
              result: {
                ...turn.result,
                proposals: turn.result.proposals.filter(
                  (proposal) => proposal.id !== id,
                ),
              },
            },
      ),
    );
  }, []);
  const {
    decide,
    pending,
    error: decideError,
    outcomes,
  } = useProposalDecision({ onDecided: removeProposal });

  const send = useCallback(async () => {
    const text = message.trim();

    if (text.length === 0 || sending) {
      return;
    }

    setSending(true);
    setError(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

      if (!response.ok) {
        setError(await readError(response));

        return;
      }

      const result = (await response.json()) as ChatCaptureResult;

      setTurns((current) => [...current, { id: result.captureId, message: text, result }]);
      setMessage("");
    } catch {
      setError({ message: "We couldn't reach the server. Please try again.", unavailable: false });
    } finally {
      setSending(false);
    }
  }, [message, sending]);

  const settle = useCallback((captureId: string, turn: Partial<Turn>) => {
    setTurns((current) =>
      current.map((entry) => (entry.id === captureId ? { ...entry, ...turn } : entry)),
    );
  }, []);

  /**
   * The bytes go straight to private storage on a URL this server signed, and
   * the reading happens on the server: nothing here ever holds a link that could
   * fetch the screenshot back.
   */
  const upload = useCallback(
    async (file: File, label?: string) => {
      if (uploading) {
        return;
      }

      setError(null);

      if (!isCaptureMediaType(file.type)) {
        setError({
          message:
            "Uploads must be a PNG, JPEG, or WebP screenshot, a PDF, or an audio recording.",
          unavailable: false,
        });

        return;
      }

      const limit = maxCaptureBytes(file.type);

      if (file.size === 0 || file.size > limit) {
        setError({
          message: `A ${file.type} upload must be under ${Math.floor(limit / (1024 * 1024))} MB.`,
          unavailable: false,
        });

        return;
      }

      setUploading(true);

      let captureId: string | null = null;

      try {
        const response = await fetch("/api/captures/files", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            mediaType: file.type,
            byteSize: file.size,
          }),
        });

        if (!response.ok) {
          setError(await readError(response));

          return;
        }

        const started = (await response.json()) as StartedFileCapture;

        captureId = started.captureId;

        setTurns((current) => [
          ...current,
          { id: started.captureId, message: label ?? file.name, result: null },
        ]);

        const stored = await fetch(started.upload.url, {
          method: "PUT",
          headers: started.upload.headers,
          body: file,
        });

        if (!stored.ok) {
          settle(captureId, { failure: "The file could not be uploaded." });

          return;
        }

        const read = await fetch(
          `/api/captures/files/${encodeURIComponent(captureId)}/read`,
          { method: "POST" },
        );

        if (!read.ok) {
          const failed = await readError(read);

          settle(captureId, { failure: failed.message });

          return;
        }

        const reading = (await read.json()) as FileCaptureReading;

        settle(captureId, {
          result: reading.state === "read" ? toResult(reading) : null,
          failure:
            reading.state === "read"
              ? undefined
              : (reading.error ?? "The file could not be read."),
        });
      } catch {
        const message = "We couldn't reach the server. Please try again.";

        if (captureId) {
          settle(captureId, { failure: message });
        } else {
          setError({ message, unavailable: false });
        }
      } finally {
        setUploading(false);

        if (fileInput.current) {
          fileInput.current.value = "";
        }
      }
    },
    [settle, uploading],
  );

  const stopRecording = useCallback(() => {
    recorder.current?.stop();
  }, []);

  /**
   * The recording is assembled in the browser and then goes down the same path a
   * screenshot does: a signed upload, a reading on the server, pending
   * proposals. The microphone is released as soon as the recorder stops, and the
   * recorder stops itself at the cap rather than leaving one open.
   */
  const startRecording = useCallback(async () => {
    if (recording || uploading) {
      return;
    }

    setError(null);

    const mimeType = supportedRecordingType();

    if (!mimeType) {
      setError({
        message: "This browser can't record audio. Type the note instead.",
        unavailable: false,
      });

      return;
    }

    let stream: MediaStream;

    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError({
        message: "We couldn't use your microphone. Allow access and try again.",
        unavailable: false,
      });

      return;
    }

    const mediaRecorder = new MediaRecorder(stream, { mimeType });
    const chunks: Blob[] = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      window.clearTimeout(cap);
      recorder.current = null;
      setRecording(false);

      const mediaType = baseMediaType(mediaRecorder.mimeType || mimeType);

      if (!isAudioMediaType(mediaType)) {
        setError({
          message: `This browser recorded ${mediaType}, which we can't transcribe. Type the note instead.`,
          unavailable: false,
        });

        return;
      }

      const blob = new Blob(chunks, { type: mediaType });
      const file = new File([blob], `voice-note.${audioExtension(mediaType)}`, {
        type: mediaType,
      });

      void upload(file, "Voice note");
    };

    const cap = window.setTimeout(() => mediaRecorder.stop(), MAX_RECORDING_MS);

    recorder.current = mediaRecorder;
    setRecording(true);
    mediaRecorder.start();
  }, [recording, upload, uploading]);

  return (
    <section className="mx-auto mt-10 flex w-full max-w-5xl flex-col gap-6">
      <ol className="flex flex-col gap-6" aria-label="Capture conversation">
        {turns.map((turn) => (
          <li className="flex flex-col gap-4" key={turn.id}>
            <p className="self-end whitespace-pre-wrap rounded-3xl bg-emerald-950 px-5 py-3 text-sm text-white">
              {turn.message}
            </p>

            {turn.failure ? (
              <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {turn.failure}
              </p>
            ) : turn.result === null ? (
              <p className="rounded-2xl border border-stone-200 bg-white/80 px-4 py-3 text-sm text-stone-700">
                Reading…
              </p>
            ) : (
              <Answer
                busy={pending !== null}
                onDecide={(proposal, decision, confirm) =>
                  void decide(proposal, decision, confirm)
                }
                pending={pending}
                result={turn.result}
              />
            )}
          </li>
        ))}
      </ol>

      {outcomes.map((outcome, index) => (
        <OutcomeNotice key={`${outcome.provider}-${index}`} outcome={outcome} />
      ))}

      {decideError ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {decideError}
        </p>
      ) : null}

      {error ? (
        <p
          className={
            error.unavailable
              ? "rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
              : "rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          }
        >
          {error.message}
        </p>
      ) : null}

      <form
        className="flex flex-col gap-3 rounded-3xl border border-stone-200 bg-white/80 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <label className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500" htmlFor="chat-message">
          Message
        </label>
        <textarea
          className="min-h-28 w-full resize-y rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-900 outline-none focus:border-emerald-700"
          id="chat-message"
          maxLength={MAX_MESSAGE_LENGTH}
          name="message"
          onChange={(event) => setMessage(event.target.value)}
          placeholder={PLACEHOLDER}
          value={message}
        />
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-stone-500">
            Prices, cadences, and dates stay proposed until you confirm them.
          </p>
          <input
            accept={CAPTURE_MEDIA_TYPES.join(",")}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];

              if (file) {
                void upload(file);
              }
            }}
            ref={fileInput}
            type="file"
          />
          <button
            className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-emerald-700 disabled:opacity-60"
            disabled={uploading || sending || recording}
            onClick={() => fileInput.current?.click()}
            type="button"
          >
            {uploading ? "Reading…" : "Add screenshot or PDF"}
          </button>
          <button
            className={
              recording
                ? "rounded-xl border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-800 transition"
                : "rounded-xl border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-emerald-700 disabled:opacity-60"
            }
            disabled={uploading || sending}
            onClick={() => (recording ? stopRecording() : void startRecording())}
            type="button"
          >
            {recording ? "Stop recording" : "Record a voice note"}
          </button>
          <button
            className="rounded-xl bg-emerald-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-60"
            disabled={sending || message.trim().length === 0}
            type="submit"
          >
            {sending ? "Reading…" : "Send"}
          </button>
        </div>
      </form>
    </section>
  );
}

/** What a turn answered with, whether the turn was a message or a screenshot. */
function Answer({
  busy,
  onDecide,
  pending,
  result,
}: {
  busy: boolean;
  onDecide: (proposal: ProposalView, decision: Decision, confirm?: ConfirmedTerms) => void;
  pending: string | null;
  result: ChatCaptureResult;
}) {
  return (
    <>
      {result.notice ? (
        <p className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {result.notice}
        </p>
      ) : null}

      {result.matches.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {result.matches.map((match) => (
            <li
              className="rounded-2xl border border-stone-200 bg-white/80 px-4 py-3 text-sm text-stone-700"
              key={`${match.subscriptionId}-${match.candidateProvider}`}
            >
              {match.strength === "high"
                ? `You already have ${match.provider}. ${
                    match.proposalKind === "reactivated"
                      ? "This starts that record up again, keeping its history, rather than adding another."
                      : match.proposalKind === "charged"
                        ? "This records the payment against that record rather than adding another."
                        : match.proposalId
                        ? "This updates that record rather than adding another."
                        : "Nothing new to add, so nothing changed."
                  }`
                : `This looks like your existing ${match.provider}.`}
            </li>
          ))}
        </ul>
      ) : null}

      {result.deferred ? (
        <p className="rounded-2xl border border-stone-200 bg-white/80 px-4 py-3 text-sm text-stone-700">
          No problem — I won&apos;t ask about {result.deferred.provider} again until
          you bring it up.
        </p>
      ) : result.proposals.length === 0 && result.matches.length === 0 ? (
        <p className="rounded-2xl border border-stone-200 bg-white/80 px-4 py-3 text-sm text-stone-700">
          I couldn&apos;t find a subscription in that. Try naming the service, or paste one
          per line.
        </p>
      ) : result.proposals.length === 0 ? null : (
        <>
          <p className="text-sm text-stone-600">
            {result.proposals.length === 1
              ? "One proposal. Accept it to write it to your ledger."
              : `${result.proposals.length} proposals. Accept the ones you want in your ledger.`}
          </p>
          <ul className="flex flex-col gap-4">
            {result.proposals.map((proposal: ProposalView) => (
              <li key={proposal.id}>
                <ProposalCard
                  busy={busy}
                  onDecide={onDecide}
                  proposal={proposal}
                  working={pending === proposal.id}
                />
              </li>
            ))}
          </ul>
        </>
      )}

      {result.followUp ? (
        <p className="rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm font-medium text-stone-900">
          {result.followUp.question}
        </p>
      ) : null}
    </>
  );
}
