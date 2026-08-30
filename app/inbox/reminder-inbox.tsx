"use client";

import { useCallback, useEffect, useState } from "react";

import { ReminderScanTrigger } from "@/components/jobs/reminder-scan-trigger";
import { ReminderCard } from "@/components/reminders/reminder-card";
import type { ReminderView } from "@/lib/reminders/projection";

/**
 * The reminders half of the inbox. Reminders sit above proposals because they
 * are not decisions: they are the inbox saying a date is coming or a question is
 * still open, and the only action on one is to dismiss it.
 */
export function ReminderInbox({ showScan = false }: { showScan?: boolean }) {
  const [items, setItems] = useState<ReminderView[]>([]);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [dismissError, setDismissError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setListError(null);

      try {
        const response = await fetch("/api/reminders?state=pending", {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(
            response.status === 401
              ? "Your session has expired. Sign in again to view your reminders."
              : "We couldn't load your reminders. Please try again.",
          );
        }

        const payload = (await response.json()) as { items?: ReminderView[] };

        setItems(payload.items ?? []);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setListError(
          error instanceof Error ? error.message : "We couldn't load your reminders.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => controller.abort();
  }, [attempt]);

  const onDismiss = useCallback(async (reminder: ReminderView) => {
    setPending(reminder.id);
    setDismissError(null);

    try {
      const response = await fetch(`/api/reminders/${reminder.id}/dismiss`, {
        method: "POST",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };

        throw new Error(
          payload.error === "not_pending"
            ? "That reminder was already dismissed."
            : response.status === 401
              ? "Your session has expired. Sign in again to dismiss reminders."
              : "We couldn't dismiss that reminder. Please try again.",
        );
      }

      setItems((current) => current.filter((item) => item.id !== reminder.id));
    } catch (error) {
      setDismissError(
        error instanceof Error ? error.message : "We couldn't dismiss that reminder.",
      );
      setAttempt((value) => value + 1);
    } finally {
      setPending(null);
    }
  }, []);

  return (
    <section className="mx-auto mt-10 w-full max-w-5xl">
      {showScan ? (
        <div className="mb-4">
          <ReminderScanTrigger onScanned={() => setAttempt((value) => value + 1)} />
        </div>
      ) : null}

      {dismissError ? (
        <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {dismissError}
        </div>
      ) : null}

      <div aria-busy={loading} aria-label="Reminders" role="region">
        {listError ? (
          <div className="rounded-3xl border border-red-200 bg-red-50 px-6 py-6 text-center">
            <p className="text-sm text-red-800">{listError}</p>
            <button
              className="mt-4 rounded-xl bg-emerald-950 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
              onClick={() => setAttempt((value) => value + 1)}
              type="button"
            >
              Retry
            </button>
          </div>
        ) : items.length > 0 ? (
          <>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
              Reminders
            </h2>
            <ul className="flex flex-col gap-4">
              {items.map((reminder) => (
                <li key={reminder.id}>
                  <ReminderCard
                    busy={pending !== null}
                    onDismiss={(item) => void onDismiss(item)}
                    reminder={reminder}
                    working={pending === reminder.id}
                  />
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </section>
  );
}
