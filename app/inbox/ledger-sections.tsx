"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

import { InboxQuestionRow } from "@/components/inbox/question-row";
import { InboxReminderRow } from "@/components/inbox/reminder-row";
import {
  OverdueActions,
  type CancelDecision,
} from "@/components/inbox/overdue-actions";
import { InboxSubscriptionRow } from "@/components/inbox/subscription-row";
import type { OverdueAction } from "@/lib/inbox/overdue";
import type { InboxQuestion, InboxSections } from "@/lib/inbox/query";
import { msUntilNextUtcCalendarDay } from "@/lib/subscriptions/dates";
import { formatDate, isTrialHolding } from "@/lib/subscriptions/format";
import type { SubscriptionListItem } from "@/lib/subscriptions/projection";

const EMPTY: InboxSections = { overdue: [], unfinished: [], reminders: [], questions: [] };

type Outcome =
  | { action: "still_holding"; provider: string; from: string; to: string }
  | { action: "cancelled"; provider: string; endsOn: string }
  | { action: "unresolved"; provider: string; notesSaved: boolean };

type WorkingAction = OverdueAction | "unresolved";

/** What the write did, in the words the user needs to trust it. */
function describe(outcome: Outcome): string {
  if (outcome.action === "still_holding") {
    return `${outcome.provider} is due again ${formatDate(outcome.to)}. That date is inferred from its cadence, not confirmed — open it to set the real one.`;
  }

  if (outcome.action === "unresolved") {
    return outcome.notesSaved
      ? `${outcome.provider} is still unresolved. The note is saved; nothing was cancelled.`
      : `${outcome.provider} is still unresolved. Nothing was cancelled, and no date was invented.`;
  }

  return `${outcome.provider} is cancelled, ending ${formatDate(outcome.endsOn)}. It stays in your ledger under Cancelled.`;
}

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

function Section({
  title,
  blurb,
  dateLabel,
  dateForItem,
  items,
  renderActions,
}: {
  title: string;
  blurb: string;
  dateLabel?: string;
  dateForItem?: (item: SubscriptionListItem) => { label: string; value: string | null };
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
        {items.map((item) => {
          const dated = dateForItem?.(item) ?? {
            label: dateLabel ?? "Next renewal",
            value: item.nextRenewal.value,
          };

          return (
            <li key={item.id}>
              <InboxSubscriptionRow
                actions={renderActions?.(item)}
                dateLabel={dated.label}
                dateValue={dated.value}
                item={item}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * The projected ledger sections of Inbox, plus capture questions that are still
 * open. Questions are stored rows re-read on every load, so they survive a
 * reload; there is no dismiss, only answer or later.
 */
export function LedgerSections({
  refreshKey = 0,
  replyToId = null,
  onAnswerQuestion,
  onQuestionChanged,
}: {
  /** Bumped when a proposal is decided or a capture lands, since both can change work. */
  refreshKey?: number;
  replyToId?: string | null;
  onAnswerQuestion?: (question: InboxQuestion) => void;
  onQuestionChanged?: () => void;
} = {}) {
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
              ? "Your session has expired. Sign in again to view your inbox."
              : "We couldn't load your inbox. Please try again.",
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

  const postOverdue = useCallback(
    async (
      item: SubscriptionListItem,
      path: string,
      workingAction: WorkingAction,
      body?: unknown,
    ) => {
      setPending(item.id);
      setWorking(workingAction);
      setActionError(null);

      try {
        const response = await fetch(`/api/inbox/overdue/${item.id}/${path}`, {
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
         * Re-read rather than patching state: the row may have left Overdue,
         * and the sections are a projection, not a cache.
         */
        setAttempt((value) => value + 1);
      }
    },
    [],
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
                ? "Your session has expired. Sign in again to act on your inbox."
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

  if (
    loading &&
    sections.overdue.length === 0 &&
    sections.unfinished.length === 0 &&
    sections.reminders.length === 0 &&
    sections.questions.length === 0
  ) {
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

      {sections.questions.length === 0 ? null : (
        <section aria-label="Questions" className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
            Questions
          </h2>
          <p className="mt-1 text-sm text-stone-600">
            {sections.questions.length === 1
              ? "One question is still open. Answer it here, or put it off — there is nothing to dismiss."
              : `${sections.questions.length} questions are still open. Answer any of them, or put one off. Putting it off is not a reminder dismissal.`}
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {sections.questions.map((question, index) => (
              <li key={question.id}>
                <InboxQuestionRow
                  busy={pending !== null}
                  onAnswer={(item) => onAnswerQuestion?.(item)}
                  onDefer={(item) => void deferOpenQuestion(item)}
                  prominent={index === 0 && question.state === "asked"}
                  question={question}
                  selected={replyToId === question.id}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <Section
        blurb="These still need an answer after a relevant date passed. Confirmed auto-renewing holdings are not listed just because a stored date is old. If it stopped, review the actual end date — or leave it open with a note."
        dateForItem={overdueDate}
        items={sections.overdue}
        renderActions={(item) => (
          <OverdueActions
            busy={pending !== null}
            onCancel={(decision: CancelDecision) =>
              void postOverdue(
                item,
                "cancel",
                decision.unknownTiming ? "unresolved" : "cancelled",
                decision.unknownTiming
                  ? { unknownTiming: true, notes: decision.notes }
                  : { endsOn: decision.endsOn, notes: decision.notes },
              )
            }
            onDecide={() => void postOverdue(item, "still-holding", "still_holding")}
            trial={isTrialHolding(item.status.value)}
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
      {sections.reminders.length === 0 ? null : (
        <section aria-label="Reminders" className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
            Reminders
          </h2>
          <p className="mt-1 text-sm text-stone-600">
            You asked to be notified. A card is here from its reminder date through
            the due date, then it is gone. There is nothing to dismiss.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {sections.reminders.map((reminder) => (
              <li key={reminder.id}>
                <InboxReminderRow reminder={reminder} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
