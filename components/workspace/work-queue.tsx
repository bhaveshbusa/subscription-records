"use client";

import { useCallback, useEffect, useState } from "react";

import { InboxQuestionRow } from "@/components/inbox/question-row";
import { InboxReminderRow } from "@/components/inbox/reminder-row";
import {
  OverdueActions,
  type CancelDecision,
} from "@/components/inbox/overdue-actions";
import { InboxSubscriptionRow } from "@/components/inbox/subscription-row";
import type { OverdueAction } from "@/lib/inbox/overdue";
import type { UnresolvedStatus } from "@/lib/inbox/unresolved";
import type { InboxQuestion, InboxSections } from "@/lib/inbox/query";
import {
  nextQuestionId,
  reasonLabel,
  workQueue,
  type WorkGroup,
} from "@/lib/inbox/work-queue";
import { msUntilNextUtcCalendarDay } from "@/lib/subscriptions/dates";
import { formatDate, isTrialHolding, statusLabel } from "@/lib/subscriptions/format";
import type { SubscriptionListItem } from "@/lib/subscriptions/projection";

const EMPTY: InboxSections = { overdue: [], unfinished: [], reminders: [], questions: [] };

type Outcome =
  | { action: "still_holding"; provider: string; from: string; to: string }
  | { action: "cancelled"; provider: string; endsOn: string }
  | { action: "unresolved"; provider: string; notesSaved: boolean }
  | { action: "status_set"; provider: string; status: UnresolvedStatus };

type WorkingAction = OverdueAction | "unresolved" | "status_set";

/** What the write did, in the words the user needs to trust it. */
function describe(outcome: Outcome): string {
  if (outcome.action === "still_holding") {
    return `${outcome.provider} is due again ${formatDate(outcome.to)}. That date is inferred from its cadence, not confirmed — open it to set the real one.`;
  }

  if (outcome.action === "status_set") {
    return `${outcome.provider} is ${statusLabel(outcome.status).toLowerCase()}. Only its status changed — no date was rolled and no amount was confirmed.`;
  }

  if (outcome.action === "unresolved") {
    return outcome.notesSaved
      ? `${outcome.provider} is still unresolved. The note is saved; nothing was cancelled.`
      : `${outcome.provider} is still unresolved. Nothing was cancelled, and no date was invented.`;
  }

  return `${outcome.provider} is cancelled, ending ${formatDate(outcome.endsOn)}. It stays in your ledger under Cancelled.`;
}

/** An overdue card is dated by whatever passed: a trial end, or the stored renewal. */
function overdueDate(item: SubscriptionListItem): { label: string; value: string | null } {
  if (
    isTrialHolding(item.status.value) &&
    item.trialEndsOn.value &&
    (item.nextRenewal.value === null || item.trialEndsOn.value <= (item.nextRenewal.value ?? ""))
  ) {
    return { label: "Trial ended", value: item.trialEndsOn.value };
  }

  return { label: "Was due", value: item.nextRenewal.value };
}

/**
 * Work: everything a capture or a passed date can leave waiting, one card per
 * holding. Questions are stored rows re-read on every load, so they survive a
 * reload; there is no dismiss, only answer or later. Reminders are computed on
 * read and have nothing to act on at all.
 */
export function WorkQueue({
  refreshKey = 0,
  replyToId = null,
  selectedSubscriptionId = null,
  recordHref,
  onAnswerQuestion,
  onDiscussSubscription,
  onQuestionChanged,
  onWorkChanged,
}: {
  /** Bumped when a proposal is decided or a capture lands, since both can change work. */
  refreshKey?: number;
  replyToId?: string | null;
  selectedSubscriptionId?: string | null;
  /** Where a holding's name opens its record in the workspace. */
  recordHref: (item: SubscriptionListItem) => string;
  onAnswerQuestion?: (question: InboxQuestion) => void;
  /** Point the composer at one holding, by id and by the name it goes by. */
  onDiscussSubscription?: (id: string, provider: string) => void;
  onQuestionChanged?: () => void;
  /** A write here can change a record and the inventory, which re-read on it. */
  onWorkChanged?: () => void;
}) {
  const [sections, setSections] = useState<InboxSections>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [working, setWorking] = useState<WorkingAction | null>(null);
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
              ? "Your session has expired. Sign in again to view your work."
              : "We couldn't load your work. Please try again.",
          );
        }

        const payload = (await response.json()) as Partial<InboxSections>;

        setSections({
          overdue: payload.overdue ?? [],
          unfinished: payload.unfinished ?? [],
          reminders: payload.reminders ?? [],
          questions: payload.questions ?? [],
        });
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") {
          return;
        }

        setError(caught instanceof Error ? caught.message : "We couldn't load your work.");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => controller.abort();
  }, [attempt, refreshKey]);

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

  const post = useCallback(
    async (
      item: SubscriptionListItem,
      url: string,
      workingAction: WorkingAction,
      body?: unknown,
    ) => {
      setPending(item.id);
      setWorking(workingAction);
      setActionError(null);

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: body ? { "content-type": "application/json" } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        });
        const payload = (await response.json().catch(() => ({}))) as {
          message?: string;
        } & Partial<Outcome>;

        if (!response.ok) {
          throw new Error(
            payload.message ??
              (response.status === 401
                ? "Your session has expired. Sign in again to act on your work."
                : "We couldn't save that. Please try again."),
          );
        }

        setOutcomes((current) => [...current, payload as Outcome]);
        onWorkChanged?.();
      } catch (caught) {
        setActionError(
          caught instanceof Error ? caught.message : "We couldn't save that.",
        );
      } finally {
        setPending(null);
        setWorking(null);
        /**
         * Re-read rather than patching state: the row may have left its
         * section, and the queue is a projection, not a cache.
         */
        setAttempt((value) => value + 1);
      }
    },
    [onWorkChanged],
  );

  const deferOpenQuestion = useCallback(
    async (question: InboxQuestion) => {
      setPending(question.id);
      setWorking(null);
      setActionError(null);

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "later", questionId: question.id }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          message?: string;
        };

        if (!response.ok) {
          throw new Error(
            payload.message ??
              (response.status === 401
                ? "Your session has expired. Sign in again to act on your work."
                : "We couldn't put that off. Please try again."),
          );
        }

        onQuestionChanged?.();
      } catch (caught) {
        setActionError(
          caught instanceof Error ? caught.message : "We couldn't put that off.",
        );
      } finally {
        setPending(null);
        setAttempt((value) => value + 1);
      }
    },
    [onQuestionChanged],
  );

  const queue = workQueue(sections);
  const prominentId = nextQuestionId(queue);
  const busy = pending !== null;

  const questionRow = (question: InboxQuestion) => (
    <InboxQuestionRow
      busy={busy}
      onAnswer={(item) => onAnswerQuestion?.(item)}
      onDefer={(item) => void deferOpenQuestion(item)}
      prominent={question.id === prominentId}
      question={question}
      selected={replyToId === question.id}
    />
  );

  const groupActions = (group: WorkGroup) => {
    const { item } = group;

    return (
      <>
        {group.reasons.includes("overdue") ? (
          <OverdueActions
            busy={busy}
            onCancel={(decision: CancelDecision) =>
              void post(
                item,
                `/api/inbox/overdue/${item.id}/cancel`,
                decision.unknownTiming ? "unresolved" : "cancelled",
                decision.unknownTiming
                  ? { unknownTiming: true, notes: decision.notes }
                  : { endsOn: decision.endsOn, notes: decision.notes },
              )
            }
            onDecide={() =>
              void post(
                item,
                `/api/inbox/overdue/${item.id}/still-holding`,
                "still_holding",
              )
            }
            trial={isTrialHolding(item.status.value)}
            working={pending === item.id && working !== "status_set" ? working : null}
          />
        ) : null}
        {item.status.value === "unknown" ? (
          <button
            className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-800 transition hover:border-emerald-700 disabled:opacity-60"
            disabled={busy}
            onClick={() =>
              void post(item, `/api/inbox/unresolved/${item.id}/status`, "status_set", {
                status: "active",
              })
            }
            type="button"
          >
            {pending === item.id && working === "status_set" ? "Saving…" : "I have this"}
          </button>
        ) : null}
      </>
    );
  };

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
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
      <p aria-live="polite" className="sr-only">
        {loading
          ? "Loading work…"
          : `${queue.count} ${queue.count === 1 ? "thing" : "things"} waiting`}
      </p>

      {outcomes.map((outcome, index) => (
        <div
          className="mb-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
          key={`${outcome.provider}-${index}`}
        >
          {describe(outcome)}
        </div>
      ))}

      {actionError ? (
        <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {actionError}
        </div>
      ) : null}

      {queue.questions.length === 0 ? null : (
        <section aria-label="Questions" className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
            Questions ({queue.questions.length})
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {queue.questions.map((question) => (
              <li key={question.id}>{questionRow(question)}</li>
            ))}
          </ul>
        </section>
      )}

      {queue.groups.length === 0 ? null : (
        <section aria-label="Needs you" className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
            Needs you ({queue.groups.length})
          </h2>
          <ul className="mt-3 flex flex-col gap-3">
            {queue.groups.map((group) => {
              const dated = group.reasons.includes("overdue")
                ? overdueDate(group.item)
                : { label: "Next renewal", value: group.item.nextRenewal.value };

              return (
                <li className="flex flex-col gap-2" key={group.subscriptionId}>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                    {group.reasons.map(reasonLabel).join(" · ")}
                    {group.questions.length > 0
                      ? ` · ${group.questions.length} ${
                          group.questions.length === 1 ? "question" : "questions"
                        }`
                      : ""}
                  </p>
                  <InboxSubscriptionRow
                    actions={groupActions(group)}
                    dateLabel={dated.label}
                    dateValue={dated.value}
                    href={recordHref(group.item)}
                    item={group.item}
                    onDiscuss={
                      onDiscussSubscription
                        ? (item) =>
                            onDiscussSubscription(item.id, item.provider.value ?? "")
                        : undefined
                    }
                    selected={selectedSubscriptionId === group.subscriptionId}
                  />
                  {group.questions.length === 0 ? null : (
                    <ul className="ml-4 flex flex-col gap-2 border-l border-stone-200 pl-4">
                      {group.questions.map((question) => (
                        <li key={question.id}>{questionRow(question)}</li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {queue.reminders.length === 0 ? null : (
        <section aria-label="Reminders" className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
            Reminders ({queue.reminders.length})
          </h2>
          <p className="mt-1 text-sm text-stone-600">
            You asked to be notified. A card is here from its reminder date through the
            due date — there is nothing to dismiss.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {queue.reminders.map((reminder) => (
              <li key={reminder.id}>
                <InboxReminderRow href={recordHref(reminder.item)} reminder={reminder} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {!loading && queue.count === 0 && queue.reminders.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-stone-300 bg-white/60 px-6 py-12 text-center">
          <p className="text-lg font-medium text-stone-800">Nothing is waiting.</p>
          <p className="mt-2 text-sm text-stone-500">
            Capture anything you subscribed to and it will come here for review.
          </p>
        </div>
      ) : null}
    </div>
  );
}
