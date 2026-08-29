"use client";

import { useEffect, useState } from "react";

import { formatDate, formatMonthlyEquivalent } from "@/lib/subscriptions/format";
import type { SubscriptionListItem } from "@/lib/subscriptions/projection";

import { SubscriptionsTable } from "./subscriptions-table";

type Summary = {
  activeCount: number;
  trialCount: number;
  needsAttentionCount: number;
  monthlyEquivalentMinor: number;
  nextRenewal: { provider: string; on: string } | null;
};

type StatusFilter = "active" | "cancelled" | undefined;

const STATUS_FILTERS = [
  { label: "All", value: undefined },
  { label: "Active", value: "active" },
  { label: "Cancelled", value: "cancelled" },
] as const satisfies { label: string; value: StatusFilter }[];

function errorMessage(response: Response, resource: string) {
  if (response.status === 401) {
    return `Your session has expired. Sign in again to view your ${resource}.`;
  }

  return `We couldn't load your ${resource}. Please try again.`;
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
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryAttempt, setSummaryAttempt] = useState(0);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>(undefined);
  const [items, setItems] = useState<SubscriptionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [listAttempt, setListAttempt] = useState(0);

  useEffect(() => {
    const timeout = window.setTimeout(() => setQuery(search.trim()), 300);

    return () => window.clearTimeout(timeout);
  }, [search]);

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
    const params = new URLSearchParams();

    if (query) {
      params.set("q", query);
    }

    if (status) {
      params.set("status", status);
    }

    async function loadSubscriptions() {
      setLoading(true);
      setListError(null);

      try {
        const suffix = params.toString();
        const response = await fetch(`/api/subscriptions${suffix ? `?${suffix}` : ""}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(errorMessage(response, "subscriptions"));
        }

        const payload = (await response.json()) as { items?: SubscriptionListItem[] };

        if (!Array.isArray(payload.items)) {
          throw new Error("We couldn't load your subscriptions. Please try again.");
        }

        setItems(payload.items);
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

    void loadSubscriptions();

    return () => controller.abort();
  }, [listAttempt, query, status]);

  const hasFilters = Boolean(query || status);
  const countMessage = loading
    ? "Loading subscriptions…"
    : `${items.length} subscription${items.length === 1 ? "" : "s"} found`;

  return (
    <section className="mx-auto mt-10 w-full max-w-5xl">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Active" value={summary ? String(summary.activeCount) : "—"} />
        <Stat label="Trial" value={summary ? String(summary.trialCount) : "—"} />
        <Stat
          label="Needs attention"
          value={summary ? String(summary.needsAttentionCount) : "—"}
        />
        <Stat
          label="Monthly equivalent"
          value={summary ? formatMonthlyEquivalent(summary.monthlyEquivalentMinor) : "—"}
        />
        <Stat
          label="Next renewal"
          value={summary?.nextRenewal ? summary.nextRenewal.provider : "None scheduled"}
          detail={summary?.nextRenewal ? formatDate(summary.nextRenewal.on) : undefined}
        />
      </div>

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
          {STATUS_FILTERS.map((filter) => (
            <button
              aria-pressed={status === filter.value}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                status === filter.value
                  ? "border-emerald-900 bg-emerald-950 text-white"
                  : "border-stone-300 bg-white text-stone-700 hover:border-stone-500"
              }`}
              key={filter.label}
              onClick={() => setStatus(filter.value)}
              type="button"
            >
              {filter.label}
            </button>
          ))}
        </div>
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
        ) : listError ? (
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
          <SubscriptionsTable items={items} />
        )}
      </div>
    </section>
  );
}
