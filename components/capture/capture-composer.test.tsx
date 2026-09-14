import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CaptureComposer } from "@/components/capture/capture-composer";
import { ConversationPanel } from "@/components/capture/conversation-panel";
import { InboxQuestionRow } from "@/components/inbox/question-row";
import type { ConversationTurn } from "@/lib/capture/conversation";
import type { InboxQuestion } from "@/lib/inbox/query";
import type { ProposalView } from "@/lib/proposals/projection";

function proposal(id: string, provider: string, subscriptionId: string): ProposalView {
  return {
    id,
    kind: "create",
    state: "pending",
    subscriptionId,
    subscriptionProvider: provider,
    rationale: "Synthetic conversation fixture.",
    confidence: null,
    createdAt: "2026-09-14T00:00:00.000Z",
    decidedAt: null,
    appliable: true,
    payload: { provider: { value: provider, status: "proposed" } },
    payloadIssues: [],
    likelyMatches: [],
    draftScope: `draft:${provider.toLowerCase()}|`,
  };
}

describe("compact capture and questions", () => {
  it("shows one list-level target without repeating the capture title", () => {
    const html = renderToStaticMarkup(
      <CaptureComposer onCaptured={() => undefined} surface="list" />,
    );

    expect(html).toContain("All subscriptions");
    expect(html).toContain("How capture works");
    expect(html).toContain("Add screenshot or PDF");
    expect(html).toContain("Record a voice note");
    expect(html).toContain("Note, list, file or voice");
    expect(html).not.toContain("Capture a subscription");
    expect(html).not.toContain("About all subscriptions");
  });

  it("shows one record target and conversation for the selected holding", () => {
    const html = renderToStaticMarkup(
      <CaptureComposer
        composerId="composer-sub-netflix"
        onCaptured={() => undefined}
        target={{ kind: "subscription", id: "sub-netflix", provider: "Netflix" }}
      />,
    );

    expect(html).toContain('id="composer-sub-netflix"');
    expect(html).toContain("Netflix");
    expect(html).toContain("Message about this");
    expect(html).not.toContain("About Netflix");
    expect(html).not.toContain("The Netflix card");
  });

  it("names the exact question target and keeps a way to reset scope", () => {
    const html = renderToStaticMarkup(
      <CaptureComposer
        home={{ kind: "subscription", id: "sub-juniper", provider: "Juniper Cloud" }}
        onCaptured={() => undefined}
        target={{
          kind: "question",
          id: "q-1",
          provider: "Juniper Cloud",
          question: "What does Juniper Cloud cost?",
          subscriptionId: "sub-juniper",
        }}
      />,
    );

    expect(html).toContain("What does Juniper Cloud cost?");
    expect(html).toContain("Answer this question");
    expect(html).toContain("Back to Juniper Cloud");
    expect((html.match(/What does Juniper Cloud cost\?/g) ?? []).length).toBe(1);
  });

  it("summarises a multi-item capture and keeps other services in original capture", () => {
    const turn: ConversationTurn = {
      captureId: "capture-1",
      kind: "text",
      content: "Netflix\nSpotify\nNotion",
      fileName: null,
      sentAt: "2026-09-14T00:00:00.000Z",
      target: { subscriptionId: null, proposalId: null, questionId: null },
      proposals: [
        proposal("p-netflix", "Netflix", "sub-netflix"),
        proposal("p-spotify", "Spotify", "sub-spotify"),
      ],
      questions: [],
    };
    const html = renderToStaticMarkup(
      <ConversationPanel
        loading={false}
        target={{ kind: "subscription", id: "sub-netflix", provider: "Netflix" }}
        turns={[turn]}
      />,
    );

    expect(html).toContain("Netflix · 3 items captured");
    expect(html).toContain("Pending — waiting for your decision");
    expect(html).toContain("Original capture");
    expect(html).toContain("Spotify");
  });

  it("keeps a deferred question reachable with Later copy that promises no date", () => {
    const question: InboxQuestion = {
      id: "q-1",
      reason: "amount",
      state: "deferred",
      provider: "Juniper Cloud",
      question: "What does Juniper Cloud cost?",
      subscriptionId: "sub-juniper",
      scopeKey: "holding:sub-juniper",
      updatedAt: "2026-09-14T00:00:00.000Z",
    };
    const html = renderToStaticMarkup(
      <InboxQuestionRow
        onAnswer={() => undefined}
        onDefer={() => undefined}
        question={question}
      />,
    );

    expect(html).toContain("Deferred — still available here");
    expect(html).toContain("Answer");
    expect(html).not.toContain("Later");
    expect(html).not.toContain("Put off until you bring it up");
    expect(html).not.toContain("snooze");
  });
});
