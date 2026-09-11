"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  audioExtension,
  baseMediaType,
  isAudioMediaType,
  MAX_RECORDING_MS,
  RECORDING_MIME_TYPES,
} from "@/lib/capture/audio";
import type { ConversationTurn } from "@/lib/capture/conversation";
import {
  clearDraft,
  notifyDraftChange,
  readDraft,
  subscribeDrafts,
  writeDraft,
  type Draft,
  type DraftStorage,
} from "@/lib/capture/draft-store";
import type { FileCaptureReading, StartedFileCapture } from "@/lib/capture/file-capture";
import { MAX_MESSAGE_LENGTH } from "@/lib/capture/message";
import type { ChatCaptureResult } from "@/lib/capture/record";
import { targetInput, targetKey, type TargetDescriptor } from "@/lib/capture/target-fields";
import {
  CAPTURE_MEDIA_TYPES,
  isCaptureMediaType,
  maxCaptureBytes,
} from "@/lib/capture/upload";

import { ConversationPanel } from "./conversation-panel";

type CaptureError = {
  message: string;
  unavailable: boolean;
  /** Whether what was typed is still in the box, so the error can say so. */
  keptInput?: boolean;
  /** The message named these services rather than the selected target. */
  conflicting?: string[];
};

const ALL: TargetDescriptor = { kind: "all" };

/** Where drafts go when the browser will not keep them: this tab only. */
const memoryStorage: DraftStorage = (() => {
  const map = new Map<string, string>();

  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
})();

function browserStorage(): DraftStorage {
  try {
    return typeof window === "undefined" ? memoryStorage : window.localStorage;
  } catch {
    return memoryStorage;
  }
}

const EMPTY_DRAFT = JSON.stringify({ text: "", clientTurnId: null } satisfies Draft);

/**
 * The draft for one target, read from storage as the source of truth rather
 * than copied into state: a reload, another tab, or a switch back to this
 * target all show what was typed, and the server renders an empty box.
 */
function useDraft(target: TargetDescriptor): [Draft, (next: Draft) => void] {
  const snapshot = useSyncExternalStore(
    subscribeDrafts,
    () => {
      const draft = readDraft(browserStorage(), target);

      return draft ? JSON.stringify(draft) : EMPTY_DRAFT;
    },
    () => EMPTY_DRAFT,
  );
  const draft = useMemo(() => JSON.parse(snapshot) as Draft, [snapshot]);
  const setDraft = useCallback(
    (next: Draft) => {
      writeDraft(browserStorage(), target, next);
      notifyDraftChange();
    },
    [target],
  );

  return [draft, setDraft];
}

/** What the composer is about, in the words shown above the box. */
export function targetLabel(target: TargetDescriptor): string {
  switch (target.kind) {
    case "all":
      return "All subscriptions";
    case "subscription":
      return target.provider || "This subscription";
    case "proposal":
      return target.provider ? `The ${target.provider} card` : "This card";
    case "question":
      return target.question || `A question about ${target.provider}`;
  }
}

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

  return RECORDING_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

async function readError(response: Response): Promise<CaptureError> {
  const payload = (await response.json().catch(() => null)) as {
    error?: string;
    reason?: string | null;
    message?: string;
    issues?: { message: string }[];
  } | null;

  if (response.status === 401) {
    return {
      message: "Your session has expired. Sign in again to capture.",
      unavailable: false,
    };
  }

  if (payload?.error === "extractor_unavailable") {
    return {
      message: payload.message ?? "Extraction is unavailable on this server.",
      unavailable: true,
    };
  }

  if (
    payload?.error === "question_not_found" ||
    payload?.error === "question_required" ||
    payload?.error === "question_unanswered" ||
    payload?.error === "target_not_found" ||
    payload?.error === "target_stale"
  ) {
    return {
      message: payload.message ?? "That question could not be answered. Try again.",
      unavailable: false,
    };
  }

  if (payload?.error === "target_mismatch") {
    return {
      message: payload.message ?? "That mentions a different service than the one selected.",
      unavailable: false,
      conflicting: (payload as { conflicting?: string[] }).conflicting ?? [],
    };
  }

  if (payload?.error === "extraction_failed") {
    /**
     * A failure the reader can explain - the list was too long to read in one
     * go - arrives with a sentence already written for the person who sent it.
     * Prefixing that with "Extraction failed" would put the technical framing
     * back on top of the thing that replaced it.
     */
    if (payload.reason && payload.message) {
      return { message: payload.message, unavailable: false };
    }

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

/**
 * What the last capture turn said back, tied to the box that produced it. The
 * proposals themselves are not repeated here — they are in Proposals, which is
 * the one place a proposal is decided. This is the reply, not a transcript:
 * only the latest turn is kept, because a capture box is not a conversation.
 */
function TurnReply({ result }: { result: ChatCaptureResult }) {
  const { proposals, matches, notice, deferred, followUp } = result;
  const nothingFound =
    proposals.length === 0 && matches.length === 0 && !notice && !deferred;

  return (
    <div className="flex flex-col gap-2">
      {notice ? (
        <p className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {notice}
        </p>
      ) : null}

      {matches.map((match) => (
        <p
          className="rounded-2xl border border-stone-200 bg-white/80 px-4 py-3 text-sm text-stone-700"
          key={`${match.subscriptionId}-${match.candidateProvider}`}
        >
          {match.strength === "high"
            ? `You already have ${match.provider}. ${
                match.proposalKind === "reactivated"
                  ? "This starts that record up again, keeping its history, rather than adding another."
                  : match.proposalId
                    ? "This updates that record rather than adding another."
                    : "Nothing new to add, so nothing changed."
              }`
            : `This looks like your existing ${match.provider}.`}
        </p>
      ))}

      {deferred ? (
        <p className="rounded-2xl border border-stone-200 bg-white/80 px-4 py-3 text-sm text-stone-700">
          No problem — I won&apos;t ask about {deferred.provider} again until you bring it
          up.
        </p>
      ) : null}

      {nothingFound ? (
        <p className="rounded-2xl border border-stone-200 bg-white/80 px-4 py-3 text-sm text-stone-700">
          I couldn&apos;t find a subscription in that. Try naming the service, or paste one
          per line.
        </p>
      ) : null}

      {proposals.length > 0 ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {proposals.length === 1
            ? "One proposal is waiting below. Accept it to write it to your ledger."
            : `${proposals.length} proposals are waiting below. Accept the ones you want in your ledger.`}
        </p>
      ) : null}

      {followUp ? (
        <p className="rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm font-medium text-stone-900">
          {followUp.question}
          <span className="mt-1 block text-xs font-normal text-stone-500">
            It stays in Questions below until you answer it or put it off.
          </span>
        </p>
      ) : null}
    </div>
  );
}

/**
 * Capture, on the page the results land on. Text, a pasted list, a screenshot,
 * a PDF, or a voice note all go down the same path: a capture is stored, an
 * extractor reads it, and whatever it finds becomes a **pending proposal** in
 * Proposals below. Nothing here writes to the ledger.
 *
 * Every turn is sent about one explicit target - all subscriptions, a selected
 * subscription, a pending card, or an exact question - and the same target is
 * used for text, files, and voice. The server checks the id on every request;
 * this box only says which one it meant. What is typed but not sent is kept per
 * target, so switching records and coming back, or reloading, finds it.
 */
export function CaptureComposer({
  onCaptured,
  target = ALL,
  home = ALL,
  onSelectTarget,
  conversation = [],
  conversationLoading = false,
}: {
  onCaptured: (result: ChatCaptureResult) => void;
  target?: TargetDescriptor;
  /**
   * Where the box returns to when it stops being about the current target:
   * all subscriptions for the general box, the subscription itself for a box
   * that sits inside one and is replying to its question or card.
   */
  home?: TargetDescriptor;
  /** The person changed what the box is about; `home` clears it. */
  onSelectTarget?: (target: TargetDescriptor) => void;
  /** Earlier turns about this target, read back from the server. */
  conversation?: ConversationTurn[];
  conversationLoading?: boolean;
}) {
  const [draft, setDraft] = useDraft(target);
  const message = draft.text;
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<CaptureError | null>(null);
  const [result, setResult] = useState<ChatCaptureResult | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const messageInput = useRef<HTMLTextAreaElement>(null);
  const inputId = useId();
  const key = targetKey(target);
  const atHome = key === targetKey(home);

  useEffect(() => {
    if (target.kind !== "all") {
      messageInput.current?.focus();
    }
  }, [key, target.kind]);

  /**
   * A target that is gone or decided is not one to keep sending about. The
   * text moves with the switch to all subscriptions rather than staying parked
   * under a key nothing will select again.
   */
  const carryOver = useCallback(
    (text: string) => {
      const storage = browserStorage();

      clearDraft(storage, target);
      writeDraft(storage, home, { text, clientTurnId: null });
      notifyDraftChange();
      onSelectTarget?.(home);
    },
    [home, onSelectTarget, target],
  );

  /** One turn at a time: the new reply replaces the last, and never stacks. */
  const settle = useCallback(
    (next: ChatCaptureResult) => {
      setResult(next);
      onCaptured(next);
    },
    [onCaptured],
  );

  const send = useCallback(
    async (about: TargetDescriptor = target) => {
      const text = message.trim();

      if (text.length === 0 || sending) {
        return;
      }

      setSending(true);
      setError(null);

      /**
       * One id per attempt, reused on retry: a send that timed out on the way
       * back is answered with the turn it already made, not a second reading.
       * A fresh message gets a fresh id.
       */
      const clientTurnId = draft.clientTurnId ?? crypto.randomUUID();

      setDraft({ text: message, clientTurnId });

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, clientTurnId, ...targetInput(about) }),
        });

        if (!response.ok) {
          /**
           * The box is not cleared until a capture lands, so a failed send leaves
           * the list exactly where it was: the retry is editing it and pressing
           * Send, not typing it out again. An expired session is the exception -
           * signing in again is the next step there, not editing the message.
           */
          const failure = await readError(response);

          setError({ ...failure, keptInput: response.status !== 401 });

          if (response.status === 404 && about.kind !== "all") {
            carryOver(text);
          }

          return;
        }

        settle((await response.json()) as ChatCaptureResult);
        clearDraft(browserStorage(), target);
        notifyDraftChange();

        if (about.kind !== target.kind) {
          onSelectTarget?.(about);
        }
      } catch {
        setError({
          message: "We couldn't reach the server. Please try again.",
          unavailable: false,
          keptInput: true,
        });
      } finally {
        setSending(false);
      }
    },
    [message, draft.clientTurnId, setDraft, sending, settle, target, onSelectTarget, carryOver],
  );

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
      setResult(null);

      try {
        const response = await fetch("/api/captures/files", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            mediaType: file.type,
            byteSize: file.size,
            ...targetInput(target),
          }),
        });

        if (!response.ok) {
          setError(await readError(response));

          if (response.status === 404 && target.kind !== "all") {
            carryOver(message);
          }

          return;
        }

        const started = (await response.json()) as StartedFileCapture;
        const stored = await fetch(started.upload.url, {
          method: "PUT",
          headers: started.upload.headers,
          body: file,
        });

        if (!stored.ok) {
          setError({ message: "The file could not be uploaded.", unavailable: false });

          return;
        }

        const read = await fetch(
          `/api/captures/files/${encodeURIComponent(started.captureId)}/read`,
          { method: "POST" },
        );

        if (!read.ok) {
          setError(await readError(read));

          return;
        }

        const reading = (await read.json()) as FileCaptureReading;

        if (reading.state === "read") {
          settle(toResult(reading));
        } else {
          setError({
            message: reading.error ?? "The file could not be read.",
            unavailable: false,
          });
        }
      } catch {
        setError({
          message: "We couldn't reach the server. Please try again.",
          unavailable: false,
        });
      } finally {
        setUploading(false);

        if (fileInput.current) {
          fileInput.current.value = "";
        }
      }
    },
    [settle, uploading, target, message, carryOver],
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

      void upload(file);
    };

    const cap = window.setTimeout(() => mediaRecorder.stop(), MAX_RECORDING_MS);

    recorder.current = mediaRecorder;
    setRecording(true);
    mediaRecorder.start();
  }, [recording, upload, uploading]);

  return (
    <section aria-label="Capture" className="flex flex-col gap-3">
      <form
        className="flex flex-col gap-3 rounded-3xl border border-stone-200 bg-white/80 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <label
          className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500"
          htmlFor={inputId}
        >
          {target.kind === "question"
            ? "Replying to a question"
            : target.kind === "all"
              ? "Capture a subscription"
              : `About ${targetLabel(target)}`}
        </label>
        <div
          aria-label="Conversation target"
          className={
            target.kind === "all"
              ? "flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3"
              : "flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3"
          }
          data-target={key}
        >
          <p
            className={
              target.kind === "all"
                ? "text-sm text-stone-600"
                : "text-sm font-medium text-emerald-950"
            }
          >
            {target.kind === "all"
              ? "About all subscriptions. Pick a card, a question, or a record to talk about just that one."
              : targetLabel(target)}
          </p>
          {atHome ? null : (
            <button
              className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-800 hover:text-emerald-950"
              onClick={() => onSelectTarget?.(home)}
              type="button"
            >
              {home.kind === "all" ? "Capture something else" : `Back to ${targetLabel(home)}`}
            </button>
          )}
        </div>
        <textarea
          className="min-h-24 w-full resize-y rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-900 outline-none focus:border-emerald-700"
          id={inputId}
          maxLength={MAX_MESSAGE_LENGTH}
          name="message"
          onChange={(event) =>
            /** Different words are a different turn, so a retry id does not replay the old one. */
            setDraft({ text: event.target.value, clientTurnId: null })
          }
          placeholder={target.kind === "all" ? PLACEHOLDER : "£12 monthly"}
          ref={messageInput}
          value={message}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-stone-500">
            Prices, cadences, and dates stay proposed until you confirm them.
          </p>
          <div className="flex flex-wrap items-center gap-3">
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
        </div>
      </form>

      {error ? (
        <p
          className={
            error.unavailable
              ? "rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
              : "rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          }
        >
          {error.message}
          {error.conflicting ? (
            <span className="mt-2 flex flex-wrap gap-2">
              <button
                className="rounded-xl border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-900 hover:border-red-500"
                disabled={sending}
                onClick={() => void send(ALL)}
                type="button"
              >
                Send about all subscriptions
              </button>
              <button
                className="rounded-xl border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-900 hover:border-red-500"
                onClick={() => {
                  setError(null);
                  messageInput.current?.focus();
                }}
                type="button"
              >
                Keep {targetLabel(target)} and edit
              </button>
            </span>
          ) : error.keptInput ? (
            <span className="mt-1 block">
              Your message is still in the box - edit it and send again.
            </span>
          ) : null}
        </p>
      ) : null}

      {result ? <TurnReply result={result} /> : null}

      {target.kind !== "all" ? (
        <ConversationPanel loading={conversationLoading} turns={conversation} />
      ) : null}
    </section>
  );
}
