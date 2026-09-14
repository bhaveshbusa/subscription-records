import type { ConversationQuestion, ConversationTurn } from "@/lib/capture/conversation";
import type { TargetDescriptor } from "@/lib/capture/target-fields";
import type { ProposalView } from "@/lib/proposals/projection";

const OUTCOME_LABEL: Record<ProposalView["state"], string> = {
  pending: "Pending — waiting for your decision",
  accepted: "Applied",
  rejected: "Rejected — nothing changed",
  superseded: "Replaced by a later card",
};

const QUESTION_OUTCOME_LABEL: Record<ConversationQuestion["state"], string> = {
  asked: "Still open",
  deferred: "Deferred — still available here",
  answered: "Answered",
};

export function proposalOutcomeLabel(state: ProposalView["state"]): string {
  return OUTCOME_LABEL[state];
}

export function questionOutcomeLabel(state: ConversationQuestion["state"]): string {
  return QUESTION_OUTCOME_LABEL[state];
}

export function turnSourceLabel(turn: ConversationTurn): string {
  if (turn.kind === "text") {
    return turn.content ?? "";
  }

  const what = turn.kind === "audio" ? "Voice note" : turn.kind === "pdf" ? "PDF" : "Screenshot";

  return turn.fileName ? `${what}: ${turn.fileName}` : what;
}

/**
 * A short line for the selected holding. The original paste stays in source
 * disclosure; this does not rewrite stored capture content.
 */
export function turnSummary(turn: ConversationTurn): string {
  if (turn.kind !== "text") {
    return turnSourceLabel(turn);
  }

  const content = (turn.content ?? "").trim();

  if (content.length === 0) {
    return "Text capture";
  }

  const lines = content.split(/\n+/).map((line) => line.trim()).filter(Boolean);

  if (lines.length > 1) {
    return `${lines[0]} · ${lines.length} items captured`;
  }

  if (content.length > 140) {
    return `${content.slice(0, 137).trimEnd()}…`;
  }

  return content;
}

export function isProposalForTarget(
  proposal: ProposalView,
  target: TargetDescriptor,
): boolean {
  switch (target.kind) {
    case "all":
      return true;
    case "proposal":
      return proposal.id === target.id;
    case "subscription":
      return (
        proposal.subscriptionId === target.id ||
        proposal.subscriptionProvider === target.provider ||
        proposal.payload?.provider?.value === target.provider
      );
    case "question":
      return (
        (target.subscriptionId !== null && proposal.subscriptionId === target.subscriptionId) ||
        proposal.subscriptionProvider === target.provider ||
        proposal.payload?.provider?.value === target.provider
      );
  }
}

export function isQuestionForTarget(
  question: ConversationQuestion,
  target: TargetDescriptor,
): boolean {
  switch (target.kind) {
    case "all":
      return true;
    case "question":
      return question.id === target.id;
    case "subscription":
      return (
        question.subscriptionId === target.id || question.provider === target.provider
      );
    case "proposal":
      return question.provider === target.provider;
  }
}

export function partitionTurnOutcomes(
  turn: ConversationTurn,
  target: TargetDescriptor,
): {
  relevantProposals: ProposalView[];
  otherProposals: ProposalView[];
  relevantQuestions: ConversationQuestion[];
  otherQuestions: ConversationQuestion[];
} {
  const relevantProposals = turn.proposals.filter((proposal) =>
    isProposalForTarget(proposal, target),
  );
  const otherProposals = turn.proposals.filter(
    (proposal) => !isProposalForTarget(proposal, target),
  );
  const relevantQuestions = turn.questions.filter((question) =>
    isQuestionForTarget(question, target),
  );
  const otherQuestions = turn.questions.filter(
    (question) => !isQuestionForTarget(question, target),
  );

  return { relevantProposals, otherProposals, relevantQuestions, otherQuestions };
}

export function sourceNeedsDisclosure(
  turn: ConversationTurn,
  target: TargetDescriptor,
): boolean {
  const summary = turnSummary(turn);
  const source = turnSourceLabel(turn);
  const { otherProposals, otherQuestions } = partitionTurnOutcomes(turn, target);

  return (
    summary !== source || otherProposals.length > 0 || otherQuestions.length > 0
  );
}
