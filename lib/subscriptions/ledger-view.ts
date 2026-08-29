import { MAX_LIMIT, SORT_KEYS } from "./params";

export type SortKey = (typeof SORT_KEYS)[number];
export type SortOrder = "asc" | "desc";
export type LedgerFilter = "all" | "active" | "cancelled" | "needsAttention";

/**
 * The `/ledger` view state, held in the URL so a filtered ledger is shareable
 * and survives a refresh.
 */
export type LedgerView = {
  q: string;
  filter: LedgerFilter;
  sort: SortKey;
  order: SortOrder;
  limit: number | null;
};

export const LEDGER_FILTERS = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Cancelled", value: "cancelled" },
  { label: "Needs attention", value: "needsAttention" },
] as const satisfies { label: string; value: LedgerFilter }[];

export const LEDGER_SORTS = [
  { label: "Next renewal", value: "nextRenewal" },
  { label: "Provider", value: "provider" },
  { label: "Monthly equivalent", value: "monthlyEquivalent" },
  { label: "Last updated", value: "updatedAt" },
] as const satisfies { label: string; value: SortKey }[];

export const DEFAULT_LEDGER_VIEW: LedgerView = {
  q: "",
  filter: "all",
  sort: "nextRenewal",
  order: "asc",
  limit: null,
};

type ReadableParams = Pick<URLSearchParams, "get">;

function readFilter(params: ReadableParams): LedgerFilter {
  const needsAttention = params.get("needsAttention");

  if (needsAttention === "true" || needsAttention === "1") {
    return "needsAttention";
  }

  const status = params.get("status");

  if (status === "active" || status === "cancelled") {
    return status;
  }

  return "all";
}

function readSort(params: ReadableParams): SortKey {
  const sort = params.get("sort");

  return SORT_KEYS.find((key) => key === sort) ?? DEFAULT_LEDGER_VIEW.sort;
}

function readLimit(params: ReadableParams): number | null {
  const raw = params.get("limit");

  if (raw === null || !/^\d+$/.test(raw)) {
    return null;
  }

  const limit = Number.parseInt(raw, 10);

  return limit >= 1 && limit <= MAX_LIMIT ? limit : null;
}

export function parseLedgerView(params: ReadableParams): LedgerView {
  return {
    q: params.get("q")?.trim() ?? "",
    filter: readFilter(params),
    sort: readSort(params),
    order: params.get("order") === "desc" ? "desc" : "asc",
    limit: readLimit(params),
  };
}

function applyFilters(params: URLSearchParams, view: LedgerView) {
  if (view.q) {
    params.set("q", view.q);
  }

  if (view.filter === "needsAttention") {
    params.set("needsAttention", "true");
  } else if (view.filter !== "all") {
    params.set("status", view.filter);
  }
}

/** Query string for `/ledger`: only what differs from the defaults. */
export function ledgerViewToSearch(view: LedgerView): string {
  const params = new URLSearchParams();

  applyFilters(params, view);

  if (view.sort !== DEFAULT_LEDGER_VIEW.sort) {
    params.set("sort", view.sort);
  }

  if (view.order !== DEFAULT_LEDGER_VIEW.order) {
    params.set("order", view.order);
  }

  if (view.limit !== null) {
    params.set("limit", String(view.limit));
  }

  return params.toString();
}

/** Query string for `GET /api/subscriptions`, page by page. */
export function ledgerApiSearch(view: LedgerView, cursor?: string | null): string {
  const params = new URLSearchParams();

  applyFilters(params, view);

  params.set("sort", view.sort);
  params.set("order", view.order);

  if (view.limit !== null) {
    params.set("limit", String(view.limit));
  }

  if (cursor) {
    params.set("cursor", cursor);
  }

  return params.toString();
}
