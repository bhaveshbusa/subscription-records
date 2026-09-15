"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { CaptureComposer } from "@/components/capture/capture-composer";
import { Feedback } from "@/components/ui/foundations";
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
import {
  ledgerViewSearch,
  parseLedgerView,
  type LedgerView,
} from "@/lib/subscriptions/ledger-view";
import {
  parseWorkspaceState,
  workspaceSearch,
  type WorkspaceState,
} from "@/lib/workspace/view";

import { SubscriptionList } from "./subscription-list";

const ALL: TargetDescriptor = { kind: "all" };

function followUpTarget(
  result: ChatCaptureResult,
): Extract<TargetDescriptor, { kind: "question" }> | null {
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
 * The workspace: the general capture box, and under it the one list of
 * subscriptions with its four filters. A subscription opens inline, and the
 * reviews, questions, reminders and conversation about it open with it.
 *
 * Nothing here owns anyone else's data. A capture raises proposals, a decision
 * or an edit writes a ledger row, and the list re-reads on the one counter
 * they all bump — reading again is what keeps every row telling the same story.
 *
 * Filter, open row, composer target and ledger view all live in the URL, so a
 * reload or a shared link lands on the same place; drafts are keyed by target
 * in storage, so opening another row and coming back finds what was typed. Ids
 * in the URL are never trusted: the server resolves them per session user, and
 * a target that has since been decided or answered is cleared here.
 */
export function WorkspaceShell({ account }: { account?: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [writes, setWrites] = useState(0);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const urlTarget = useMemo(() => targetFromSearch(searchParams), [searchParams]);
  const state = useMemo(() => parseWorkspaceState(searchParams), [searchParams]);
  const ledgerView = useMemo(() => parseLedgerView(searchParams), [searchParams]);
  const restored = useRef(false);
  /** The target the last navigation asked for, ahead of the URL catching up. */
  const intendedKey = useRef<string | null>(null);

  const onWritten = useCallback(() => setWrites((value) => value + 1), []);

  /** One place writes the URL, so a filter change and a target change never race. */
  const navigate = useCallback(
    (patch: Partial<WorkspaceState>, next?: TargetDescriptor) => {
      const params = new URLSearchParams(searchParams.toString());

      if (next) {
        const search = targetToSearch(next);

        if (search) {
          params.set(ABOUT_PARAM, search);
        } else {
          params.delete(ABOUT_PARAM);
        }

        intendedKey.current = targetKey(next);

        try {
          writeSelectedTarget(window.localStorage, next);
        } catch {
          /* a browser without storage still has the URL */
        }
      }

      const query = workspaceSearch(params, patch);

      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );
  const selectTarget = useCallback(
    (next: TargetDescriptor) => {
      setNotice(null);
      navigate({}, next);
    },
    [navigate],
  );
  const href = useCallback(
    (patch: Partial<WorkspaceState>) => {
      const query = workspaceSearch(searchParams, patch);

      return query ? `${pathname}?${query}` : pathname;
    },
    [pathname, searchParams],
  );
  const onLedgerView = useCallback(
    (patch: Partial<LedgerView>) => {
      const query = ledgerViewSearch(searchParams, { ...ledgerView, ...patch });

      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [ledgerView, pathname, router, searchParams],
  );

  /**
   * A bare workspace URL after a reload picks the last target up — and opens
   * the subscription it was about, since the composer for it lives there.
   */
  useEffect(() => {
    if (restored.current) {
      return;
    }

    restored.current = true;

    if (urlTarget || searchParams.has(ABOUT_PARAM) || state.recordId || state.draftId) {
      return;
    }

    let stored: TargetDescriptor | null = null;

    try {
      stored = readSelectedTarget(window.localStorage);
    } catch {
      stored = null;
    }

    if (!stored || stored.kind === "all") {
      return;
    }

    if (stored.kind === "subscription") {
      navigate({ recordId: stored.id, draftId: null }, stored);
    } else if (stored.subscriptionId) {
      navigate({ recordId: stored.subscriptionId, draftId: null }, stored);
    } else {
      navigate({ recordId: null, draftId: stored.id }, stored);
    }
  }, [urlTarget, searchParams, state.recordId, state.draftId, navigate]);

  /** The resolved words for the target and the turns already said about it. */
  const selectedKey = urlTarget ? targetKey(urlTarget) : "all";

  useEffect(() => {
    if (!urlTarget) {
      return;
    }

    const controller = new AbortController();

    intendedKey.current = selectedKey;

    const params = new URLSearchParams(
      Object.entries(targetInput(urlTarget)).filter((entry): entry is [string, string] =>
        typeof entry[1] === "string",
      ),
    );

    fetch(`/api/conversation?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 404 || response.status === 409) {
          /** Gone because of a decision that already moved on: nothing to clear. */
          if (intendedKey.current !== selectedKey) {
            return;
          }

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
  }, [selectedKey, urlTarget, writes, selectTarget]);

  /** The server's words for the target once read; the URL's id until then. */
  const resolved =
    conversation && targetKey(conversation.target) === selectedKey ? conversation : null;
  const target = resolved?.target ?? urlTarget ?? ALL;
  const conversationLoading = urlTarget !== null && resolved === null;

  /**
   * A general capture lands under Pending reviews. One card opens on its own;
   * a question the capture raised opens where it will be answered. Once the
   * row is open the box has nothing to add, so it reports the result as shown.
   */
  const onGeneralCapture = useCallback(
    (result: ChatCaptureResult): boolean => {
      onWritten();

      const asked = followUpTarget(result);

      if (asked) {
        navigate({ recordId: null, draftId: asked.id }, asked);

        return true;
      }

      if (result.proposals.length === 1) {
        const [proposal] = result.proposals;

        if (proposal.subscriptionId) {
          navigate(
            { filter: "reviews", recordId: proposal.subscriptionId, draftId: null },
            {
              kind: "subscription",
              id: proposal.subscriptionId,
              provider: proposal.subscriptionProvider ?? "",
            },
          );
        } else {
          navigate(
            { filter: "reviews", recordId: null, draftId: proposal.id },
            {
              kind: "proposal",
              id: proposal.id,
              provider: proposal.payload?.provider?.value ?? "",
              subscriptionId: null,
            },
          );
        }
      } else if (result.proposals.length > 1) {
        navigate({ filter: "reviews" });
      }

      return result.proposals.length > 0;
    },
    [navigate, onWritten],
  );

  /**
   * A capture inside an open row stays on that row, where its card or question
   * appears; a question it raises is selected.
   */
  const onContextCapture = useCallback(
    (result: ChatCaptureResult): boolean => {
      onWritten();

      const asked = followUpTarget(result);

      if (asked) {
        selectTarget(asked);
      }

      return asked !== null || result.proposals.length > 0;
    },
    [onWritten, selectTarget],
  );

  return (
    <div className="workspace-shell">
      <a className="skip-link ui-button ui-button--primary" href="#subscriptions">
        Skip to subscriptions
      </a>
      <header className="workspace-top">
        <h1>Subscriptions</h1>
        <div className="workspace-top-actions">
          <Link className="ui-button ui-button--quiet" href="/ledger/new">
            Add a subscription
          </Link>
          {account}
        </div>
      </header>

      <div>
        {notice ? (
          <div className="mb-3">
            <Feedback tone="info">{notice}</Feedback>
          </div>
        ) : null}
        <details className="workspace-capture">
          <summary>
            Capture a subscription
            <span className="workspace-capture-hint">
              A note, list, file or voice memo — it comes back for review.
            </span>
          </summary>
          <div className="workspace-capture-body">
            <CaptureComposer key="all" onCaptured={onGeneralCapture} surface="list" target={ALL} />
          </div>
        </details>
      </div>

      <SubscriptionList
        conversation={resolved?.turns ?? []}
        conversationLoading={conversationLoading}
        href={href}
        ledgerView={ledgerView}
        onCaptured={onContextCapture}
        onLedgerView={onLedgerView}
        onNavigate={navigate}
        onSelectTarget={selectTarget}
        onWritten={onWritten}
        refreshKey={writes}
        state={state}
        target={target}
      />
    </div>
  );
}
