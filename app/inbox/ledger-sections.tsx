"use client";

import { useEffect, useState } from "react";

import { InboxSubscriptionRow } from "@/components/inbox/subscription-row";
import type { InboxSections } from "@/lib/inbox/query";
import type { SubscriptionListItem } from "@/lib/subscriptions/projection";

const EMPTY: InboxSections = { overdue: [], unfinished: [], renewingSoon: [] };

function Section({
  title,
  blurb,
  dateLabel,
  items,
}: {
  title: string;
  blurb: string;
  dateLabel: string;
  items: SubscriptionListItem[];
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
            <InboxSubscriptionRow dateLabel={dateLabel} item={item} />
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
export function LedgerSections() {
  const [sections, setSections] = useState<InboxSections>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);

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
  }, [attempt]);

  if (loading) {
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
      <Section
        blurb="The stored due date has passed. Nothing has moved it — say what happened on the subscription."
        dateLabel="Was due"
        items={sections.overdue}
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
