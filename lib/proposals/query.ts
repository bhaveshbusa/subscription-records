import { and, desc, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";

import { proposals, subscriptions } from "@/lib/db/schema";

import { PROPOSAL_STATES } from "./payload";
import { toProposalView, type ProposalView } from "./projection";

export type QueryClient = Pick<NodePgDatabase, "select">;

export const DEFAULT_PROPOSAL_LIMIT = 50;
export const MAX_PROPOSAL_LIMIT = 100;

const stateSchema = z
  .string()
  .transform((value) =>
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  )
  .pipe(z.array(z.enum(PROPOSAL_STATES)).min(1));

const proposalQuerySchema = z
  .object({
    state: stateSchema.optional(),
    limit: z
      .string()
      .regex(/^\d+$/, "must be a positive integer")
      .transform((value) => Number.parseInt(value, 10))
      .pipe(z.number().int().min(1).max(MAX_PROPOSAL_LIMIT))
      .optional(),
  })
  .transform((query) => ({
    state: query.state ?? (["pending"] as const),
    limit: query.limit ?? DEFAULT_PROPOSAL_LIMIT,
  }));

export type ProposalQuery = z.infer<typeof proposalQuerySchema>;
export type ProposalQueryResult =
  | { success: true; query: ProposalQuery }
  | { success: false; issues: { field: string; message: string }[] };

export function parseProposalQuery(searchParams: URLSearchParams): ProposalQueryResult {
  const raw: Record<string, string> = {};

  for (const key of ["state", "limit"]) {
    const value = searchParams.get(key);

    if (value !== null && value !== "") {
      raw[key] = value;
    }
  }

  const parsed = proposalQuerySchema.safeParse(raw);

  if (!parsed.success) {
    return {
      success: false,
      issues: parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || "query",
        message: issue.message,
      })),
    };
  }

  return { success: true, query: parsed.data };
}

/** Newest first, so a fresh proposal is the first thing in the inbox. */
export async function listProposals(
  client: QueryClient,
  options: { userId: string; query: ProposalQuery },
): Promise<ProposalView[]> {
  const rows = await client
    .select({ row: proposals, provider: subscriptions.provider_display })
    .from(proposals)
    .leftJoin(subscriptions, eq(subscriptions.id, proposals.subscription_id))
    .where(
      and(
        eq(proposals.user_id, options.userId),
        inArray(proposals.state, [...options.query.state]),
      ),
    )
    .orderBy(desc(proposals.created_at), desc(proposals.id))
    .limit(options.query.limit);

  return rows.map((entry) => toProposalView(entry.row, entry.provider));
}

/** Everything one capture proposed, so re-reading a screenshot replays its cards. */
export async function listCaptureProposals(
  client: QueryClient,
  options: { userId: string; captureId: string },
): Promise<ProposalView[]> {
  const rows = await client
    .select({ row: proposals, provider: subscriptions.provider_display })
    .from(proposals)
    .leftJoin(subscriptions, eq(subscriptions.id, proposals.subscription_id))
    .where(
      and(
        eq(proposals.user_id, options.userId),
        eq(proposals.capture_id, options.captureId),
      ),
    )
    .orderBy(desc(proposals.created_at), desc(proposals.id))
    .limit(MAX_PROPOSAL_LIMIT);

  return rows.map((entry) => toProposalView(entry.row, entry.provider));
}
