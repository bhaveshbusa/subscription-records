"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { Outcome } from "@/components/proposals/use-proposal-decision";
import type { ConversationTurn } from "@/lib/capture/conversation";
import type { ChatCaptureResult } from "@/lib/capture/record";
import type { TargetDescriptor } from "@/lib/capture/target-fields";
import type { InboxSections } from "@/lib/inbox/query";
import type { ProposalView } from "@/lib/proposals/projection";
import { msUntilNextUtcCalendarDay } from "@/lib/subscriptions/dates";
import {
  DEFAULT_LEDGER_VIEW,
  LEDGER_COVERAGE_LABELS,
  LEDGER_FILTERS,
  LEDGER_SORTS,
  ledgerApiSearch,
  type LedgerView,
  type SortKey,
} from "@/lib/subscriptions/ledger-view";
import type { SubscriptionListItem } from "@/lib/subscriptions/projection";
import {
  buildSubscriptionEntries,
  filterCounts,
  findEntry,
  matchesFilter,
  openEntry,
  visibleEntries,
  type OpenEntry,
  type SubscriptionEntry,
} from "@/lib/workspace/subscription-list";
import {
  WORKSPACE_FILTERS,
  type WorkspaceFilter,
  type WorkspaceState,
} from "@/lib/workspace/view";

import { belongsTo, defaultTarget, OpenSubscription } from "./open-subscription";
import { SubscriptionRow } from "./subscription-row";

const EMPTY_SECTIONS: InboxSections = {
  overdue: [],
  unfinished: [],
  reminders: [],
  questions: [],
};

type Page = { items: SubscriptionListItem[]; nextCursor: string | null };

function errorMessage(response: Response): string {
  return response.status === 401
    ? "Your session has expired. Sign in again to view your subscriptions."
    : "We couldn't load your subscriptions. Please try again.";
}

async function readJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new Error(errorMessage(response));
  }

  return (await response.json()) as T;
}

const EMPTY_COPY: Record<WorkspaceFilter, { title: string; body: string }> = {
  all: {
    title: "No subscriptions yet.",
    body: "Capture one above — a line of text, a pasted list, a screenshot or a voice note — and it appears here for review.",
  },
  reviews: {
    title: "Nothing to review.",
    body: "New captures and proposed changes to what you hold wait here until you accept or reject them.",
  },
  questions: {
    title: "No open questions.",
    body: "When a capture needs something settled, the question sits here until you answer it or put it off.",
  },
  reminders: {
    title: "No reminders due.",
    body: "A reminder shows from its reminder date until the renewal or trial end it is for.",
  },
};

/**
 * The workspace's one list: every saved subscription, with the drafts still
 * waiting to be added, and on each the reviews, questions and reminders that
 * are about it. The four filters are lenses over that one list, not places —
 * a row can be under several at once, and the counts say how many rows each
 * would show.
 *
 * The list reads three projections that each already exist — the ledger page,
 * the pending cards, and the inbox sections — and joins them by stable holding
 * id on the client. It never merges by provider name: two drafts for the same
 * service stay two rows until the identity rule says otherwise.
 */
export function SubscriptionList({
  state,
  ledgerView,
  target,
  conversation,
  conversationLoading,
  refreshKey,
  href,
  onNavigate,
  onLedgerView,
  onCaptured,
  onSelectTarget,
  onWritten,
}: {
  state: WorkspaceState;
  ledgerView: LedgerView;
  target: TargetDescriptor;
  conversation: ConversationTurn[];
  conversationLoading: boolean;
  /** Bumped by any write anywhere in the workspace, so the list re-reads. */
  refreshKey: number;
  /** The workspace URL with the open row changed and everything else kept. */
  href: (patch: Partial<WorkspaceState>) => string;
  /** Change the filter or the open row, keeping everything else in the URL. */
  onNavigate: (patch: Partial<WorkspaceState>, target?: TargetDescriptor) => void;
  onLedgerView: (patch: Partial<LedgerView>) => void;
  onCaptured: (result: ChatCaptureResult) => boolean | void;
  onSelectTarget: (target: TargetDescriptor) => void;
  onWritten: () => void;
}) {
  const [items, setItems] = useState<SubscriptionListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [proposals, setProposals] = useState<ProposalView[]>([]);
  const [sections, setSections] = useState<InboxSections>(EMPTY_SECTIONS);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState(ledgerView.q);
  const [carried, setCarried] = useState<{ key: string; outcome: Outcome } | null>(null);
  /** The open record when the current page, search or status chip does not include it. */
  const [pinned, setPinned] = useState<SubscriptionListItem | null>(null);
  const [missing, setMissing] = useState<string | null>(null);

  const pageSearch = ledgerApiSearch(ledgerView);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [page, cards, inbox] = await Promise.all([
          readJson<Partial<Page>>(`/api/subscriptions?${pageSearch}`, controller.signal),
          readJson<{ items?: ProposalView[] }>("/api/proposals?state=pending", controller.signal),
          readJson<Partial<InboxSections>>("/api/inbox", controller.signal),
        ]);

        setItems(Array.isArray(page.items) ? page.items : []);
        setNextCursor(page.nextCursor ?? null);
        setProposals(Array.isArray(cards.items) ? cards.items : []);
        setSections({
          overdue: inbox.overdue ?? [],
          unfinished: inbox.unfinished ?? [],
          reminders: inbox.reminders ?? [],
          questions: inbox.questions ?? [],
        });
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") {
          return;
        }

        setError(
          caught instanceof Error ? caught.message : "We couldn't load your subscriptions.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => controller.abort();
  }, [pageSearch, attempt, refreshKey]);

  /** Reminders and overdue work are dated, so a new day — or coming back — re-reads. */
  useEffect(() => {
    function refresh() {
      setAttempt((value) => value + 1);
    }

    function onVisibility() {
      if (document.visibilityState === "visible") {
        refresh();
      }
    }

    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);

    let timeout = window.setTimeout(function tick() {
      refresh();
      timeout = window.setTimeout(tick, msUntilNextUtcCalendarDay());
    }, msUntilNextUtcCalendarDay());

    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (search.trim() === ledgerView.q) {
      return;
    }

    const timeout = window.setTimeout(() => onLedgerView({ q: search.trim() }), 300);

    return () => window.clearTimeout(timeout);
  }, [search, onLedgerView, ledgerView.q]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) {
      return;
    }

    setLoadingMore(true);

    try {
      const page = await readJson<Partial<Page>>(
        `/api/subscriptions?${ledgerApiSearch(ledgerView, nextCursor)}`,
        new AbortController().signal,
      );

      setItems((current) => [...current, ...(page.items ?? [])]);
      setNextCursor(page.nextCursor ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn't load more.");
    } finally {
      setLoadingMore(false);
    }
  }, [ledgerView, nextCursor, loadingMore]);

  const onPage = state.recordId !== null && items.some((item) => item.id === state.recordId);

  /**
   * A record link, or a row opened before the search changed, names a holding
   * the page may not hold. It is read on its own so the link still lands on it
   * — the server decides whether it is this person's to see.
   */
  useEffect(() => {
    setMissing(null);

    if (loading || !state.recordId || onPage) {
      setPinned(null);

      return;
    }

    const controller = new AbortController();
    const recordId = state.recordId;

    fetch(`/api/subscriptions/${recordId}`, { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 404) {
          setMissing("That record is not in your ledger.");
          setPinned(null);

          return;
        }

        if (!response.ok) {
          throw new Error(errorMessage(response));
        }

        setPinned((await response.json()) as SubscriptionListItem);
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") {
          return;
        }

        setMissing(caught instanceof Error ? caught.message : "We couldn't open that record.");
      });

    return () => controller.abort();
  }, [loading, state.recordId, onPage, refreshKey]);

  const entries = useMemo(
    () =>
      buildSubscriptionEntries({
        items: pinned && pinned.id === state.recordId ? [...items, pinned] : items,
        proposals,
        sections,
      }),
    [items, pinned, state.recordId, proposals, sections],
  );
  const counts = useMemo(() => filterCounts(entries), [entries]);
  const open = useMemo(
    () => findEntry(entries, { recordId: state.recordId, draftId: state.draftId }),
    [entries, state.recordId, state.draftId],
  );
  const visible = useMemo(
    () => visibleEntries(entries, state.filter, open?.key ?? null),
    [entries, state.filter, open],
  );

  /**
   * The composer inside an open row is always about that row: if what it was
   * about is gone — a card decided, a question answered — it falls back to the
   * subscription itself rather than to all subscriptions.
   */
  useEffect(() => {
    if (open && !belongsTo(open, target)) {
      onSelectTarget(defaultTarget(open));
    }
  }, [open, target, onSelectTarget]);

  const openHref = useCallback(
    (entry: SubscriptionEntry): OpenEntry =>
      entry.key === open?.key ? { recordId: null, draftId: null } : openEntry(entry),
    [open],
  );

  const onFilter = useCallback(
    (filter: WorkspaceFilter) => {
      /** A filter change is a new question; a row that has no answer to it closes. */
      const keep = open && matchesFilter(open, filter);

      onNavigate(
        keep ? { filter } : { filter, recordId: null, draftId: null },
        keep ? undefined : { kind: "all" },
      );
    },
    [onNavigate, open],
  );

  const onDecided = useCallback(
    (proposal: ProposalView, outcome: Outcome | null) => {
      onWritten();

      if (!open) {
        return;
      }

      /**
       * Accepting a draft creates the holding; the row it becomes opens in its
       * place, carrying the outcome so the person sees what just happened.
       */
      if (open.kind === "draft" && open.draft?.id === proposal.id) {
        if (outcome?.decision === "accept" && outcome.subscriptionId) {
          setCarried({ key: outcome.subscriptionId, outcome });
          onNavigate(
            { recordId: outcome.subscriptionId, draftId: null },
            { kind: "subscription", id: outcome.subscriptionId, provider: outcome.provider },
          );
        } else {
          onNavigate({ recordId: null, draftId: null }, { kind: "all" });
        }
      }
    },
    [onNavigate, onWritten, open],
  );

  const busyLabel = loading
    ? "Loading subscriptions…"
    : `${visible.length} ${visible.length === 1 ? "subscription" : "subscriptions"} shown`;

  return (
    <section aria-busy={loading} aria-label="Subscriptions" className="mt-6">
      <p aria-live="polite" className="sr-only">
        {busyLabel}
      </p>

      <nav aria-label="Show" className="flex flex-wrap gap-2">
        {WORKSPACE_FILTERS.map((filter) => {
          const active = filter.value === state.filter;
          const count = counts[filter.value];

          return (
            <button
              aria-pressed={active}
              className={
                active
                  ? "rounded-full border border-emerald-900 bg-emerald-950 px-4 py-2 text-sm font-semibold text-white"
                  : "rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-500"
              }
              key={filter.value}
              onClick={() => onFilter(filter.value)}
              type="button"
            >
              {filter.label}
              <span
                className={
                  active ? "ml-2 text-emerald-200" : "ml-2 text-stone-500"
                }
              >
                {count}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <label className="flex min-w-0 flex-1 flex-col gap-2 text-sm font-semibold text-stone-800">
          Search subscriptions
          <input
            className="w-full rounded-xl border border-stone-300 bg-white px-4 py-2.5 font-normal outline-none transition placeholder:text-stone-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search provider or plan"
            type="search"
            value={search}
          />
        </label>
        <div aria-label="Filter by status" className="flex flex-wrap gap-2" role="group">
          {LEDGER_FILTERS.map((filter) => (
            <button
              aria-pressed={ledgerView.filter === filter.value}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                ledgerView.filter === filter.value
                  ? "border-stone-800 bg-stone-800 text-white"
                  : "border-stone-300 bg-white text-stone-700 hover:border-stone-500"
              }`}
              key={filter.value}
              onClick={() => onLedgerView({ filter: filter.value })}
              type="button"
            >
              {filter.label}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-2 text-sm font-semibold text-stone-800">
          Sort by
          <select
            className="rounded-xl border border-stone-300 bg-white px-3 py-2 font-normal outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
            onChange={(event) => onLedgerView({ sort: event.target.value as SortKey })}
            value={ledgerView.sort}
          >
            {LEDGER_SORTS.map((sort) => (
              <option key={sort.value} value={sort.value}>
                {sort.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {ledgerView.coverage ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
          <p>Showing {LEDGER_COVERAGE_LABELS[ledgerView.coverage].toLowerCase()}.</p>
          <button
            className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 font-semibold hover:border-emerald-600"
            onClick={() =>
              onLedgerView({ coverage: null, filter: DEFAULT_LEDGER_VIEW.filter })
            }
            type="button"
          >
            Clear coverage filter
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p>{error}</p>
          <button
            className="mt-3 rounded-xl bg-emerald-950 px-4 py-2 font-semibold text-white hover:bg-emerald-800"
            onClick={() => setAttempt((value) => value + 1)}
            type="button"
          >
            Retry
          </button>
        </div>
      ) : null}

      {missing ? (
        <p
          className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          role="status"
        >
          {missing}
        </p>
      ) : null}

      {!loading && !error && visible.length === 0 ? (
        <div className="mt-4 rounded-3xl border border-dashed border-stone-300 bg-white/60 px-6 py-12 text-center">
          <p className="text-lg font-medium text-stone-800">{EMPTY_COPY[state.filter].title}</p>
          <p className="mt-2 text-sm text-stone-500">{EMPTY_COPY[state.filter].body}</p>
        </div>
      ) : null}

      {visible.length > 0 ? (
        <ul className="mt-4 divide-y divide-stone-200 rounded-3xl border border-stone-200 bg-white/60">
          {visible.map((entry) => {
            const isOpen = entry.key === open?.key;

            return (
              <li className="first:rounded-t-3xl last:rounded-b-3xl" key={entry.key}>
                <SubscriptionRow
                  entry={entry}
                  filter={state.filter}
                  href={href(openHref(entry))}
                  open={isOpen}
                />
                {isOpen ? (
                  <OpenSubscription
                    carriedOutcome={carried?.key === entry.key ? carried.outcome : null}
                    closeHref={href({ recordId: null, draftId: null })}
                    conversation={conversation}
                    conversationLoading={conversationLoading}
                    entry={entry}
                    filter={state.filter}
                    key={entry.key}
                    onCaptured={onCaptured}
                    onDecided={onDecided}
                    onSelectTarget={onSelectTarget}
                    onWritten={onWritten}
                    refreshKey={refreshKey}
                    target={target}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {nextCursor && state.filter === "all" ? (
        <div className="mt-4 flex justify-center">
          <button
            className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 transition hover:border-emerald-700 disabled:opacity-60"
            disabled={loadingMore}
            onClick={() => void loadMore()}
            type="button"
          >
            {loadingMore ? "Loading…" : "Show more"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
