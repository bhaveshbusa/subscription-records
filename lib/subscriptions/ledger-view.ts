import { MAX_LIMIT, SORT_KEYS } from "./params";

/**
 * The statuses behind each chip. Active is the set that still bills, the same one
 * the monthly total sums, so a subscription cancelled at the end of its period is
 * in it until that day. Cancelled is for the ones that are over, however ended.
 */
const FILTER_STATUSES = {
  active: ["active", "trial", "cancel_scheduled"],
  cancelled: ["cancelled", "lapsed"],
} as const;

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

/**
 * `expand` writes the statuses a chip stands for, which is what the API filters
 * on. The browser's own URL keeps the chip's name, so a shared link stays short
 * and still means the chip rather than a frozen list of statuses.
 */
function applyFilters(
  params: URLSearchParams,
  view: LedgerView,
  options: { expand: boolean } = { expand: false },
) {
  if (view.q) {
    params.set("q", view.q);
  }

  if (view.filter === "needsAttention") {
    params.set("needsAttention", "true");
  } else if (view.filter !== "all") {
    params.set(
      "status",
      options.expand ? FILTER_STATUSES[view.filter].join(",") : view.filter,
    );
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

  applyFilters(params, view, { expand: true });

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
