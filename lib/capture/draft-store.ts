import { targetKey, type TargetDescriptor } from "./target-fields";

/**
 * The words someone has typed but not sent, kept per target so switching from
 * one record to another and back finds the draft where it was left, and a
 * reload does not lose it. The send attempt id travels with the draft: a
 * browser that reloads mid-send retries under the same id, so the server can
 * answer with the turn it already made rather than reading the message again.
 */
export type Draft = {
  text: string;
  /** The id the in-flight or failed send used, until the turn lands. */
  clientTurnId: string | null;
};

/** The subset of `Storage` the store needs, so tests can hand in a map. */
export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const PREFIX = "capture-draft:";

/** The target the composer had selected, so a return finds the same context. */
const SELECTED_KEY = "capture-target";

export function draftKey(target: TargetDescriptor): string {
  return `${PREFIX}${targetKey(target)}`;
}

export function readDraft(storage: DraftStorage, target: TargetDescriptor): Draft | null {
  const raw = storage.getItem(draftKey(target));

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<Draft>;

    if (typeof parsed.text !== "string") {
      return null;
    }

    return {
      text: parsed.text,
      clientTurnId: typeof parsed.clientTurnId === "string" ? parsed.clientTurnId : null,
    };
  } catch {
    return null;
  }
}

/** Stores what is in the box; an empty box with no attempt in flight removes the entry. */
export function writeDraft(storage: DraftStorage, target: TargetDescriptor, draft: Draft): void {
  if (draft.text.trim().length === 0 && draft.clientTurnId === null) {
    storage.removeItem(draftKey(target));

    return;
  }

  storage.setItem(draftKey(target), JSON.stringify(draft));
}

export function clearDraft(storage: DraftStorage, target: TargetDescriptor): void {
  storage.removeItem(draftKey(target));
}

const DRAFT_EVENT = "capture-draft-change";

/** Lets a component read drafts as an external store: fires after every write in this tab. */
export function notifyDraftChange(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(DRAFT_EVENT));
  }
}

export function subscribeDrafts(listener: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  window.addEventListener(DRAFT_EVENT, listener);
  window.addEventListener("storage", listener);

  return () => {
    window.removeEventListener(DRAFT_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

export function readSelectedTarget(storage: DraftStorage): TargetDescriptor | null {
  const raw = storage.getItem(SELECTED_KEY);

  if (!raw) {
    return null;
  }

  try {
    return parseTargetDescriptor(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeSelectedTarget(storage: DraftStorage, target: TargetDescriptor): void {
  if (target.kind === "all") {
    storage.removeItem(SELECTED_KEY);

    return;
  }

  storage.setItem(SELECTED_KEY, JSON.stringify(target));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A stored or URL-borne descriptor, checked for shape only. Whether the id is
 * this user's and still open is the server's call on every request; nothing
 * here grants anything.
 */
export function parseTargetDescriptor(value: unknown): TargetDescriptor | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" && UUID.test(record.id) ? record.id : null;
  const provider = typeof record.provider === "string" ? record.provider : "";
  const subscriptionId =
    typeof record.subscriptionId === "string" && UUID.test(record.subscriptionId)
      ? record.subscriptionId
      : null;

  switch (record.kind) {
    case "all":
      return { kind: "all" };
    case "subscription":
      return id ? { kind: "subscription", id, provider } : null;
    case "proposal":
      return id ? { kind: "proposal", id, provider, subscriptionId } : null;
    case "question":
      return id
        ? {
            kind: "question",
            id,
            provider,
            question: typeof record.question === "string" ? record.question : "",
            subscriptionId,
          }
        : null;
    default:
      return null;
  }
}

/** `about=subscription:<id>` in the URL, so a link or a reload lands on the same target. */
export const ABOUT_PARAM = "about";

export function targetFromSearch(params: URLSearchParams): TargetDescriptor | null {
  const about = params.get(ABOUT_PARAM);

  if (!about) {
    return null;
  }

  const [kind, id] = about.split(":", 2);

  if (!id || !UUID.test(id)) {
    return null;
  }

  switch (kind) {
    case "subscription":
      return { kind, id, provider: "" };
    case "proposal":
      return { kind, id, provider: "", subscriptionId: null };
    case "question":
      return { kind, id, provider: "", question: "", subscriptionId: null };
    default:
      return null;
  }
}

export function targetToSearch(target: TargetDescriptor): string | null {
  return target.kind === "all" ? null : targetKey(target);
}
