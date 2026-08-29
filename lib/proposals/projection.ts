import type { InferSelectModel } from "drizzle-orm";

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
};

export function isAppliableKind(kind: ProposalKind): boolean {
  return (APPLIABLE_PROPOSAL_KINDS as readonly ProposalKind[]).includes(kind);
}

export function toProposalView(
  row: ProposalRow,
  subscriptionProvider: string | null = null,
): ProposalView {
  const parsed = parseProposalPayload(row.kind, row.payload);

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
  };
}
