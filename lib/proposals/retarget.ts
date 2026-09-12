import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";

import { resolveRecordedFieldQuestions } from "@/lib/capture/answered-fields";
import type { ExtractionCandidate } from "@/lib/capture/candidates";
import { draftScope, holdingScope } from "@/lib/capture/follow-up";
import {
  resemblingHoldings,
  resolveCandidate,
  strengthFor,
  toHoldingOption,
  type HoldingOption,
  type LedgerEntry,
  type MatchResolution,
} from "@/lib/capture/match";
import {
  answerQuestions,
  moveDraftQuestions,
  questionCandidate,
  type QuestionRow,
} from "@/lib/capture/questions";
import type { IdentityAnswer } from "@/lib/capture/reactivation";
import {
  describeHolding,
  insertCapture,
  loadLedger,
  loadLedgerRow,
  loadPendingProposals,
  pendingDraftKey,
  proposeAgainst,
  RATIONALE_MAX,
  type CaptureContext,
  type ChatCaptureResult,
  type RaisedKind,
} from "@/lib/capture/record";
import { proposals } from "@/lib/db/schema";
import { canonicalProvider, type WriteClient } from "@/lib/subscriptions/write";

import { claimPending, settle } from "./decide";
import {
  parseProposalPayload,
  type PayloadIssue,
  type ProposalPayload,
} from "./payload";
import { toProposalView, type ProposalRow } from "./projection";

/**
 * What a card correction is allowed to touch: identity only. `useExisting`
 * retargets the card at a holding the ledger already has; the other fields
 * correct what the capture heard and re-run matching. Money and dates are not
 * here — retargeting never confirms them.
 */
export type RetargetAction =
  | { useExisting: string }
  | { provider?: string; plan?: string | null; accountHint?: string | null };

const nullableCorrection = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullable();

export const retargetBodySchema = z
  .object({
    /** "This is my existing X": the holding the card should have pointed at. */
    useExisting: z.string().trim().uuid().optional(),
    provider: z.string().trim().min(1).max(120).optional(),
    plan: nullableCorrection(120).optional(),
    accountHint: nullableCorrection(120).optional(),
  })
  .strict()
  .refine(
    (body) =>
      Boolean(body.useExisting) !==
      (body.provider !== undefined ||
        body.plan !== undefined ||
        body.accountHint !== undefined),
    {
      message: "either useExisting or a field correction, not both",
      path: ["useExisting"],
    },
  );

export type RetargetBodyResult =
  | { success: true; action: RetargetAction }
  | { success: false; issues: { field: string; message: string }[] };

export function parseRetargetBody(body: unknown): RetargetBodyResult {
  const parsed = retargetBodySchema.safeParse(body);

  if (!parsed.success) {
    return {
      success: false,
      issues: parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || "body",
        message: issue.message,
      })),
    };
  }

  const { useExisting, ...corrections } = parsed.data;

  return {
    success: true,
    action: useExisting ? { useExisting } : corrections,
  };
}

/**
 * The reading a stored payload stands for, rebuilt so matching and the delta
 * can run over it again unchanged. The provider may be corrected; nothing else
 * about what the message said is touched — the payload's own trust labels stay
 * the ledger's business, and the extractor's lifecycle reading is not
 * recoverable from the payload (a `create` never stored one).
 */
export function candidateFromPayload(
  payload: ProposalPayload,
  row: Pick<ProposalRow, "confidence" | "rationale">,
): ExtractionCandidate {
  return {
    provider: payload.provider?.value ?? "",
    plan: payload.plan ?? null,
    accountHint: payload.accountHint ?? null,
    amountMinor: payload.amountMinor?.value ?? null,
    currency: payload.currency ?? null,
    cadence: payload.cadence?.value ?? null,
    nextRenewal: payload.nextRenewal?.value ?? null,
    paidOn: null,
    subscriptionStatus: payload.subscriptionStatus?.value ?? null,
    lifecycle: null,
    endsOn: payload.endsOn ?? null,
    trialEndsOn: payload.trialEndsOn?.value ?? null,
    autoRenewal: payload.autoRenewal?.value ?? null,
    reminderPreferences: payload.reminderPreferences ?? null,
    unsupportedStageOne: payload.unsupportedStageOne ?? null,
    confidence: row.confidence ?? "medium",
    evidence: row.rationale ?? "",
  };
}

/** The holdings a corrected identity still resembles, offered as retarget choices. */
function holdingsOffered(resolution: MatchResolution): LedgerEntry[] {
  switch (resolution.outcome) {
    case "matched":
      return [resolution.match.subscription];
    case "ambiguous":
      return resolution.options;
    case "unseen_account":
      return resolution.holdings;
    case "none":
      return [];
  }
}

export type RetargetError =
  | "not_found"
  | "not_pending"
  | "unsupported_kind"
  | "invalid_payload"
  | "subscription_not_found";

export type RetargetResult =
  | {
      ok: true;
      proposal: ProposalRow;
      /** The holding the card now points at, when it was retargeted. */
      subscriptionProvider: string | null;
      /** Holdings the corrected card still resembles — "Use existing …" choices. */
      options: HoldingOption[];
      /** Whether the card now targets a holding rather than staying a new draft. */
      retargeted: boolean;
    }
  | { ok: false; error: RetargetError; issues?: PayloadIssue[] };

/**
 * Points a pending `create` at a holding that is already in the ledger: the
 * message's facts are recomputed against that row, so the card becomes the
 * update it always meant — terms, status, or a reactivation — carrying a fresh
 * `target` for accept to recheck. The provider the card heard is never carried
 * over: the holding's name is the row's own.
 *
 * When the message had nothing the row lacks, there is no delta to propose:
 * the card is decided as "yes, that one" without touching the ledger.
 */
async function retargetDraftAt(
  client: WriteClient,
  options: {
    userId: string;
    /** The pending `create`, already claimed. */
    draft: ProposalRow;
    /** The draft scope its open questions were asked under. */
    from: string;
    candidate: ExtractionCandidate;
    row: LedgerEntry;
    note: string | null;
    now: Date;
  },
): Promise<{ proposal: ProposalRow }> {
  const { draft, row, now } = options;
  const { proposal } = proposeAgainst(options.candidate, row, now);
  const rationale = [draft.rationale, options.note]
    .filter((part): part is string => Boolean(part))
    .join("\n")
    .slice(0, RATIONALE_MAX);

  /**
   * The draft's open questions are now about this holding. Ones the holding
   * already answers — a term it records — close; the rest stay open on it.
   */
  await moveDraftQuestions(client, {
    userId: options.userId,
    from: options.from,
    to: { scope: holdingScope(row.id), provider: row.provider_display, subscriptionId: row.id },
    now,
  });
  await resolveRecordedFieldQuestions(client, { userId: options.userId, row, now });

  if (!proposal) {
    const settled = await settle(client, {
      id: draft.id,
      userId: options.userId,
      state: "accepted",
      subscriptionId: row.id,
      now,
    });

    return { proposal: settled };
  }

  const [updated] = await client
    .update(proposals)
    .set({
      kind: proposal.kind,
      payload: proposal.payload,
      subscription_id: row.id,
      rationale,
      updated_at: now,
    })
    .where(and(eq(proposals.user_id, options.userId), eq(proposals.id, draft.id)))
    .returning();

  return { proposal: updated ?? draft };
}

function correctionNote(corrected: string[]): string | null {
  return corrected.length ? `Corrected on the card: ${corrected.join(", ")}.` : null;
}

/**
 * Correcting the provider on a card, or picking "Use existing …", re-runs the
 * same identity matching capture ran: a correction that lands on one holding
 * retargets the card rather than rewriting its payload in place, and a
 * corrected name that still fits nothing stays a draft for a new holding.
 */
export async function retargetProposal(
  client: WriteClient,
  options: { userId: string; id: string; action: RetargetAction; now?: Date },
): Promise<RetargetResult> {
  const now = options.now ?? new Date();
  const claimed = await claimPending(client, { userId: options.userId, id: options.id });

  if (claimed === "not_found" || claimed === "not_pending") {
    return { ok: false, error: claimed };
  }

  if (claimed.kind !== "create") {
    return { ok: false, error: "unsupported_kind" };
  }

  const parsed = parseProposalPayload("create", claimed.payload);

  if (!parsed.success) {
    return { ok: false, error: "invalid_payload", issues: parsed.issues };
  }

  const heard = parsed.payload.provider?.value ?? "";
  const heardScope = draftScope(heard, parsed.payload.accountHint);
  /** The draft question "is this a duplicate?" was scoped to, if one is open. */
  const askedAbout = [{ reason: "duplicate" as const, scope: heardScope }];

  if ("useExisting" in options.action) {
    const [row] = await loadLedgerRow(client, options.userId, options.action.useExisting);

    if (!row) {
      return { ok: false, error: "subscription_not_found" };
    }

    const outcome = await retargetDraftAt(client, {
      userId: options.userId,
      draft: claimed,
      from: heardScope,
      candidate: candidateFromPayload(parsed.payload, claimed),
      row,
      note: `Heard as "${heard}"; retargeted at ${row.provider_display}.`,
      now,
    });

    await answerQuestions(client, { userId: options.userId, answered: askedAbout, now });

    return {
      ok: true,
      proposal: outcome.proposal,
      subscriptionProvider: row.provider_display,
      options: [],
      retargeted: true,
    };
  }

  const corrections = options.action;
  const payload: ProposalPayload = { ...parsed.payload };
  const corrected: string[] = [];

  if (corrections.provider !== undefined && corrections.provider !== heard) {
    /** The person typed this name themselves, so it is confirmed, never proposed. */
    payload.provider = { value: corrections.provider, status: "confirmed" };
    corrected.push(`provider "${heard}" → "${corrections.provider}"`);
  }

  if (corrections.plan !== undefined && corrections.plan !== (parsed.payload.plan ?? null)) {
    payload.plan = corrections.plan;
    corrected.push("plan");
  }

  if (
    corrections.accountHint !== undefined &&
    corrections.accountHint !== (parsed.payload.accountHint ?? null)
  ) {
    payload.accountHint = corrections.accountHint;
    corrected.push("account");
  }

  const candidate = candidateFromPayload(payload, claimed);
  const resolution = resolveCandidate(
    candidate,
    await loadLedger(client, options.userId),
  );

  if (resolution.outcome === "matched" && resolution.match.strength === "high") {
    const outcome = await retargetDraftAt(client, {
      userId: options.userId,
      draft: claimed,
      from: heardScope,
      candidate,
      row: resolution.match.subscription,
      note: correctionNote(corrected),
      now,
    });

    await answerQuestions(client, { userId: options.userId, answered: askedAbout, now });

    return {
      ok: true,
      proposal: outcome.proposal,
      subscriptionProvider: resolution.match.subscription.provider_display,
      options: [],
      retargeted: true,
    };
  }

  const note = correctionNote(corrected);
  let proposal = claimed;

  if (note) {
    /** The card is still a draft, now under its corrected name: its open questions go with it. */
    await moveDraftQuestions(client, {
      userId: options.userId,
      from: heardScope,
      to: { scope: draftScope(candidate.provider, candidate.accountHint), provider: candidate.provider },
      candidate,
      now,
    });

    const rationale = [claimed.rationale, note]
      .filter((part): part is string => Boolean(part))
      .join("\n")
      .slice(0, RATIONALE_MAX);

    const [updated] = await client
      .update(proposals)
      .set({ payload, rationale, updated_at: now })
      .where(and(eq(proposals.user_id, options.userId), eq(proposals.id, claimed.id)))
      .returning();

    proposal = updated ?? claimed;
  }

  return {
    ok: true,
    proposal,
    subscriptionProvider: null,
    options: holdingsOffered(resolution).map(toHoldingOption),
    retargeted: false,
  };
}

/**
 * The holdings a `duplicate` question is choosing between: everything that
 * resembles the heard name at all, since the question exists precisely for the
 * `medium` case `sameProvider` would miss.
 */
async function duplicateHoldings(
  client: Pick<NodePgDatabase, "select">,
  userId: string,
  providerCanonical: string,
): Promise<LedgerEntry[]> {
  return resemblingHoldings(providerCanonical, await loadLedger(client, userId));
}

/**
 * How the holdings on offer are named, so a reply like "the family one" can be
 * read against them without a round trip through extraction.
 */
export async function duplicateChoices(
  client: Pick<NodePgDatabase, "select">,
  userId: string,
  question: QuestionRow,
): Promise<string[]> {
  return (await duplicateHoldings(client, userId, question.provider_canonical)).map(
    describeHolding,
  );
}

/**
 * "Yes, that's the same one" answers a `duplicate` question by retargeting the
 * draft it was asked about at the holding it named — the message's facts are
 * recomputed against that row, so accepting still writes nothing unreviewed.
 * "No, a new one" closes the question and leaves the draft as its own holding.
 * When the named holding no longer stands the question is asked again rather
 * than silently pointed somewhere else; when the card was already decided the
 * answer raises the delta against the holding on its own.
 */
export async function recordDuplicateAnswer(
  client: WriteClient,
  options: {
    userId: string;
    text: string;
    question: QuestionRow;
    identity: IdentityAnswer;
    now?: Date;
    context?: CaptureContext | null;
  },
): Promise<ChatCaptureResult> {
  const now = options.now ?? new Date();
  const captureId = await insertCapture(client, {
    userId: options.userId,
    text: options.text,
    context: options.context,
  });
  const { question } = options;
  const candidate = questionCandidate(question);
  const base = { captureId, mode: null, notice: null, followUp: null, deferred: null };
  const answered = { reason: "duplicate" as const, scope: question.scope_key };
  const holdings = await duplicateHoldings(client, options.userId, question.provider_canonical);
  const draftPart = question.scope_key.startsWith("draft:")
    ? question.scope_key.slice("draft:".length)
    : null;

  if (options.identity === "new") {
    await answerQuestions(client, { userId: options.userId, answered: [answered], now });

    const draft = draftPart
      ? (await loadPendingProposals(client, options.userId)).find(
          (row) => pendingDraftKey(row) === draftPart,
        )
      : undefined;

    return { ...base, proposals: draft ? [toProposalView(draft, null)] : [], matches: [] };
  }

  let target: LedgerEntry | null = null;

  if (options.identity === "same") {
    /** The question named one holding; "same" points the draft at it while it stands. */
    const [named] = question.subscription_id
      ? await loadLedgerRow(client, options.userId, question.subscription_id)
      : [];

    target = named ?? (holdings.length === 1 ? holdings[0] : null);
  } else {
    const chosen = options.identity.option.toLowerCase();
    const named = holdings.filter((row) => describeHolding(row).toLowerCase() === chosen);

    target = named.length === 1 ? named[0] : null;
  }

  if (!target) {
    if (holdings.length === 0) {
      /** The holding it asked about is gone, so the question is moot, not open. */
      await answerQuestions(client, { userId: options.userId, answered: [answered], now });
    }

    return {
      ...base,
      proposals: [],
      matches: [],
      followUp: holdings.length
        ? {
            id: question.id,
            reason: "duplicate" as const,
            provider: question.provider_display,
            scope: question.scope_key,
            question: question.question,
          }
        : null,
    };
  }

  await answerQuestions(client, { userId: options.userId, answered: [answered], now });

  const provider = candidate?.provider ?? question.provider_display;
  const match = {
    candidateProvider: provider,
    subscriptionId: target.id,
    provider: target.provider_display,
    strength: strengthFor(canonicalProvider(provider), target.provider_canonical) ?? ("medium" as const),
    proposalId: null as string | null,
    proposalKind: null as ChatCaptureResult["matches"][number]["proposalKind"],
  };

  const draft = draftPart
    ? (await loadPendingProposals(client, options.userId)).find(
        (row) => pendingDraftKey(row) === draftPart,
      )
    : undefined;

  if (draft) {
    const claimed = await claimPending(client, { userId: options.userId, id: draft.id });

    if (claimed !== "not_found" && claimed !== "not_pending") {
      const parsed = parseProposalPayload("create", claimed.payload);

      if (parsed.success) {
        const outcome = await retargetDraftAt(client, {
          userId: options.userId,
          draft: claimed,
          from: question.scope_key,
          candidate: candidateFromPayload(parsed.payload, claimed),
          row: target,
          note: `Answered the same subscription: retargeted at ${target.provider_display}.`,
          now,
        });

        return {
          ...base,
          proposals: [toProposalView(outcome.proposal, target.provider_display)],
          matches: [
            {
              ...match,
              proposalId: outcome.proposal.id,
              /** A retargeted draft carries only a raised kind. */
              proposalKind: outcome.proposal.kind as RaisedKind,
            },
          ],
        };
      }
    }
  }

  /** The card is gone or was already decided: raise the delta afresh. */
  if (!candidate) {
    return { ...base, proposals: [], matches: [match] };
  }

  const { proposal } = proposeAgainst(candidate, target, now);

  if (!proposal) {
    return { ...base, proposals: [], matches: [match] };
  }

  const [row] = await client
    .insert(proposals)
    .values({
      user_id: options.userId,
      subscription_id: target.id,
      kind: proposal.kind,
      state: "pending" as const,
      payload: proposal.payload,
      rationale: options.text.slice(0, 500),
      confidence: candidate.confidence,
      capture_id: captureId,
    })
    .returning();

  return {
    ...base,
    proposals: [toProposalView(row, target.provider_display)],
    matches: [{ ...match, proposalId: row.id, proposalKind: proposal.kind }],
  };
}
