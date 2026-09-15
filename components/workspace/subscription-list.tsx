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
import { emptyListCopy } from "@/lib/workspace/list-copy";
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

import { Button, Feedback } from "@/components/ui/foundations";

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
  const empty = emptyListCopy(state.filter, ledgerView.q);
  const showLoading = loading && visible.length === 0 && !error;

  return (
    <section aria-busy={loading} aria-label="Subscriptions" className="mt-4" id="subscriptions">
      <p
        aria-live="polite"
        className={
          showLoading
            ? "ui-feedback ui-feedback--info mt-4"
            : "sr-only"
        }
        role="status"
      >
        {busyLabel}
      </p>

      <nav aria-label="Show" className="workspace-filters">
        {WORKSPACE_FILTERS.map((filter) => {
          const active = filter.value === state.filter;
          const count = counts[filter.value];

          return (
            <button
              aria-pressed={active}
              className="workspace-filter"
              key={filter.value}
              onClick={() => onFilter(filter.value)}
              type="button"
            >
              {filter.label}
              <span className="workspace-filter-count">
                {count} {count === 1 ? "row" : "rows"}
              </span>
            </button>
          );
        })}
      </nav>
      <p className="workspace-note">Counts are rows, not proposals.</p>

      <div className="workspace-toolbar">
        <label className="workspace-search flex min-w-0 flex-col gap-1 text-sm font-semibold text-ui-ink">
          Search subscriptions
          <input
            className="ui-input"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search provider, plan or account"
            type="search"
            value={search}
          />
        </label>
        <div aria-label="Filter by status" className="workspace-status" role="group">
          {LEDGER_FILTERS.map((filter) => (
            <button
              aria-pressed={ledgerView.filter === filter.value}
              className="workspace-filter"
              key={filter.value}
              onClick={() => onLedgerView({ filter: filter.value })}
              type="button"
            >
              {filter.label}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1 text-sm font-semibold text-ui-ink">
          Sort by
          <select
            className="ui-input"
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
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-[var(--ui-radius-md)] border border-ui-line bg-ui-green-pale px-4 py-3 text-sm text-ui-ink">
          <p>Showing {LEDGER_COVERAGE_LABELS[ledgerView.coverage].toLowerCase()}.</p>
          <Button
            onClick={() =>
              onLedgerView({ coverage: null, filter: DEFAULT_LEDGER_VIEW.filter })
            }
            size="small"
          >
            Clear coverage filter
          </Button>
        </div>
      ) : null}

      {error ? (
        <div className="mt-4">
          <Feedback tone="error">{error}</Feedback>
          <Button className="mt-3" onClick={() => setAttempt((value) => value + 1)} variant="primary">
            Retry
          </Button>
        </div>
      ) : null}

      {missing ? (
        <div className="mt-4">
          <Feedback tone="info">{missing}</Feedback>
        </div>
      ) : null}

      {!loading && !error && visible.length === 0 ? (
        <div className="mt-4 rounded-[var(--ui-radius-md)] border border-dashed border-ui-line bg-ui-surface px-6 py-12 text-center">
          <p className="text-base font-medium text-ui-ink">{empty.title}</p>
          <p className="mt-2 text-sm text-ui-muted">{empty.body}</p>
        </div>
      ) : null}

      {visible.length > 0 ? (
        <div className="workspace-list">
          <div aria-hidden="true" className="workspace-columns">
            <span>Subscription</span>
            <span>Price</span>
            <span>Date</span>
          </div>
          <ul className="workspace-list-items">
            {visible.map((entry) => {
              const isOpen = entry.key === open?.key;

              return (
                <li
                  className={isOpen ? "workspace-record workspace-record--open" : "workspace-record"}
                  key={entry.key}
                >
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
        </div>
      ) : null}

      {nextCursor && state.filter === "all" ? (
        <div className="mt-4 flex justify-center">
          <Button disabled={loadingMore} onClick={() => void loadMore()}>
            {loadingMore ? "Loading…" : "Show more"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
