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
import { groupInlineProposals, type DifferenceField } from "@/lib/proposals/differences";
import { RecordHistory } from "@/components/subscriptions/record-history";
import { RecordTerms } from "@/components/subscriptions/record-terms";
import { ReminderPreferences } from "@/components/subscriptions/reminder-preferences";
import { CancellationIntentionBlock } from "@/components/subscriptions/cancellation-intention";
import { Feedback } from "@/components/ui/foundations";
import type { ConversationTurn } from "@/lib/capture/conversation";
import type { ChatCaptureResult } from "@/lib/capture/record";
import type { TargetDescriptor } from "@/lib/capture/target-fields";
import type { InboxQuestion } from "@/lib/inbox/query";
import type { ConfirmedTerms } from "@/lib/proposals/confirm";
import type { ProposalView } from "@/lib/proposals/projection";
import type { RetargetAction } from "@/lib/proposals/retarget";
import { isTrialHolding } from "@/lib/subscriptions/format";
import type { SubscriptionDetail, SubscriptionListItem } from "@/lib/subscriptions/projection";
import { entryIdentityLabel } from "@/lib/workspace/row-presentation";
import {
  answeredByPendingCard,
  matchesFilter,
  reasonDetail,
  type SubscriptionEntry,
} from "@/lib/workspace/subscription-list";
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

function fieldSlots(afterField?: Partial<Record<DifferenceField, ReactNode>>) {
  if (!afterField) {
    return null;
  }

  return (
    <>
      {Object.entries(afterField).map(([field, node]) => (
        <Fragment key={field}>{node}</Fragment>
      ))}
    </>
  );
}

function Block({
  title,
  children,
  hint,
  id,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-3" id={id}>
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
 * The saved record: its terms with per-field confirm and edit, pending deltas
 * beside the fields they change, and its history. A pending card is still its
 * own proposal — the saved value stays visible until that card is accepted.
 */
function SavedRecord({
  recordId,
  refreshKey,
  onSaved,
  afterField,
  extras,
  forceTrialEnd = false,
}: {
  recordId: string;
  refreshKey: number;
  onSaved: () => void;
  afterField?: Partial<Record<DifferenceField, ReactNode>>;
  extras?: ReactNode;
  forceTrialEnd?: boolean;
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
      <>
        {extras}
        <Feedback tone="error">{error}</Feedback>
        {fieldSlots(afterField)}
        <div id={`reminders-${recordId}`} />
      </>
    );
  }

  if (!detail) {
    return (
      <>
        {extras}
        <p className="text-sm text-stone-500">Loading record…</p>
        {fieldSlots(afterField)}
        <div id={`reminders-${recordId}`} />
      </>
    );
  }

  return (
    <>
      {extras}
      <RecordTerms
        afterField={afterField}
        initial={detail}
        key={`${detail.id}:${detail.updatedAt}`}
        onSaved={(next) => {
          setDetail(next);
          onSaved();
        }}
      />
      <ReminderPreferences
        detail={detail}
        forceTrialEnd={forceTrialEnd}
        onSaved={(next) => {
          setDetail(next);
          onSaved();
        }}
      />
      <CancellationIntentionBlock
        detail={detail}
        onSaved={(next) => {
          setDetail(next);
          onSaved();
        }}
      />
      <details className="group">
        <summary className="cursor-pointer text-sm font-semibold text-emerald-900 underline decoration-emerald-300 underline-offset-4 hover:text-emerald-700">
          <span className="group-open:hidden">Show amendments and history</span>
          <span className="hidden group-open:inline">Hide amendments and history</span>
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
  onCaptured: (result: ChatCaptureResult) => boolean | void;
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
  /**
   * Terms set on a card but not yet accepted, by card id. A question whose
   * field is now on a card has its answer waiting on that card's accept, so
   * it is not asked as well; rejecting the card asks it again.
   */
  const [staged, setStaged] = useState<Record<string, ConfirmedTerms>>({});
  const asked = entry.questions.filter(
    (question) => !answeredByPendingCard({ proposals: cards }, question, staged),
  );

    const {
    decide,
    retarget,
    pending: decisionPending,
    error: decideError,
    errorId: decideErrorId,
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
  const prominentId = prominentQuestionId(asked);
  const identity = entryIdentityLabel(entry);

    const reconciliation = (row: SubscriptionListItem) => (
    <div className="flex flex-col gap-3">
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
      {work.error ? <Feedback tone="error">{work.error}</Feedback> : null}
    </div>
  );

  const renderProposal = (proposal: ProposalView) => (
    <ProposalCard
      busy={busy}
      error={decideErrorId === proposal.id ? decideError : null}
      key={proposal.id}
      layout="integrated"
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
      onStaged={(card, terms) => setStaged((all) => ({ ...all, [card.id]: terms }))}
      proposal={proposal}
      saved={item}
      selected={target.kind === "proposal" && target.id === proposal.id}
      working={decisionPending === proposal.id}
    />
  );
  const { inline, rest } = groupInlineProposals(cards);
  const afterField = Object.fromEntries(
    (Object.entries(inline) as [DifferenceField, ProposalView[]][]).map(([field, proposals]) => [
      field,
      <>{proposals.map(renderProposal)}</>,
    ]),
  ) as Partial<Record<DifferenceField, ReactNode>>;
  const workBlock =
    item && entry.reasons.length > 0 ? reconciliation(item) : null;
  const terms =
    entry.kind === "draft" ? (
      <section aria-labelledby="draft-details-heading">
        <h3 className="text-lg font-semibold text-stone-950" id="draft-details-heading">
          Draft details
        </h3>
        <p className="mt-2 text-sm text-stone-600">
          Not added yet — nothing is saved for this subscription. Accepting this card
          is what adds it. Fields with nothing proposed stay not recorded.
        </p>
        <div className="mt-4 flex flex-col gap-4">{cards.map(renderProposal)}</div>
      </section>
    ) : entry.subscriptionId ? (
      <SavedRecord
        afterField={afterField}
        extras={rest.length > 0 ? <div className="flex flex-col gap-4">{rest.map(renderProposal)}</div> : null}
        forceTrialEnd={cards.some(
          (proposal) => proposal.payload?.reminderPreferences?.trialEnd !== undefined,
        )}
        onSaved={onWritten}
        recordId={entry.subscriptionId}
        refreshKey={refreshKey}
      />
    ) : (
      <p className="text-sm text-stone-600">
        This question was asked before anything was added. Answer it, and whatever it
        decides will show up as a card or a subscription here.
      </p>
    );

    const questions =
    asked.length > 0 ? (
      <Block
        hint="Answer here, or choose Later. It stays available with no promised date."
        id={`questions-${entry.key}`}
        title={`Open questions (${asked.length})`}
      >
        {asked.map((question) => (
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
        {work.error && !workBlock ? <Feedback tone="error">{work.error}</Feedback> : null}
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

  const blocks = { work: workBlock, questions, reminders, terms };
  const focus: (keyof typeof blocks)[] =
    filter === "questions"
      ? ["questions", "work", "terms", "reminders"]
      : filter === "reminders"
        ? ["reminders", "work", "terms", "questions"]
        : ["work", "terms", "questions", "reminders"];

  const composerAnchor = entry.subscriptionId ?? entry.draft?.id ?? entry.key;
  const stillInFilter = matchesFilter(entry, filter);

  return (
    <div aria-label={`Open record: ${identity}`} className="workspace-detail">
      <div className="workspace-detail-toolbar">
        <h2 className="sr-only" ref={heading} tabIndex={-1}>
          {identity}
          {entry.kind === "draft" ? " — Not added yet" : ""}
        </h2>
        {asked.length > 0 ? (
          <a className="ui-button ui-button--quiet ui-button--small" href={`#questions-${entry.key}`}>
            Questions ({asked.length})
          </a>
        ) : null}
        <a className="ui-button ui-button--quiet ui-button--small" href={`#composer-${composerAnchor}`}>
          Conversation
        </a>
        {entry.subscriptionId ? (
          <>
            <a className="ui-button ui-button--quiet ui-button--small" href={`#reminders-${entry.subscriptionId}`}>
              Reminders
            </a>
            <Link className="ui-button ui-button--quiet ui-button--small" href={`/ledger/${entry.subscriptionId}/edit`}>
              Edit everything
            </Link>
          </>
        ) : null}
        <Link className="ui-button ui-button--quiet ui-button--small" href={closeHref} scroll={false}>
          Close
        </Link>
      </div>

      <div className="mt-5 grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex min-w-0 flex-col gap-6">
                    {filter !== "all" && !stillInFilter ? (
            <Feedback tone="info">
              This row no longer matches this filter. It stays open until you close it.
            </Feedback>
          ) : null}
          {carriedOutcome ? (
            <OutcomeNotice alreadyOnRow outcome={carriedOutcome} />
          ) : null}
          {outcomes.map((outcome, index) => (
            <OutcomeNotice
              alreadyOnRow
              key={`${outcome.provider}-${index}`}
              outcome={outcome}
            />
          ))}
          {work.outcomes.map((outcome, index) => (
            <Feedback key={`${outcome.action}-${index}`} tone="success">
              {describeWorkOutcome(outcome)}
            </Feedback>
          ))}

          {focus.map((name) => (
            <Fragment key={name}>{blocks[name]}</Fragment>
          ))}
        </div>

        <div className="min-w-0 lg:sticky lg:top-4">
          <CaptureComposer
            composerId={`composer-${composerAnchor}`}
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
