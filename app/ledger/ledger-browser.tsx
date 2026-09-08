"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  PAID_COMMITMENT_LABEL,
  type CoverageBreakdown,
} from "@/lib/subscriptions/coverage";
import { formatDate, formatMonthlyEquivalent } from "@/lib/subscriptions/format";
import {
  DEFAULT_LEDGER_VIEW,
  LEDGER_COVERAGE_LABELS,
  LEDGER_FILTERS,
  LEDGER_SORTS,
  coverageViewSearch,
  ledgerApiSearch,
  ledgerViewToSearch,
  parseLedgerView,
  type LedgerView,
  type SortKey,
} from "@/lib/subscriptions/ledger-view";
import type { SubscriptionListItem } from "@/lib/subscriptions/projection";

import { SubscriptionsTable } from "./subscriptions-table";

type Summary = {
  activeCount: number;
  trialCount: number;
  monthlyEquivalentMinor: number;
  label?: string;
  coverage?: CoverageBreakdown;
  nextRenewal: {
    provider: string;
    on: string;
    basis?: "expected" | "recorded";
  } | null;
};

type Page = { items: SubscriptionListItem[]; nextCursor: string | null };

function errorMessage(response: Response, resource: string) {
  if (response.status === 401) {
    return `Your session has expired. Sign in again to view your ${resource}.`;
  }

  return `We couldn't load your ${resource}. Please try again.`;
}

async function fetchPage(search: string, signal: AbortSignal): Promise<Page> {
  const response = await fetch(`/api/subscriptions?${search}`, { signal });

  if (!response.ok) {
    throw new Error(errorMessage(response, "subscriptions"));
  }

  const payload = (await response.json()) as Partial<Page>;

  if (!Array.isArray(payload.items)) {
    throw new Error("We couldn't load your subscriptions. Please try again.");
  }

  return { items: payload.items, nextCursor: payload.nextCursor ?? null };
}

function CoverageLink({
  coverage,
  children,
}: {
  coverage: "confirmed" | "unconfirmed" | "omitted" | "afterTrial";
  children: ReactNode;
}) {
  return (
    <Link
      className="font-semibold text-emerald-900 underline decoration-emerald-300 underline-offset-4 hover:text-emerald-700"
      href={`/ledger?${coverageViewSearch(coverage)}`}
    >
      {children}
    </Link>
  );
}

function CoveragePanel({ summary }: { summary: Summary }) {
  const coverage = summary.coverage;

  if (!coverage) {
    return null;
  }

  const omittedCount =
    coverage.omitted.missingPriceOrCadence.count + coverage.omitted.excludedCurrency.count;
  const excludedCurrencies = [
    ...new Set(coverage.omitted.excludedCurrency.items.map((item) => item.currency)),
  ].sort();

  return (
    <div className="mt-4 rounded-2xl border border-stone-200 bg-white/80 px-4 py-4 text-sm text-stone-700">
      <p className="font-semibold text-stone-900">{summary.label ?? PAID_COMMITMENT_LABEL}</p>
      <p className="mt-1 text-stone-500">
        Not actual payments and not a complete budget. Confirmed coverage needs a confirmed
        amount and confirmed cadence on a settled holding. Unknown is not zero.
      </p>
      <dl className="mt-3 grid gap-2 sm:grid-cols-3">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
            Confirmed
          </dt>
          <dd className="mt-1">
            <CoverageLink coverage="confirmed">
              {formatMonthlyEquivalent(coverage.confirmed.monthlyEquivalentMinor)}
            </CoverageLink>
            <span className="text-stone-500"> · {coverage.confirmed.count}</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
            Unconfirmed
          </dt>
          <dd className="mt-1">
            <CoverageLink coverage="unconfirmed">
              {formatMonthlyEquivalent(coverage.unconfirmed.monthlyEquivalentMinor)}
            </CoverageLink>
            <span className="text-stone-500"> · {coverage.unconfirmed.count}</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
            After trial
          </dt>
          <dd className="mt-1">
            <CoverageLink coverage="afterTrial">
              {formatMonthlyEquivalent(coverage.afterTrial.monthlyEquivalentMinor)}
            </CoverageLink>
            <span className="text-stone-500"> · not in the current paid total</span>
            {coverage.afterTrial.unknownPrice.count > 0 ? (
              <span className="mt-1 block text-xs text-stone-500">
                {coverage.afterTrial.unknownPrice.count} with unknown paid-plan price
              </span>
            ) : null}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-stone-500">
        {omittedCount === 0 ? (
          "No paid holdings omitted for missing price, cadence, or currency."
        ) : (
          <>
            Omitted from the paid total (not treated as £0.00; no currency conversion):{" "}
            <CoverageLink coverage="omitted">
              {coverage.omitted.missingPriceOrCadence.count} missing price or cadence
              {coverage.omitted.excludedCurrency.count > 0
                ? `, ${coverage.omitted.excludedCurrency.count} in ${excludedCurrencies.join(", ")}`
                : ""}
            </CoverageLink>
            .
          </>
        )}
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-stone-200 bg-white/80 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">{label}</p>
      <p className="mt-2 truncate text-2xl font-semibold tracking-tight text-stone-950">{value}</p>
      {detail ? <p className="mt-1 truncate text-xs text-stone-500">{detail}</p> : null}
    </div>
  );
}

export function LedgerBrowser() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = useMemo(() => parseLedgerView(searchParams), [searchParams]);
  const pageSearch = ledgerApiSearch(view);
  const pageSearchRef = useRef(pageSearch);

  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryAttempt, setSummaryAttempt] = useState(0);
  const [search, setSearch] = useState(view.q);
  const [items, setItems] = useState<SubscriptionListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [listAttempt, setListAttempt] = useState(0);

  const updateView = useCallback(
    (patch: Partial<LedgerView>) => {
      const next = ledgerViewToSearch({ ...view, ...patch });

      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    },
    [pathname, router, view],
  );

  useEffect(() => {
    if (search.trim() === view.q) {
      return;
    }

    const timeout = window.setTimeout(() => updateView({ q: search.trim() }), 300);

    return () => window.clearTimeout(timeout);
  }, [search, updateView, view.q]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadSummary() {
      setSummaryError(null);

      try {
        const response = await fetch("/api/subscriptions/summary", {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(errorMessage(response, "summary"));
        }

        setSummary((await response.json()) as Summary);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setSummaryError(error instanceof Error ? error.message : "We couldn't load the summary.");
      }
    }

    void loadSummary();

    return () => controller.abort();
  }, [summaryAttempt]);

  useEffect(() => {
    const controller = new AbortController();

    pageSearchRef.current = pageSearch;

    async function loadFirstPage() {
      setLoading(true);
      setListError(null);

      try {
        const page = await fetchPage(pageSearch, controller.signal);

        setItems(page.items);
        setNextCursor(page.nextCursor);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setListError(
          error instanceof Error ? error.message : "We couldn't load your subscriptions.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadFirstPage();

    return () => controller.abort();
  }, [listAttempt, pageSearch]);

  const loadMore = useCallback(async () => {
    if (!nextCursor) {
      return;
    }

    const requested = pageSearchRef.current;

    setLoadingMore(true);
    setListError(null);

    try {
      const page = await fetchPage(
        ledgerApiSearch(view, nextCursor),
        new AbortController().signal,
      );

      if (pageSearchRef.current !== requested) {
        return;
      }

      setItems((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (error) {
      setListError(error instanceof Error ? error.message : "We couldn't load more subscriptions.");
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, view]);

  const hasFilters = Boolean(
    view.q || view.filter !== DEFAULT_LEDGER_VIEW.filter || view.coverage,
  );
  const countMessage = loading
    ? "Loading subscriptions…"
    : `${items.length}${nextCursor ? "+" : ""} subscription${
        items.length === 1 && !nextCursor ? "" : "s"
      } found`;

  return (
    <section className="mx-auto mt-10 w-full max-w-5xl">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Active" value={summary ? String(summary.activeCount) : "—"} />
        <Stat label="Trial" value={summary ? String(summary.trialCount) : "—"} />
        <Stat
          label="Paid commitment"
          value={summary ? formatMonthlyEquivalent(summary.monthlyEquivalentMinor) : "—"}
          detail="Recorded GBP /mo"
        />
        <Stat
          label="Next renewal"
          value={summary?.nextRenewal ? summary.nextRenewal.provider : "None scheduled"}
          detail={
            summary?.nextRenewal
              ? `${formatDate(summary.nextRenewal.on)}${
                  summary.nextRenewal.basis === "expected" ? " · expected" : ""
                }`
              : undefined
          }
        />
      </div>

      {summary && !summaryError ? <CoveragePanel summary={summary} /> : null}

      {summaryError ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p>{summaryError}</p>
          <button
            className="rounded-lg border border-red-300 bg-white px-3 py-1.5 font-semibold hover:border-red-500"
            onClick={() => setSummaryAttempt((attempt) => attempt + 1)}
            type="button"
          >
            Retry
          </button>
        </div>
      ) : null}

      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <label className="flex min-w-0 flex-1 flex-col gap-2 text-sm font-semibold text-stone-800">
          Search subscriptions
          <input
            className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 font-normal outline-none transition placeholder:text-stone-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search provider or plan"
            type="search"
            value={search}
          />
        </label>
        <div aria-label="Filter by status" className="flex flex-wrap gap-2" role="group">
          {LEDGER_FILTERS.map((filter) => (
            <button
              aria-pressed={view.filter === filter.value}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                view.filter === filter.value
                  ? "border-emerald-900 bg-emerald-950 text-white"
                  : "border-stone-300 bg-white text-stone-700 hover:border-stone-500"
              }`}
              key={filter.value}
              onClick={() => updateView({ filter: filter.value })}
              type="button"
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {view.coverage ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
          <p>
            Showing {LEDGER_COVERAGE_LABELS[view.coverage].toLowerCase()}.
          </p>
          <button
            className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 font-semibold hover:border-emerald-600"
            onClick={() => updateView({ coverage: null, filter: DEFAULT_LEDGER_VIEW.filter })}
            type="button"
          >
            Clear coverage filter
          </button>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-2 text-sm font-semibold text-stone-800">
          Sort by
          <select
            className="rounded-xl border border-stone-300 bg-white px-3 py-2 font-normal outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
            onChange={(event) => updateView({ sort: event.target.value as SortKey })}
            value={view.sort}
          >
            {LEDGER_SORTS.map((sort) => (
              <option key={sort.value} value={sort.value}>
                {sort.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2 text-sm font-semibold text-stone-800">
          Direction
          <select
            className="rounded-xl border border-stone-300 bg-white px-3 py-2 font-normal outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
            onChange={(event) =>
              updateView({ order: event.target.value === "desc" ? "desc" : "asc" })
            }
            value={view.order}
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </label>
        <p className="pb-2 text-xs text-stone-500">
          Unknown renewals and missing amounts sort last.
        </p>
      </div>

      <div
        aria-busy={loading}
        aria-label="Subscription results"
        className="mt-6"
        role="region"
      >
        <p aria-live="polite" className="sr-only">
          {countMessage}
        </p>

        {loading ? (
          <div className="rounded-3xl border border-stone-200 bg-white/70 px-6 py-14 text-center text-sm text-stone-600">
            Loading…
          </div>
        ) : listError && items.length === 0 ? (
          <div className="rounded-3xl border border-red-200 bg-red-50 px-6 py-10 text-center">
            <p className="text-sm text-red-800">{listError}</p>
            <button
              className="mt-4 rounded-xl bg-emerald-950 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
              onClick={() => setListAttempt((attempt) => attempt + 1)}
              type="button"
            >
              Retry
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-stone-300 bg-white/60 px-6 py-14 text-center">
            <p className="text-lg font-medium text-stone-800">
              {hasFilters ? "No subscriptions match those filters." : "No subscriptions yet."}
            </p>
            <p className="mt-2 text-sm text-stone-500">
              {hasFilters
                ? "Try a different search or status."
                : "Your subscription inventory will appear here."}
            </p>
          </div>
        ) : (
          <>
            <SubscriptionsTable items={items} />

            {listError ? (
              <p className="mt-4 text-sm text-red-800">{listError}</p>
            ) : null}

            {nextCursor ? (
              <div className="mt-6 flex flex-col items-center gap-2">
                <button
                  className="rounded-xl bg-emerald-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-60"
                  disabled={loadingMore}
                  onClick={() => void loadMore()}
                  type="button"
                >
                  {loadingMore ? "Loading…" : "Load more"}
                </button>
                <p className="text-xs text-stone-500">Showing {items.length} so far</p>
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
