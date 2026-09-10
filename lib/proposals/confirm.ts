import { z } from "zod";

import {
  AUTO_RENEWALS,
  CADENCES,
  calendarDateSchema,
  REVIEW_STATUSES,
} from "@/lib/subscriptions/params";

/**
 * The terms a person typed or ticked on the card as they accepted it. This is
 * the only route to `confirmed` for money and dates: a payload cannot ask for
 * it, and an extractor cannot reach it.
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

/** Accept with no body at all is the plain "accept as proposed" it always was. */
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
