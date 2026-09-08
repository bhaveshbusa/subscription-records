import {
  COVERAGE_FILTERS,
  HOLDING_STATUSES,
  MAX_LIMIT,
  SORT_KEYS,
  type CoverageFilter,
} from "./params";

/**
 * The statuses behind each chip. Holding is what you still have: active, trial,
 * paused, and cancelled-at-period-end. Cancelled is for the ones that are over.
 */
const FILTER_STATUSES = {
  holding: [...HOLDING_STATUSES],
  cancelled: ["cancelled"],
} as const;

export type SortKey = (typeof SORT_KEYS)[number];
export type SortOrder = "asc" | "desc";
export type LedgerFilter = "all" | "holding" | "cancelled";

/**
 * The `/ledger` view state, held in the URL so a filtered ledger is shareable
 * and survives a refresh.
 */
export type LedgerView = {
  q: string;
  filter: LedgerFilter;
  sort: SortKey;
  order: SortOrder;
  coverage: CoverageFilter | null;
  limit: number | null;
};

export const LEDGER_FILTERS = [
  { label: "All", value: "all" },
  { label: "Holding", value: "holding" },
  { label: "Cancelled", value: "cancelled" },
] as const satisfies { label: string; value: LedgerFilter }[];

export const LEDGER_SORTS = [
  { label: "Next renewal", value: "nextRenewal" },
  { label: "Provider", value: "provider" },
  { label: "Monthly equivalent", value: "monthlyEquivalent" },
  { label: "Last updated", value: "updatedAt" },
] as const satisfies { label: string; value: SortKey }[];

export const DEFAULT_LEDGER_VIEW: LedgerView = {
  q: "",
  filter: "holding",
  sort: "nextRenewal",
  order: "asc",
  coverage: null,
  limit: null,
};

export const LEDGER_COVERAGE_LABELS: Record<CoverageFilter, string> = {
  confirmed: "Confirmed paid commitments",
  unconfirmed: "Unconfirmed paid commitments",
  omitted: "Omitted from the paid-commitment total",
  afterTrial: "Trials (paid plan after trial)",
};

/** Summary links: coverage is the filter, so drop the default holding chip. */
export function coverageViewSearch(coverage: CoverageFilter): string {
  return ledgerViewToSearch({
    ...DEFAULT_LEDGER_VIEW,
    filter: "all",
    coverage,
  });
}

type ReadableParams = Pick<URLSearchParams, "get">;

function readFilter(params: ReadableParams): LedgerFilter {
  const all = params.get("all");

  if (all === "true" || all === "1") {
    return "all";
  }

  const status = params.get("status");

  if (status === "cancelled") {
    return "cancelled";
  }

  /** `status=active` was the old chip; it now means the holding set. */
  if (status === "active" || status === "holding") {
    return "holding";
  }

  return "holding";
}

function readSort(params: ReadableParams): SortKey {
  const sort = params.get("sort");

  return SORT_KEYS.find((key) => key === sort) ?? DEFAULT_LEDGER_VIEW.sort;
}

function readCoverage(params: ReadableParams): CoverageFilter | null {
  const coverage = params.get("coverage");

  return COVERAGE_FILTERS.find((key) => key === coverage) ?? null;
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
    coverage: readCoverage(params),
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

  if (view.filter === "all") {
    if (!options.expand) {
      params.set("all", "true");
    }
  } else if (view.filter === "cancelled") {
    params.set(
      "status",
      options.expand ? FILTER_STATUSES.cancelled.join(",") : "cancelled",
    );
  } else if (options.expand) {
    params.set("status", FILTER_STATUSES.holding.join(","));
  }
}

/** Query string for `/ledger`: only what differs from the defaults. */
export function ledgerViewToSearch(view: LedgerView): string {
  const params = new URLSearchParams();

  applyFilters(params, view);

  if (view.coverage) {
    params.set("coverage", view.coverage);
  }

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

  if (view.coverage) {
    params.set("coverage", view.coverage);
  }

  if (view.limit !== null) {
    params.set("limit", String(view.limit));
  }

  if (cursor) {
    params.set("cursor", cursor);
  }

  return params.toString();
}
