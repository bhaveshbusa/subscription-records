"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

import { LedgerSections } from "./ledger-sections";
import { ProposalInbox } from "./proposal-inbox";

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
 * Inbox is one page: capture at the top, and everything a capture can produce
 * below it. The pieces are siblings rather than nested, so a proposal is only
 * ever rendered once — in Proposals — however it got there.
 *
 * The two counters here are the wiring between them. A capture raises pending
 * proposals, so Proposals re-reads; a decision on a proposal can write a ledger
 * row, so the projected sections re-read. Neither holds a copy of the other's
 * data, which is why re-reading is all the coordination they need.
 *
 * What the composer is about lives in the URL (`?about=…`), so a reload, a
 * shared link, or a return from Subscriptions lands on the same target; the
 * last selection is also kept locally for a return to a bare `/inbox`. The
 * server resolves the id on every request, so a target that has since been
 * decided or answered is cleared here rather than trusted.
 */
export function InboxWorkbench() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [captured, setCaptured] = useState(0);
  const [decided, setDecided] = useState(0);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const urlTarget = useMemo(() => targetFromSearch(searchParams), [searchParams]);
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

  /** A bare `/inbox` after a reload or a visit picks the last target back up. */
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

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="sticky top-0 z-10 -mx-2 bg-[#f5f3ef]/95 px-2 pb-4 pt-6 backdrop-blur">
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

      <ProposalInbox
        onDecided={onDecided}
        onDiscuss={(proposal) => selectTarget(proposalTarget(proposal))}
        refreshKey={captured}
        selectedId={target.kind === "proposal" ? target.id : null}
      />
      <LedgerSections
        onAnswerQuestion={(question) => selectTarget(questionTarget(question))}
        onDiscussSubscription={(id, provider) =>
          selectTarget({ kind: "subscription", id, provider })
        }
        onQuestionChanged={onQuestionChanged}
        refreshKey={captured + decided}
        replyToId={target.kind === "question" ? target.id : null}
        selectedSubscriptionId={target.kind === "subscription" ? target.id : null}
      />
    </div>
  );
}
