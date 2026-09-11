"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { RecordHistory } from "@/components/subscriptions/record-history";
import { RecordTerms } from "@/components/subscriptions/record-terms";
import type { SubscriptionDetail } from "@/lib/subscriptions/projection";

/**
 * The selected record, beside the conversation on a wide screen and alone on a
 * narrow one. It is a client read so selecting a row does not cost a page
 * navigation: the conversation, the composer draft and the inventory scroll
 * position all stay where they were.
 */
export function RecordPanel({
  recordId,
  refreshKey = 0,
  conversationHref,
  editHref,
  closeHref,
  onDiscuss,
  discussing = false,
  onSaved,
}: {
  recordId: string;
  /** Bumped by an accept elsewhere, which can change this record's values. */
  refreshKey?: number;
  /** Back to the conversation on a narrow screen, keeping this record selected. */
  conversationHref: string;
  editHref: string;
  closeHref: string;
  onDiscuss?: (detail: SubscriptionDetail) => void;
  discussing?: boolean;
  onSaved?: (detail: SubscriptionDetail) => void;
}) {
  const [detail, setDetail] = useState<SubscriptionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/subscriptions/${recordId}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(
            response.status === 401
              ? "Your session has expired. Sign in again to open this record."
              : response.status === 404
                ? "That record is not in your ledger."
                : "We couldn't load that record. Please try again.",
          );
        }

        setDetail((await response.json()) as SubscriptionDetail);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") {
          return;
        }

        setDetail(null);
        setError(
          caught instanceof Error ? caught.message : "We couldn't load that record.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => controller.abort();
  }, [recordId, refreshKey]);

  /**
   * Opening a record moves the reader's place, so move the keyboard's too —
   * from the row that was clicked to the record it opened.
   */
  useEffect(() => {
    if (detail) {
      heading.current?.focus();
    }
  }, [detail]);

  return (
    <section aria-label="Selected record" className="min-w-0">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          className="text-sm font-semibold text-emerald-900 underline decoration-emerald-300 underline-offset-4 hover:text-emerald-700 lg:hidden"
          href={conversationHref}
          scroll={false}
        >
          ← Back to the conversation
        </Link>
        <Link
          className="ml-auto text-sm font-semibold text-stone-600 underline decoration-stone-300 underline-offset-4 hover:text-stone-900"
          href={closeHref}
          scroll={false}
        >
          Close record
        </Link>
      </div>

      {error ? (
        <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {loading && !detail ? (
        <p className="mt-4 text-sm text-stone-500">Loading record…</p>
      ) : null}

      {detail ? (
        <>
          <header className="mt-4">
            <h2
              className="text-2xl font-semibold tracking-tight text-stone-950 focus:outline-none"
              ref={heading}
              tabIndex={-1}
            >
              {detail.provider.value}
            </h2>
            <p className="mt-1 text-stone-600">
              {detail.plan.value ?? "Plan not specified"}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                className={
                  discussing
                    ? "inline-flex rounded-xl border border-emerald-700 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-900"
                    : "inline-flex rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 transition hover:border-emerald-700"
                }
                onClick={() => onDiscuss?.(detail)}
                type="button"
              >
                {discussing ? "Talking about this" : "Talk about this"}
              </button>
              <Link
                className="inline-flex rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 transition hover:border-stone-500"
                href={editHref}
              >
                Edit everything
              </Link>
            </div>
          </header>

          <div className="mt-6">
            <RecordTerms
              initial={detail}
              key={detail.id}
              onSaved={(next) => {
                setDetail(next);
                onSaved?.(next);
              }}
            />
            <RecordHistory detail={detail} />
          </div>
        </>
      ) : null}
    </section>
  );
}
