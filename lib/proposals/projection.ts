import type { InferSelectModel } from "drizzle-orm";

import { draftScope } from "@/lib/capture/follow-up";
import type { HoldingOption } from "@/lib/capture/match";
import type { proposals } from "@/lib/db/schema";

import {
  APPLIABLE_PROPOSAL_KINDS,
  parseProposalPayload,
  type PayloadIssue,
  type ProposalKind,
  type ProposalPayload,
  type ProposalState,
} from "./payload";

export type ProposalRow = InferSelectModel<typeof proposals>;

export type ProposalView = {
  id: string;
  kind: ProposalKind;
  state: ProposalState;
  subscriptionId: string | null;
  subscriptionProvider: string | null;
  rationale: string | null;
  confidence: ProposalRow["confidence"];
  createdAt: string;
  decidedAt: string | null;
  /** Whether accept can apply this kind yet; reject always can. */
  appliable: boolean;
  payload: ProposalPayload | null;
  payloadIssues: PayloadIssue[];
  /**
   * On a pending `create`, the holdings the card's provider already resembles.
   * Each is a "Use existing …" choice: retargeting the card at one updates that
   * holding instead of adding a second record of the same thing.
   */
  likelyMatches: HoldingOption[];
  /**
   * On a `create` about no holding, the question scope its provider and
   * account name — what a question asked of this draft is keyed by. Null for
   * a card about a holding, or one whose provider cannot be read.
   */
  draftScope: string | null;
};

export function isAppliableKind(kind: ProposalKind): boolean {
  return (APPLIABLE_PROPOSAL_KINDS as readonly ProposalKind[]).includes(kind);
}

export function toProposalView(
  row: ProposalRow,
  subscriptionProvider: string | null = null,
  likelyMatches: HoldingOption[] = [],
): ProposalView {
  const parsed = parseProposalPayload(row.kind, row.payload);
  const provider = parsed.success ? parsed.payload.provider?.value : undefined;

  return {
    id: row.id,
    kind: row.kind,
    state: row.state,
    subscriptionId: row.subscription_id,
    subscriptionProvider,
    rationale: row.rationale,
    confidence: row.confidence,
    createdAt: row.created_at.toISOString(),
    decidedAt: row.decided_at?.toISOString() ?? null,
    appliable: isAppliableKind(row.kind),
    payload: parsed.success ? parsed.payload : null,
    payloadIssues: parsed.success ? [] : parsed.issues,
    likelyMatches,
    draftScope:
      row.subscription_id === null && parsed.success && provider
        ? draftScope(provider, parsed.payload.accountHint)
        : null,
  };
}
