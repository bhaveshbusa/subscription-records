import { describe, expect, it } from "vitest";

import type { ConversationTurn } from "@/lib/capture/conversation";
import type { TargetDescriptor } from "@/lib/capture/target-fields";
import type { ProposalView } from "@/lib/proposals/projection";

import {
  partitionTurnOutcomes,
  proposalOutcomeLabel,
  questionOutcomeLabel,
  sourceNeedsDisclosure,
  turnSourceLabel,
  turnSummary,
} from "./conversation-view";

function proposal(id: string, provider: string, subscriptionId: string | null = null): ProposalView {
  return {
    id,
    kind: "create",
    state: "pending",
    subscriptionId,
    subscriptionProvider: subscriptionId ? provider : null,
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

function turn(
  content: string,
  proposals: ProposalView[] = [],
  questions: ConversationTurn["questions"] = [],
): ConversationTurn {
  return {
    captureId: "capture-1",
    kind: "text",
    content,
    fileName: null,
    sentAt: "2026-09-14T00:00:00.000Z",
    target: { subscriptionId: null, proposalId: null, questionId: null },
    proposals,
    questions,
  };
}

const netflix: TargetDescriptor = {
  kind: "subscription",
  id: "sub-netflix",
  provider: "Netflix",
};

describe("conversation view", () => {
  it("summarises a multi-item paste without rewriting the stored source", () => {
    const pasted = turn("Netflix\nSpotify\nNotion\n1Password");

    expect(turnSummary(pasted)).toBe("Netflix · 4 items captured");
    expect(turnSourceLabel(pasted)).toBe("Netflix\nSpotify\nNotion\n1Password");
    expect(sourceNeedsDisclosure(pasted, netflix)).toBe(true);
  });

  it("keeps a short targeted reply as the summary", () => {
    const reply = turn("£12 monthly");

    expect(turnSummary(reply)).toBe("£12 monthly");
    expect(sourceNeedsDisclosure(reply, netflix)).toBe(false);
  });

  it("labels applied and rejected outcomes without rewriting the capture", () => {
    expect(proposalOutcomeLabel("accepted")).toBe("Applied");
    expect(proposalOutcomeLabel("rejected")).toBe("Rejected — nothing changed");
    expect(proposalOutcomeLabel("superseded")).toBe("Replaced by a later card");
    expect(questionOutcomeLabel("deferred")).toBe("Deferred — still available here");
  });

  it("shows outcomes for the selected holding and keeps others for source disclosure", () => {
    const pasted = turn("Netflix\nSpotify", [
      proposal("p-netflix", "Netflix", "sub-netflix"),
      proposal("p-spotify", "Spotify", "sub-spotify"),
    ]);
    const split = partitionTurnOutcomes(pasted, netflix);

    expect(split.relevantProposals.map((row) => row.id)).toEqual(["p-netflix"]);
    expect(split.otherProposals.map((row) => row.id)).toEqual(["p-spotify"]);
    expect(sourceNeedsDisclosure(pasted, netflix)).toBe(true);
  });
});
