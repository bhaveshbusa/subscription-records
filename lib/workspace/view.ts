/**
 * The workspace's own view state: which view is showing, which record is
 * selected, and — on a screen too narrow for both columns — whether the
 * record or the conversation has the screen.
 *
 * It lives in the URL beside the composer's `about` target and the inventory's
 * filters, so one link carries the whole context: a reload, a shared link, or
 * a return from the record view lands on the same view, the same record, and
 * the same filters. Nothing here is trusted: the record id is only checked for
 * shape, and the server resolves it under the session user on every read.
 */

export const WORKSPACE_PATH = "/workspace";

export const VIEW_PARAM = "view";
export const RECORD_PARAM = "record";
export const PANE_PARAM = "pane";

export type WorkspaceViewName = "work" | "subscriptions";

/** Which column a narrow screen shows; both are visible from `lg` up. */
export type WorkspacePane = "conversation" | "record";

export type WorkspaceState = {
  view: WorkspaceViewName;
  recordId: string | null;
  pane: WorkspacePane;
};

export const WORKSPACE_VIEWS = [
  { label: "Work", value: "work" },
  { label: "Subscriptions", value: "subscriptions" },
] as const satisfies { label: string; value: WorkspaceViewName }[];

export const DEFAULT_WORKSPACE_STATE: WorkspaceState = {
  view: "work",
  recordId: null,
  pane: "conversation",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ReadableParams = Pick<URLSearchParams, "get">;

/** Selecting a record opens it; the return control asks for the conversation. */
function defaultPane(recordId: string | null): WorkspacePane {
  return recordId ? "record" : "conversation";
}

export function parseWorkspaceState(params: ReadableParams): WorkspaceState {
  const view: WorkspaceViewName =
    params.get(VIEW_PARAM) === "subscriptions" ? "subscriptions" : "work";
  const record = params.get(RECORD_PARAM);
  const recordId = record && UUID.test(record) ? record : null;
  const pane = params.get(PANE_PARAM);

  return {
    view,
    recordId,
    pane:
      pane === "record" || pane === "conversation" ? pane : defaultPane(recordId),
  };
}

/**
 * The next query string: the state the patch asks for, over every other param
 * — `about`, the inventory filters, the search — left exactly as it was. Only
 * values that differ from the default are written, so an ordinary workspace
 * link stays short.
 */
export function workspaceSearch(
  params: URLSearchParams,
  patch: Partial<WorkspaceState> = {},
): string {
  const next = new URLSearchParams(params.toString());
  const state = { ...parseWorkspaceState(params), ...patch };

  if (state.view === DEFAULT_WORKSPACE_STATE.view) {
    next.delete(VIEW_PARAM);
  } else {
    next.set(VIEW_PARAM, state.view);
  }

  if (state.recordId) {
    next.set(RECORD_PARAM, state.recordId);
  } else {
    next.delete(RECORD_PARAM);
  }

  /** With nothing selected there is no second column to choose between. */
  if (!state.recordId || state.pane === defaultPane(state.recordId)) {
    next.delete(PANE_PARAM);
  } else {
    next.set(PANE_PARAM, state.pane);
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

/** Opening one record from somewhere that knows nothing but its id. */
export function recordWorkspaceHref(id: string): string {
  return workspaceHref(new URLSearchParams(), { recordId: id, pane: "record" });
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

  next.delete(VIEW_PARAM);
  next.delete(RECORD_PARAM);
  next.delete(PANE_PARAM);

  return workspaceHref(next, patch);
}
