"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { CaptureComposer } from "@/components/capture/capture-composer";
import { OverdueActions, type CancelDecision } from "@/components/inbox/overdue-actions";
import { InboxQuestionRow } from "@/components/inbox/question-row";
import { InboxReminderRow } from "@/components/inbox/reminder-row";
import { OutcomeNotice } from "@/components/proposals/outcome-notice";
import { ProposalCard } from "@/components/proposals/proposal-card";
import {
  useProposalDecision,
  type Outcome,
} from "@/components/proposals/use-proposal-decision";
import { RecordHistory } from "@/components/subscriptions/record-history";
import { RecordTerms } from "@/components/subscriptions/record-terms";
import type { ConversationTurn } from "@/lib/capture/conversation";
import type { ChatCaptureResult } from "@/lib/capture/record";
import type { TargetDescriptor } from "@/lib/capture/target-fields";
import type { InboxQuestion } from "@/lib/inbox/query";
import type { ConfirmedTerms } from "@/lib/proposals/confirm";
import type { ProposalView } from "@/lib/proposals/projection";
import type { RetargetAction } from "@/lib/proposals/retarget";
import { isTrialHolding } from "@/lib/subscriptions/format";
import type { SubscriptionDetail, SubscriptionListItem } from "@/lib/subscriptions/projection";
import { reasonDetail, type SubscriptionEntry } from "@/lib/workspace/subscription-list";
import type { WorkspaceFilter } from "@/lib/workspace/view";

import { describeWorkOutcome, useWorkActions } from "./use-work-actions";

/** The one question to answer first: the oldest still asked. */
function prominentQuestionId(questions: InboxQuestion[]): string | null {
  const asked = questions.filter((question) => question.state === "asked");

  if (asked.length === 0) {
    return null;
  }

  return asked.reduce((oldest, question) =>
    question.updatedAt < oldest.updatedAt ? question : oldest,
  ).id;
}

function Block({
  title,
  children,
  hint,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
          {title}
        </h3>
        {hint ? <p className="mt-1 text-sm text-stone-600">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * The saved record: its terms with per-field confirm and edit, and its history.
 * A client read, so opening a row costs no navigation and the list keeps its
 * place. A pending card above it is a separate thing: proposed values stay on
 * the card until accepted, and nothing here shows them as the record's own.
 */
function SavedRecord({
  recordId,
  refreshKey,
  onSaved,
}: {
  recordId: string;
  refreshKey: number;
  onSaved: () => void;
}) {
  const [detail, setDetail] = useState<SubscriptionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
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
        setError(caught instanceof Error ? caught.message : "We couldn't load that record.");
      }
    }

    void load();

    return () => controller.abort();
  }, [recordId, refreshKey]);

  if (error) {
    return (
      <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        {error}
      </p>
    );
  }

  if (!detail) {
    return <p className="text-sm text-stone-500">Loading record…</p>;
  }

  return (
    <>
      <Block title="Saved details">
        <RecordTerms
          initial={detail}
          key={detail.id}
          onSaved={(next) => {
            setDetail(next);
            onSaved();
          }}
        />
      </Block>
      <details className="group">
        <summary className="cursor-pointer text-sm font-semibold text-emerald-900 underline decoration-emerald-300 underline-offset-4 hover:text-emerald-700">
          <span className="group-open:hidden">Show reminders, amendments and history</span>
          <span className="hidden group-open:inline">Hide reminders, amendments and history</span>
        </summary>
        <RecordHistory detail={detail} />
      </details>
    </>
  );
}

/**
 * One subscription, open inline in the list: the thing the current filter is
 * about first — its pending cards, its open questions, or its reminder — then
 * the saved record, with the conversation about it beside them on a wide
 * screen and below them on a narrow one.
 *
 * Every action here is the same one it was under Work: a card is decided
 * through `ProposalCard`, a question answered in the composer or put off, a
 * passed date reconciled with `OverdueActions`. What changed is only that they
 * are shown on the subscription they are about.
 */
export function OpenSubscription({
  entry,
  filter,
  target,
  conversation,
  conversationLoading,
  refreshKey,
  closeHref,
  carriedOutcome = null,
  onCaptured,
  onSelectTarget,
  onWritten,
  onDecided,
}: {
  entry: SubscriptionEntry;
  filter: WorkspaceFilter;
  /** What the composer is about — always something on this subscription. */
  target: TargetDescriptor;
  conversation: ConversationTurn[];
  conversationLoading: boolean;
  /** Bumped by any write, so the record re-reads. */
  refreshKey: number;
  closeHref: string;
  /** The accept that turned a draft into this record, shown once here. */
  carriedOutcome?: Outcome | null;
  onCaptured: (result: ChatCaptureResult) => void;
  onSelectTarget: (target: TargetDescriptor) => void;
  onWritten: () => void;
  /** A card left the list, with the outcome the server returned. */
  onDecided: (proposal: ProposalView, outcome: Outcome | null) => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  /**
   * Cards are the list's, re-read after every write. Between the decision and
   * that re-read, a decided card is hidden and a corrected one shows its new
   * read, so the row never shows a card the server has already settled.
   */
  const [settled, setSettled] = useState<string[]>([]);
  const [corrected, setCorrected] = useState<Record<string, ProposalView>>({});
  const decidedRef = useRef<{ proposal: ProposalView; pending: boolean } | null>(null);
  const cards = entry.proposals
    .filter((proposal) => !settled.includes(proposal.id))
    .map((proposal) => corrected[proposal.id] ?? proposal);

  useEffect(() => {
    heading.current?.focus();
  }, [entry.key]);

  const {
    decide,
    retarget,
    pending: decisionPending,
    error: decideError,
    outcomes,
  } = useProposalDecision();
  const work = useWorkActions({ onWritten, onQuestionChanged: onWritten });

  const onDecide = useCallback(
    async (proposal: ProposalView, decision: "accept" | "reject", confirm?: ConfirmedTerms) => {
      decidedRef.current = { proposal, pending: true };

      const decided = await decide(proposal, decision, confirm);

      if (decided) {
        setSettled((current) => [...current, proposal.id]);
      } else {
        decidedRef.current = null;
        onWritten();
      }
    },
    [decide, onWritten],
  );

  /** The hook appends the outcome after resolving; report it once it is there. */
  useEffect(() => {
    const decided = decidedRef.current;

    if (decided?.pending && outcomes.length > 0) {
      decidedRef.current = null;
      onDecided(decided.proposal, outcomes[0]);
    }
  }, [outcomes, onDecided]);

  const onRetarget = useCallback(
    async (proposal: ProposalView, action: RetargetAction) => {
      const result = await retarget(proposal, action);

      if (!result) {
        onWritten();

        return;
      }

      if (result.proposal.state !== "pending") {
        setSettled((current) => [...current, proposal.id]);
        onDecided(proposal, null);

        return;
      }

      setCorrected((current) => ({
        ...current,
        [proposal.id]: { ...result.proposal, likelyMatches: result.options },
      }));

      /** A retarget can move the card onto a holding; the list re-reads to show it there. */
      if (result.retargeted) {
        onWritten();
      }
    },
    [retarget, onDecided, onWritten],
  );

  const item = entry.item;
  const busy = decisionPending !== null || work.pending !== null;
  const prominentId = prominentQuestionId(entry.questions);

  const reconciliation = (row: SubscriptionListItem) => (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-stone-200 bg-white/80 px-4 py-3">
      <p className="mr-auto text-sm text-stone-700">
        {entry.reasons.map((reason) => reasonDetail(row, reason)).join(" · ")}
      </p>
      {entry.reasons.includes("overdue") ? (
        <OverdueActions
          busy={busy}
          onCancel={(decision: CancelDecision) =>
            void work.post(
              row,
              `/api/inbox/overdue/${row.id}/cancel`,
              decision.unknownTiming ? "unresolved" : "cancelled",
              decision.unknownTiming
                ? { unknownTiming: true, notes: decision.notes }
                : { endsOn: decision.endsOn, notes: decision.notes },
            )
          }
          onDecide={() =>
            void work.post(row, `/api/inbox/overdue/${row.id}/still-holding`, "still_holding")
          }
          trial={isTrialHolding(row.status.value)}
          working={work.pending === row.id && work.working !== "status_set" ? work.working : null}
        />
      ) : null}
      {row.status.value === "unknown" ? (
        <button
          className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-800 transition hover:border-emerald-700 disabled:opacity-60"
          disabled={busy}
          onClick={() =>
            void work.post(row, `/api/inbox/unresolved/${row.id}/status`, "status_set", {
              status: "active",
            })
          }
          type="button"
        >
          {work.pending === row.id && work.working === "status_set" ? "Saving…" : "I have this"}
        </button>
      ) : null}
    </div>
  );

  const review =
    cards.length > 0 || (item && entry.reasons.length > 0) ? (
      <Block
        hint={
          entry.kind === "draft"
            ? "Not added yet. Accepting this card is what saves it as a subscription."
            : "Proposed changes stay on the card until you accept them; the saved details below are untouched."
        }
        title={entry.kind === "draft" ? "Review this draft" : "Pending review"}
      >
        {item && entry.reasons.length > 0 ? reconciliation(item) : null}
        {cards.map((proposal) => (
          <ProposalCard
            busy={busy}
            key={proposal.id}
            onDecide={(card, decision, confirm) => void onDecide(card, decision, confirm)}
            onDiscuss={(card) =>
              onSelectTarget({
                kind: "proposal",
                id: card.id,
                provider: entry.provider,
                subscriptionId: card.subscriptionId,
              })
            }
            onRetarget={(card, action) => void onRetarget(card, action)}
            proposal={proposal}
            selected={target.kind === "proposal" && target.id === proposal.id}
            working={decisionPending === proposal.id}
          />
        ))}
      </Block>
    ) : null;

  const questions =
    entry.questions.length > 0 ? (
      <Block
        hint="Answer in the conversation, or put a question off — it stays open until you do."
        title={`Open questions (${entry.questions.length})`}
      >
        {entry.questions.map((question) => (
          <InboxQuestionRow
            busy={busy}
            key={question.id}
            onAnswer={(asked) =>
              onSelectTarget({
                kind: "question",
                id: asked.id,
                provider: asked.provider,
                question: asked.question,
                subscriptionId: asked.subscriptionId,
              })
            }
            onDefer={(asked) => void work.defer(asked)}
            prominent={question.id === prominentId}
            question={question}
            selected={target.kind === "question" && target.id === question.id}
          />
        ))}
      </Block>
    ) : null;

  const reminders =
    entry.reminders.length > 0 ? (
      <Block
        hint="You asked to be notified. A reminder shows from its reminder date through the due date — there is nothing to dismiss."
        title="Reminder"
      >
        {entry.reminders.map((reminder) => (
          <InboxReminderRow href={closeHref} key={reminder.id} reminder={reminder} />
        ))}
      </Block>
    ) : null;

  const blocks = { review, questions, reminders };
  const focus: (keyof typeof blocks)[] =
    filter === "questions"
      ? ["questions", "review", "reminders"]
      : filter === "reminders"
        ? ["reminders", "review", "questions"]
        : ["review", "questions", "reminders"];

  return (
    <div className="border-t border-stone-200 bg-stone-50/60 px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2
          className="text-xl font-semibold tracking-tight text-stone-950 focus:outline-none"
          ref={heading}
          tabIndex={-1}
        >
          {entry.provider}
          {entry.kind === "draft" ? (
            <span className="ml-3 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 align-middle text-xs font-semibold text-amber-900">
              Not added yet
            </span>
          ) : null}
        </h2>
        <div className="ml-auto flex flex-wrap items-center gap-4">
          {entry.subscriptionId ? (
            <Link
              className="text-sm font-semibold text-stone-700 underline decoration-stone-300 underline-offset-4 hover:text-stone-950"
              href={`/ledger/${entry.subscriptionId}/edit`}
            >
              Edit everything
            </Link>
          ) : null}
          <Link
            className="text-sm font-semibold text-stone-600 underline decoration-stone-300 underline-offset-4 hover:text-stone-900"
            href={closeHref}
            scroll={false}
          >
            Close
          </Link>
        </div>
      </div>

      <div className="mt-5 grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          {carriedOutcome ? <OutcomeNotice outcome={carriedOutcome} /> : null}
          {outcomes.map((outcome, index) => (
            <OutcomeNotice key={`${outcome.provider}-${index}`} outcome={outcome} />
          ))}
          {work.outcomes.map((outcome, index) => (
            <div
              className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
              key={`${outcome.action}-${index}`}
            >
              {describeWorkOutcome(outcome)}
            </div>
          ))}
          {decideError || work.error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {decideError ?? work.error}
            </div>
          ) : null}

          {focus.map((name) => (
            <Fragment key={name}>{blocks[name]}</Fragment>
          ))}

          {entry.subscriptionId ? (
            <SavedRecord
              onSaved={onWritten}
              recordId={entry.subscriptionId}
              refreshKey={refreshKey}
            />
          ) : entry.draft ? null : (
            <p className="text-sm text-stone-600">
              This question was asked before anything was added. Answer it, and whatever it
              decides will show up as a card or a subscription here.
            </p>
          )}
        </div>

        <div className="min-w-0 lg:sticky lg:top-4">
          <CaptureComposer
            conversation={conversation}
            conversationLoading={conversationLoading}
            home={defaultTarget(entry)}
            onCaptured={onCaptured}
            onSelectTarget={onSelectTarget}
            target={target}
          />
        </div>
      </div>
    </div>
  );
}

/** What the composer inside a subscription is about when nothing narrower is picked. */
export function defaultTarget(entry: SubscriptionEntry): TargetDescriptor {
  if (entry.subscriptionId) {
    return { kind: "subscription", id: entry.subscriptionId, provider: entry.provider };
  }

  if (entry.draft) {
    return {
      kind: "proposal",
      id: entry.draft.id,
      provider: entry.provider,
      subscriptionId: null,
    };
  }

  const question = entry.questions[0];

  return {
    kind: "question",
    id: question.id,
    provider: question.provider,
    question: question.question,
    subscriptionId: question.subscriptionId,
  };
}

/** Whether a target is something on this subscription, and so can stay selected. */
export function belongsTo(entry: SubscriptionEntry, target: TargetDescriptor): boolean {
  switch (target.kind) {
    case "all":
      return false;
    case "subscription":
      return target.id === entry.subscriptionId;
    case "proposal":
      return entry.proposals.some((proposal) => proposal.id === target.id);
    case "question":
      return entry.questions.some((question) => question.id === target.id);
  }
}
