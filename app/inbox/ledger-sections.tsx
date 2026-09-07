"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

import { OverdueActions } from "@/components/inbox/overdue-actions";
import { InboxSubscriptionRow } from "@/components/inbox/subscription-row";
import type { OverdueAction } from "@/lib/inbox/overdue";
import type { InboxSections } from "@/lib/inbox/query";
import { formatDate } from "@/lib/subscriptions/format";
import type { SubscriptionListItem } from "@/lib/subscriptions/projection";

const EMPTY: InboxSections = { overdue: [], unfinished: [], renewingSoon: [] };

type Outcome =
  | { action: "still_holding"; provider: string; from: string; to: string }
  | { action: "cancelled"; provider: string; endsOn: string };

const ENDPOINT: Record<OverdueAction, string> = {
  still_holding: "still-holding",
  cancelled: "cancel",
};

/** What the write did, in the words the user needs to trust it. */
function describe(outcome: Outcome): string {
  if (outcome.action === "still_holding") {
    return `${outcome.provider} is due again ${formatDate(outcome.to)}. That date is inferred from its cadence, not confirmed — open it to set the real one.`;
  }

  return `${outcome.provider} is cancelled, ending ${formatDate(outcome.endsOn)}. It stays in your ledger under Cancelled.`;
}

function Section({
  title,
  blurb,
  dateLabel,
  items,
  renderActions,
}: {
  title: string;
  blurb: string;
  dateLabel: string;
  items: SubscriptionListItem[];
  renderActions?: (item: SubscriptionListItem) => ReactNode;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section aria-label={title} className="mt-8">
      <h2 className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
        {title}
      </h2>
      <p className="mt-1 text-sm text-stone-600">{blurb}</p>
      <ul className="mt-3 flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id}>
            <InboxSubscriptionRow
              actions={renderActions?.(item)}
              dateLabel={dateLabel}
              item={item}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The three ledger sections of Inbox. They are projected on every load rather
 * than stored, so a row leaves a section the moment the ledger says it should
 * — there is no card to dismiss and nothing to keep in step.
 */
export function LedgerSections({
  refreshKey = 0,
}: {
  /** Bumped when a proposal is decided, since that can write a ledger row. */
  refreshKey?: number;
} = {}) {
  const [sections, setSections] = useState<InboxSections>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [working, setWorking] = useState<OverdueAction | null>(null);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/inbox", { signal: controller.signal });

        if (!response.ok) {
          throw new Error(
            response.status === 401
              ? "Your session has expired. Sign in again to view your inbox."
              : "We couldn't load your inbox. Please try again.",
          );
        }

        const payload = (await response.json()) as Partial<InboxSections>;

        setSections({
          overdue: payload.overdue ?? [],
          unfinished: payload.unfinished ?? [],
          renewingSoon: payload.renewingSoon ?? [],
        });
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") {
          return;
        }

        setError(caught instanceof Error ? caught.message : "We couldn't load your inbox.");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => controller.abort();
  }, [attempt, refreshKey]);

  const decide = useCallback(
    async (item: SubscriptionListItem, action: OverdueAction) => {
      setPending(item.id);
      setWorking(action);
      setActionError(null);

      try {
        const response = await fetch(
          `/api/inbox/overdue/${item.id}/${ENDPOINT[action]}`,
          { method: "POST" },
        );
        const payload = (await response.json().catch(() => ({}))) as {
          message?: string;
        } & Partial<Outcome>;

        if (!response.ok) {
          throw new Error(
            payload.message ??
              (response.status === 401
                ? "Your session has expired. Sign in again to act on your inbox."
                : "We couldn't save that. Please try again."),
          );
        }

        setOutcomes((current) => [...current, payload as Outcome]);
      } catch (caught) {
        setActionError(
          caught instanceof Error ? caught.message : "We couldn't save that.",
        );
      } finally {
        setPending(null);
        setWorking(null);
        /**
         * Re-read rather than patching state: the row may have moved into
         * Renewing soon, and the sections are a projection, not a cache.
         */
        setAttempt((value) => value + 1);
      }
    },
    [],
  );

  if (loading && sections.overdue.length === 0) {
    return null;
  }

  if (error) {
    return (
      <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        <p>{error}</p>
        <button
          className="mt-3 rounded-xl bg-emerald-950 px-4 py-2 font-semibold text-white hover:bg-emerald-800"
          onClick={() => setAttempt((value) => value + 1)}
          type="button"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div aria-busy={loading}>
      {outcomes.map((outcome, index) => (
        <div
          className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
          key={`${outcome.provider}-${index}`}
        >
          {describe(outcome)}
        </div>
      ))}

      {actionError ? (
        <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {actionError}
        </div>
      ) : null}

      <Section
        blurb="The stored due date has passed. Nothing has moved it — say whether you still have it, or that it stopped."
        dateLabel="Was due"
        items={sections.overdue}
        renderActions={(item) => (
          <OverdueActions
            busy={pending !== null}
            onDecide={(action) => void decide(item, action)}
            working={pending === item.id ? working : null}
          />
        )}
        title="Overdue"
      />
      <Section
        blurb="Something on these rows is unsettled: an unknown subscription, a term that conflicts, or one you asked to be reminded about."
        dateLabel="Next renewal"
        items={sections.unfinished}
        title="Unfinished"
      />
      <Section
        blurb="A glance at what is coming: yearly within a month, monthly within a week."
        dateLabel="Renews"
        items={sections.renewingSoon}
        title="Renewing soon"
      />
    </div>
  );
}
