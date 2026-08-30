"use client";

import { useCallback, useRef, useState } from "react";

import { OutcomeNotice } from "@/components/proposals/outcome-notice";
import { ProposalCard, type Decision } from "@/components/proposals/proposal-card";
import { useProposalDecision } from "@/components/proposals/use-proposal-decision";
import {
  IMAGE_MEDIA_TYPES,
  isImageMediaType,
  MAX_IMAGE_BYTES,
} from "@/lib/capture/image";
import { MAX_MESSAGE_LENGTH } from "@/lib/capture/message";
import type { ChatCaptureResult } from "@/lib/capture/record";
import type {
  ImageCaptureReading,
  StartedImageCapture,
} from "@/lib/capture/screenshot";
import type { ConfirmedTerms } from "@/lib/proposals/confirm";
import type { ProposalView } from "@/lib/proposals/projection";

type Turn = {
  id: string;
  message: string;
  /** Null while a screenshot is still being read. */
  result: ChatCaptureResult | null;
  /** Why this screenshot could not be read, when it could not be. */
  failure?: string;
};

type ChatError = { message: string; unavailable: boolean };

const PLACEHOLDER =
  "I subscribed to Linear\n\nor paste a list:\nNetflix\nSpotify\nNotion\n1Password";

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
      message: payload.message ?? "Screenshot capture is unavailable on this server.",
      unavailable: true,
    };
  }

  return { message: "We couldn't read that message. Please try again.", unavailable: false };
}

/** A reading of a screenshot renders as a turn like any other. */
function toResult(reading: ImageCaptureReading): ChatCaptureResult {
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
  const [error, setError] = useState<ChatError | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
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
    async (file: File) => {
      if (uploading) {
        return;
      }

      setError(null);

      if (!isImageMediaType(file.type)) {
        setError({ message: "Screenshots must be PNG, JPEG, or WebP.", unavailable: false });

        return;
      }

      if (file.size === 0 || file.size > MAX_IMAGE_BYTES) {
        setError({
          message: `Screenshots must be under ${Math.floor(MAX_IMAGE_BYTES / (1024 * 1024))} MB.`,
          unavailable: false,
        });

        return;
      }

      setUploading(true);

      let captureId: string | null = null;

      try {
        const response = await fetch("/api/captures/images", {
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

        const started = (await response.json()) as StartedImageCapture;

        captureId = started.captureId;

        setTurns((current) => [
          ...current,
          { id: started.captureId, message: file.name, result: null },
        ]);

        const stored = await fetch(started.upload.url, {
          method: "PUT",
          headers: started.upload.headers,
          body: file,
        });

        if (!stored.ok) {
          settle(captureId, { failure: "The screenshot could not be uploaded." });

          return;
        }

        const read = await fetch(
          `/api/captures/images/${encodeURIComponent(captureId)}/read`,
          { method: "POST" },
        );

        if (!read.ok) {
          const failed = await readError(read);

          settle(captureId, { failure: failed.message });

          return;
        }

        const reading = (await read.json()) as ImageCaptureReading;

        settle(captureId, {
          result: reading.state === "read" ? toResult(reading) : null,
          failure:
            reading.state === "read"
              ? undefined
              : (reading.error ?? "The screenshot could not be read."),
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
            accept={IMAGE_MEDIA_TYPES.join(",")}
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
            disabled={uploading || sending}
            onClick={() => fileInput.current?.click()}
            type="button"
          >
            {uploading ? "Reading…" : "Add screenshot"}
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
