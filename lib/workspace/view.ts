/**
 * The workspace's own view state: which contextual filter the subscription
 * list is showing, and which subscription — saved, or still a draft — is open
 * inline in it.
 *
 * It lives in the URL beside the composer's `about` target and the inventory's
 * search and status filters, so one link carries the whole context: a reload,
 * a shared link, or a return lands on the same filter, the same open
 * subscription, and the same search. Nothing here is trusted: ids are only
 * checked for shape, and the server resolves them under the session user on
 * every read.
 */

export const WORKSPACE_PATH = "/workspace";

export const FILTER_PARAM = "show";
export const RECORD_PARAM = "record";
export const DRAFT_PARAM = "draft";

/** Params older links carried that the list no longer has a use for. */
const LEGACY_VIEW_PARAM = "view";
const LEGACY_PANE_PARAM = "pane";

/**
 * Overlapping views of the same subscriptions, not lifecycle statuses: a
 * saved subscription with a pending card and an open question is under both
 * Pending reviews and Open questions, and under All as itself.
 */
export type WorkspaceFilter = "all" | "reviews" | "questions" | "reminders";

export type WorkspaceState = {
  filter: WorkspaceFilter;
  /** The saved subscription open inline. */
  recordId: string | null;
  /** The pending `create` card open inline as a subscription not added yet. */
  draftId: string | null;
};

export const WORKSPACE_FILTERS = [
  { label: "All", value: "all" },
  { label: "Pending reviews", value: "reviews" },
  { label: "Open questions", value: "questions" },
  { label: "Reminders", value: "reminders" },
] as const satisfies { label: string; value: WorkspaceFilter }[];

export const DEFAULT_WORKSPACE_STATE: WorkspaceState = {
  filter: "all",
  recordId: null,
  draftId: null,
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ReadableParams = Pick<URLSearchParams, "get">;

export function isWorkspaceFilter(value: string | null): value is WorkspaceFilter {
  return WORKSPACE_FILTERS.some((entry) => entry.value === value);
}

function readId(params: ReadableParams, key: string): string | null {
  const value = params.get(key);

  return value && UUID.test(value) ? value : null;
}

export function parseWorkspaceState(params: ReadableParams): WorkspaceState {
  const show = params.get(FILTER_PARAM);
  /** The old Work view was the review queue; a link to it lands on Pending reviews. */
  const filter: WorkspaceFilter = isWorkspaceFilter(show)
    ? show
    : params.get(LEGACY_VIEW_PARAM) === "work"
      ? "reviews"
      : "all";
  const recordId = readId(params, RECORD_PARAM);

  return {
    filter,
    recordId,
    /** One subscription is open at a time; a saved one wins over a draft. */
    draftId: recordId ? null : readId(params, DRAFT_PARAM),
  };
}

/**
 * The next query string: the state the patch asks for, over every other param
 * — `about`, the search, the status chips — left exactly as it was. Only
 * values that differ from the default are written, so an ordinary workspace
 * link stays short.
 */
export function workspaceSearch(
  params: URLSearchParams,
  patch: Partial<WorkspaceState> = {},
): string {
  const next = new URLSearchParams(params.toString());
  const state = { ...parseWorkspaceState(params), ...patch };

  next.delete(LEGACY_VIEW_PARAM);
  next.delete(LEGACY_PANE_PARAM);

  if (state.filter === DEFAULT_WORKSPACE_STATE.filter) {
    next.delete(FILTER_PARAM);
  } else {
    next.set(FILTER_PARAM, state.filter);
  }

  if (state.recordId) {
    next.set(RECORD_PARAM, state.recordId);
    next.delete(DRAFT_PARAM);
  } else {
    next.delete(RECORD_PARAM);

    if (state.draftId) {
      next.set(DRAFT_PARAM, state.draftId);
    } else {
      next.delete(DRAFT_PARAM);
    }
  }

  return next.toString();
}

/** A server component's `searchParams`, in the shape every reader here uses. */
export function toSearchParams(
  input: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(input)) {
    for (const entry of Array.isArray(value) ? value : [value]) {
      if (typeof entry === "string") {
        params.append(key, entry);
      }
    }
  }

  return params;
}

export function workspaceHref(
  params: URLSearchParams,
  patch: Partial<WorkspaceState> = {},
): string {
  const search = workspaceSearch(params, patch);

  return search ? `${WORKSPACE_PATH}?${search}` : WORKSPACE_PATH;
}

/** Opening one saved subscription from somewhere that knows nothing but its id. */
export function recordWorkspaceHref(id: string): string {
  return workspaceHref(new URLSearchParams(), { recordId: id, draftId: null });
}

/**
 * Where an `/inbox`, `/ledger`, or `/ledger/<id>` link now goes. The old
 * params travel with it, so a bookmarked filtered ledger or a link that is
 * about one question still arrives at what it named.
 */
export function legacyWorkspaceHref(
  params: URLSearchParams,
  patch: Partial<WorkspaceState>,
): string {
  const next = new URLSearchParams(params.toString());

  next.delete(LEGACY_VIEW_PARAM);
  next.delete(LEGACY_PANE_PARAM);
  next.delete(FILTER_PARAM);
  next.delete(RECORD_PARAM);
  next.delete(DRAFT_PARAM);

  return workspaceHref(next, patch);
}
