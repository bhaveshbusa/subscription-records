import type { SubscriptionFormValues, SubscriptionWriteBody } from "./form-values";

export type FormStatus = SubscriptionFormValues["status"];

export type StatusEditDraft = {
  status: FormStatus;
  endsOn: string;
  resumedOn: string;
  notes: string;
};

export type StatusEditResult =
  | { ok: true; kind: "noop"; body: Record<string, never> }
  | { ok: true; kind: "write"; body: SubscriptionWriteBody; success: string }
  | { ok: true; kind: "unresolved"; body: SubscriptionWriteBody; success: string }
  | { ok: false; message: string };

function isEnded(status: FormStatus): boolean {
  return status === "cancelled";
}

function textOrNull(value: string): string | null {
  const trimmed = value.trim();

  return trimmed === "" ? null : trimmed;
}

/** Append a note without duplicating an identical existing one. */
export function appendNotes(existing: string, incoming: string): string | null {
  const next = incoming.trim();

  if (next === "") {
    return textOrNull(existing);
  }

  const prior = existing.trim();

  if (prior === "") {
    return next;
  }

  if (prior.includes(next)) {
    return prior;
  }

  return `${prior}\n\n${next}`;
}

/**
 * Whether choosing `next` from `current` is a cancel / schedule / reactivate
 * that needs user-stated timing before save — not a silent status flip.
 */
export function statusEditNeedsTiming(current: FormStatus, next: FormStatus): boolean {
  if (next === current) {
    return false;
  }

  if (next === "cancelled" || next === "cancel_scheduled") {
    return true;
  }

  return isEnded(current) && !isEnded(next);
}

/**
 * Builds the PATCH body for an inline status edit. Ordinary transitions send
 * status only. Cancel / schedule / reactivate require timing; unknown cancel
 * timing saves notes and leaves the holding status unchanged.
 */
export function toStatusEditBody(options: {
  initialStatus: FormStatus;
  initialNotes: string;
  draft: StatusEditDraft;
  unknownTiming?: boolean;
}): StatusEditResult {
  const { initialStatus, initialNotes, draft } = options;
  const next = draft.status;

  if (next === initialStatus) {
    return { ok: true, kind: "noop", body: {} };
  }

  if (options.unknownTiming) {
    if (next !== "cancelled") {
      return {
        ok: false,
        message: "Unknown timing only applies when marking a subscription cancelled.",
      };
    }

    const notes = appendNotes(initialNotes, draft.notes);

    if (notes === textOrNull(initialNotes)) {
      return {
        ok: true,
        kind: "unresolved",
        body: {},
        success: "Kept open — timing unknown. Status is unchanged.",
      };
    }

    return {
      ok: true,
      kind: "unresolved",
      body: { notes },
      success: "Kept open — timing unknown. Notes saved; status is unchanged.",
    };
  }

  if (next === "cancelled") {
    const endsOn = textOrNull(draft.endsOn);

    if (!endsOn) {
      return {
        ok: false,
        message: "Say when it ended, or choose I don't know when.",
      };
    }

    const body: SubscriptionWriteBody = { status: "cancelled", endsOn };
    const notes = appendNotes(initialNotes, draft.notes);

    if (notes !== textOrNull(initialNotes)) {
      body.notes = notes;
    }

    return {
      ok: true,
      kind: "write",
      body,
      success: `Cancelled, ending ${endsOn}.`,
    };
  }

  if (next === "cancel_scheduled") {
    const endsOn = textOrNull(draft.endsOn);

    if (!endsOn) {
      return {
        ok: false,
        message: "Set Ends on to the last day it still bills.",
      };
    }

    return {
      ok: true,
      kind: "write",
      body: { status: "cancel_scheduled", endsOn },
      success: `Cancel scheduled for ${endsOn}.`,
    };
  }

  if (isEnded(initialStatus)) {
    const resumedOn = textOrNull(draft.resumedOn);

    if (!resumedOn) {
      return {
        ok: false,
        message: "Say when it resumed.",
      };
    }

    return {
      ok: true,
      kind: "write",
      body: { status: next, resumedOn },
      success: `Resumed from ${resumedOn}.`,
    };
  }

  return {
    ok: true,
    kind: "write",
    body: { status: next },
    success: "Status saved.",
  };
}
