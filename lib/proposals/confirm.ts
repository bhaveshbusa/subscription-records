import { z } from "zod";

import {
  AUTO_RENEWALS,
  CADENCES,
  calendarDateSchema,
  REVIEW_STATUSES,
} from "@/lib/subscriptions/params";

import type { ProposalPayload } from "./payload";

/**
 * The terms a person typed or ticked on the card as they accepted it. This is
 * the only route to `confirmed` for money and dates: a payload cannot ask for
 * it, and an extractor cannot reach it.
 *
 * [SUB-87](https://linear.app/lets-play-match/issue/SUB-87/accept-confirms-proposal-terms-and-remove-per-field-confirm-on-cards):
 * Accept itself confirms every money/date/auto-renewal value present on the
 * proposal (after Edits). Callers merge those via {@link confirmTermsOnAccept}.
 */
export const confirmedTermsSchema = z
  .object({
    /**
     * The status shown on the card, as the person accepting it left it. Status
     * is theirs to set - they are the one who knows whether they hold the thing
     * - so it arrives `confirmed` and confirms nothing else. Ending a
     * subscription is a lifecycle change with its own timing and is not here.
     */
    subscriptionStatus: z.enum(REVIEW_STATUSES).optional(),
    /**
     * The provider named on the card is right. Identity is a name, not a
     * price, so there is nothing to type: `true` marks the payload's provider
     * confirmed. Naming a different provider is a retarget, not a confirm.
     */
    provider: z.literal(true).optional(),
    amountMinor: z.number().int().min(0).max(2_000_000_000).optional(),
    currency: z.string().trim().length(3).toUpperCase().optional(),
    cadence: z.enum(CADENCES).optional(),
    nextRenewal: calendarDateSchema.optional(),
    trialEndsOn: calendarDateSchema.optional(),
    autoRenewal: z.enum(AUTO_RENEWALS).optional(),
  })
  .strict()
  .refine((terms) => Object.keys(terms).length > 0, {
    message: "confirm needs at least one field",
  });

export const acceptBodySchema = z
  .object({ confirm: confirmedTermsSchema.optional() })
  .strict();

export type ConfirmedTerms = z.infer<typeof confirmedTermsSchema>;

export type AcceptBodyResult =
  | { success: true; confirm: ConfirmedTerms | undefined }
  | { success: false; issues: { field: string; message: string }[] };

/** Accept with no body at all still confirms present terms via {@link confirmTermsOnAccept}. */
export function parseAcceptBody(body: unknown): AcceptBodyResult {
  if (body === null || body === undefined) {
    return { success: true, confirm: undefined };
  }

  const parsed = acceptBodySchema.safeParse(body);

  if (!parsed.success) {
    return {
      success: false,
      issues: parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || "body",
        message: issue.message,
      })),
    };
  }

  return { success: true, confirm: parsed.data.confirm };
}

/**
 * Accept confirms exactly the money/date/auto-renewal values on the proposal
 * after any Edits. Status and provider are not auto-confirmed here: status is
 * established on create separately, and a status-only/lifecycle accept must not
 * confirm money. Cadence does not pull in auto-renewal unless auto-renewal is
 * on the payload or the edit set.
 */
export function confirmTermsOnAccept(
  payload: ProposalPayload,
  edits?: ConfirmedTerms,
): ConfirmedTerms | undefined {
  const confirm: ConfirmedTerms = {};

  const amount = edits?.amountMinor ?? payload.amountMinor?.value;
  if (amount !== undefined) {
    confirm.amountMinor = amount;
    confirm.currency = (edits?.currency ?? payload.currency ?? "GBP").toUpperCase();
  }

  const cadence = edits?.cadence ?? payload.cadence?.value;
  if (cadence !== undefined) {
    confirm.cadence = cadence;
  }

  const nextRenewal = edits?.nextRenewal ?? payload.nextRenewal?.value;
  if (nextRenewal !== undefined) {
    confirm.nextRenewal = nextRenewal;
  }

  const trialEndsOn = edits?.trialEndsOn ?? payload.trialEndsOn?.value;
  if (trialEndsOn !== undefined) {
    confirm.trialEndsOn = trialEndsOn;
  }

  const autoRenewal = edits?.autoRenewal ?? payload.autoRenewal?.value;
  if (autoRenewal !== undefined) {
    confirm.autoRenewal = autoRenewal;
  }

  if (edits?.subscriptionStatus !== undefined) {
    confirm.subscriptionStatus = edits.subscriptionStatus;
  }

  if (edits?.provider === true) {
    confirm.provider = true;
  }

  return Object.keys(confirm).length === 0 ? undefined : confirm;
}
