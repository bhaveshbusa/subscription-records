"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { CaptureComposer } from "@/components/capture/capture-composer";
import type { ConversationTurn } from "@/lib/capture/conversation";
import {
  ABOUT_PARAM,
  readSelectedTarget,
  targetFromSearch,
  targetToSearch,
  writeSelectedTarget,
} from "@/lib/capture/draft-store";
import type { ChatCaptureResult } from "@/lib/capture/record";
import { targetInput, targetKey, type TargetDescriptor } from "@/lib/capture/target-fields";
import type { InboxQuestion } from "@/lib/inbox/query";
import type { ProposalView } from "@/lib/proposals/projection";
import type { SubscriptionListItem } from "@/lib/subscriptions/projection";
import {
  parseWorkspaceState,
  WORKSPACE_VIEWS,
  workspaceHref,
  type WorkspaceViewName,
} from "@/lib/workspace/view";

import { Inventory } from "./inventory";
import { ProposalReview } from "./proposal-review";
import { RecordPanel } from "./record-panel";
import { WorkQueue } from "./work-queue";

const ALL: TargetDescriptor = { kind: "all" };

function questionTarget(question: InboxQuestion): TargetDescriptor {
  return {
    kind: "question",
    id: question.id,
    provider: question.provider,
    question: question.question,
    subscriptionId: question.subscriptionId,
  };
}

function proposalTarget(proposal: ProposalView): TargetDescriptor {
  return {
    kind: "proposal",
    id: proposal.id,
    provider: proposal.subscriptionProvider ?? proposal.payload?.provider?.value ?? "",
    subscriptionId: proposal.subscriptionId,
  };
}

function followUpTarget(result: ChatCaptureResult): TargetDescriptor | null {
  if (!result.followUp) {
    return null;
  }

  return {
    kind: "question",
    id: result.followUp.id,
    provider: result.followUp.provider,
    question: result.followUp.question,
    subscriptionId: null,
  };
}

type Conversation = {
  target: TargetDescriptor;
  turns: ConversationTurn[];
};

/**
 * The workspace: one shell holding the conversation, the two views over it —
 * **Work** and **Subscriptions** — and the record currently open beside them.
 *
 * Nothing here owns anyone else's data. The pieces are siblings, so a proposal
 * is rendered once however it got here, and the counters below are all the
 * coordination they need: a capture raises proposals, a decision or an edit
 * writes a ledger row, and whoever projects that row re-reads. Reading again
 * is what keeps Work, the open record, the inventory and its coverage figures
 * telling the same story after an accept.
 *
 * View, open record, composer target and inventory filters all live in the URL,
 * so a reload or a shared link lands on the same place; drafts are keyed by
 * target in storage, so switching views or opening a record and coming back
 * finds what was typed. Ids in the URL are never trusted: the server resolves
 * them per session user, and a target that has since been decided or answered
 * is cleared here.
 */
export function WorkspaceShell({ account }: { account?: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [captured, setCaptured] = useState(0);
  const [decided, setDecided] = useState(0);
  const [workWrites, setWorkWrites] = useState(0);
  const [recordSaves, setRecordSaves] = useState(0);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const urlTarget = useMemo(() => targetFromSearch(searchParams), [searchParams]);
  const { view, recordId, pane } = useMemo(
    () => parseWorkspaceState(searchParams),
    [searchParams],
  );
  const restored = useRef(false);

  const navigateTo = useCallback(
    (next: TargetDescriptor) => {
      const search = targetToSearch(next);
      const params = new URLSearchParams(searchParams.toString());

      if (search) {
        params.set(ABOUT_PARAM, search);
      } else {
        params.delete(ABOUT_PARAM);
      }

      const query = params.toString();

      try {
        writeSelectedTarget(window.localStorage, next);
      } catch {
        /* a browser without storage still has the URL */
      }

      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );
  const selectTarget = useCallback(
    (next: TargetDescriptor) => {
      setNotice(null);
      navigateTo(next);
    },
    [navigateTo],
  );

  /** A bare workspace URL after a reload or a visit picks the last target up. */
  useEffect(() => {
    if (restored.current) {
      return;
    }

    restored.current = true;

    if (urlTarget || searchParams.has(ABOUT_PARAM)) {
      return;
    }

    let stored: TargetDescriptor | null = null;

    try {
      stored = readSelectedTarget(window.localStorage);
    } catch {
      stored = null;
    }

    if (stored && stored.kind !== "all") {
      navigateTo(stored);
    }
  }, [urlTarget, searchParams, navigateTo]);

  /** The resolved words for the target and the turns already said about it. */
  const selectedKey = urlTarget ? targetKey(urlTarget) : "all";

  useEffect(() => {
    if (!urlTarget) {
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams(
      Object.entries(targetInput(urlTarget)).filter((entry): entry is [string, string] =>
        typeof entry[1] === "string",
      ),
    );

    fetch(`/api/conversation?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 404 || response.status === 409) {
          const payload = (await response.json().catch(() => null)) as {
            message?: string;
          } | null;

          setNotice(
            payload?.message ??
              "What you had selected is no longer open, so the box is about all subscriptions again.",
          );
          selectTarget(ALL);

          return;
        }

        if (!response.ok) {
          /** The words are the client's; the turns will show on the next re-read. */
          setConversation({ target: urlTarget, turns: [] });

          return;
        }

        const payload = (await response.json()) as Conversation;

        setConversation(payload);
      })
      .catch(() => {
        /* aborted or offline: the composer still sends by id */
      });

    return () => controller.abort();
  }, [selectedKey, urlTarget, captured, decided, selectTarget]);

  /** The server's words for the target once read; the URL's id until then. */
  const resolved =
    conversation && targetKey(conversation.target) === selectedKey ? conversation : null;
  const target = resolved?.target ?? urlTarget ?? ALL;
  const conversationLoading = urlTarget !== null && resolved === null;

  const onCaptured = useCallback(
    (result: ChatCaptureResult) => {
      setCaptured((value) => value + 1);

      if (result.deferred) {
        selectTarget(ALL);

        return;
      }

      const asked = followUpTarget(result);

      if (asked) {
        selectTarget(asked);
      } else if (target.kind === "question") {
        selectTarget(ALL);
      }
    },
    [selectTarget, target.kind],
  );
  const onDecided = useCallback(
    (proposal?: ProposalView) => {
      setDecided((value) => value + 1);

      if (proposal && target.kind === "proposal" && target.id === proposal.id) {
        selectTarget(ALL);
      }
    },
    [selectTarget, target],
  );
  const onQuestionChanged = useCallback(() => {
    setCaptured((value) => value + 1);

    if (target.kind === "question") {
      selectTarget(ALL);
    }
  }, [selectTarget, target.kind]);

  const recordHref = useCallback(
    (item: SubscriptionListItem) =>
      workspaceHref(searchParams, { recordId: item.id, pane: "record" }),
    [searchParams],
  );
  const viewHref = useCallback(
    (next: WorkspaceViewName) =>
      workspaceHref(searchParams, { view: next, pane: "conversation" }),
    [searchParams],
  );

  /**
   * Both columns fit side by side from `lg` up. Below it there is only room
   * for one, so the open record takes the width and the return control brings
   * the conversation back — with the same target, draft and view still there.
   */
  const showRecord = recordId !== null;
  const recordOnly = showRecord && pane === "record";

  return (
    <div className="mx-auto w-full max-w-[104rem] px-4 pb-16 sm:px-8">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-6">
        <nav aria-label="Workspace views" className="flex gap-1">
          {WORKSPACE_VIEWS.map((entry) => (
            <Link
              aria-current={entry.value === view ? "page" : undefined}
              className={
                entry.value === view
                  ? "rounded-xl bg-emerald-950 px-4 py-2 text-sm font-semibold text-white"
                  : "rounded-xl px-4 py-2 text-sm font-semibold text-stone-700 transition hover:bg-white"
              }
              href={viewHref(entry.value)}
              key={entry.value}
              scroll={false}
            >
              {entry.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-4">
          <Link
            className="text-sm font-semibold text-emerald-900 underline decoration-emerald-300 underline-offset-4 hover:text-emerald-700"
            href="/ledger/new"
          >
            Add a subscription
          </Link>
          {account}
        </div>
      </header>

      <div
        className={
          showRecord
            ? "mt-4 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
            : "mt-4"
        }
      >
        <div className={recordOnly ? "hidden min-w-0 lg:block" : "min-w-0"}>
          <div className="sticky top-0 z-10 -mx-2 bg-[#f5f3ef]/95 px-2 pb-4 pt-2 backdrop-blur">
            {notice ? (
              <p
                className="mb-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
                role="status"
              >
                {notice}
              </p>
            ) : null}
            <CaptureComposer
              conversation={resolved?.turns ?? []}
              conversationLoading={conversationLoading}
              key={selectedKey}
              onCaptured={onCaptured}
              onSelectTarget={selectTarget}
              target={target}
            />
          </div>

          {view === "work" ? (
            <>
              <ProposalReview
                onDecided={onDecided}
                onDiscuss={(proposal) => selectTarget(proposalTarget(proposal))}
                refreshKey={captured}
                selectedId={target.kind === "proposal" ? target.id : null}
              />
              <WorkQueue
                onAnswerQuestion={(question) => selectTarget(questionTarget(question))}
                onDiscussSubscription={(id, provider) =>
                  selectTarget({ kind: "subscription", id, provider })
                }
                onQuestionChanged={onQuestionChanged}
                onWorkChanged={() => setWorkWrites((value) => value + 1)}
                recordHref={recordHref}
                refreshKey={captured + decided + recordSaves}
                replyToId={target.kind === "question" ? target.id : null}
                selectedSubscriptionId={target.kind === "subscription" ? target.id : null}
              />
            </>
          ) : (
            <Inventory
              recordHref={recordHref}
              refreshKey={decided + workWrites + recordSaves}
              selectedId={recordId}
            />
          )}
        </div>

        {recordId ? (
          <div className={recordOnly ? "min-w-0" : "hidden min-w-0 lg:block"}>
            <RecordPanel
              closeHref={workspaceHref(searchParams, { recordId: null })}
              conversationHref={workspaceHref(searchParams, { pane: "conversation" })}
              discussing={target.kind === "subscription" && target.id === recordId}
              editHref={`/ledger/${recordId}/edit`}
              key={recordId}
              onDiscuss={(detail) =>
                selectTarget({
                  kind: "subscription",
                  id: detail.id,
                  provider: detail.provider.value ?? "",
                })
              }
              onSaved={() => setRecordSaves((value) => value + 1)}
              recordId={recordId}
              refreshKey={decided + workWrites}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
