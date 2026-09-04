import { z } from "zod";

import {
  CADENCES,
  calendarDateSchema,
  SUBSCRIPTION_STATUSES,
} from "@/lib/subscriptions/params";

export const CONFIDENCES = ["low", "medium", "high"] as const;

/** A message about twelve services is realistic; a hundred is a paste accident. */
export const MAX_CANDIDATES = 25;

/**
 * One subscription an extractor believes the message mentions. `evidence` is the
 * span of the message it came from, so a card can show why it exists, and every
 * money or date field stays optional: a missing price is a question, not a guess.
 */
export const extractionCandidateSchema = z.object({
  provider: z.string().trim().min(1).max(120),
  plan: z.string().trim().max(120).nullish(),
  accountHint: z.string().trim().max(120).nullish(),
  amountMinor: z.number().int().min(0).max(2_000_000_000).nullish(),
  currency: z.string().trim().length(3).toUpperCase().nullish(),
  cadence: z.enum(CADENCES).nullish(),
  nextRenewal: calendarDateSchema.nullish(),
  /** The day a stated payment happened; used to infer next due, not stored as a charge. */
  paidOn: calendarDateSchema.nullish(),
  subscriptionStatus: z.enum(SUBSCRIPTION_STATUSES).nullish(),
  /**
   * What the message says has happened to the subscription's life. Only ever
   * something already done: an intention to cancel, or not using the service,
   * is not a lifecycle claim.
   */
  lifecycle: z.enum(["cancelled", "cancel_scheduled", "lapsed"]).nullish(),
  /** The day a cancellation takes effect, when the message states it. */
  endsOn: calendarDateSchema.nullish(),
  confidence: z.enum(CONFIDENCES),
  evidence: z.string().trim().min(1).max(500),
});

export const extractionResultSchema = z.object({
  candidates: z.array(extractionCandidateSchema).max(MAX_CANDIDATES),
});

export type ExtractionCandidate = z.infer<typeof extractionCandidateSchema>;
export type ExtractionResult = z.infer<typeof extractionResultSchema>;

export const CANDIDATE_TOOL_NAME = "record_subscription_candidates";

/**
 * The same shape as `extractionResultSchema`, handed to the model as a tool so
 * it answers with structured candidates instead of prose. The Zod schema is
 * still the authority: a reply is parsed before it reaches the database.
 */
export const candidateToolInputSchema = {
  type: "object" as const,
  properties: {
    candidates: {
      type: "array",
      maxItems: MAX_CANDIDATES,
      description:
        "One entry per subscription the message mentions. A bare list of names yields one entry per name.",
      items: {
        type: "object",
        properties: {
          provider: {
            type: "string",
            description: "Service name as a person would write it, e.g. Netflix.",
          },
          plan: { type: ["string", "null"], description: "Plan or tier, if stated." },
          accountHint: {
            type: ["string", "null"],
            description: "Which account pays, if stated, e.g. a masked card or email.",
          },
          amountMinor: {
            type: ["integer", "null"],
            description:
              "Price in minor units (pence, cents). Only when the message states a price; never estimated.",
          },
          currency: {
            type: ["string", "null"],
            description: "ISO 4217 code for the stated price, e.g. GBP.",
          },
          cadence: { type: ["string", "null"], enum: [...CADENCES, null] },
          nextRenewal: {
            type: ["string", "null"],
            description: "Stated next renewal date as YYYY-MM-DD. Never estimated.",
          },
          paidOn: {
            type: ["string", "null"],
            description:
              "The day a receipt or message says was paid, as YYYY-MM-DD. Used to infer the next due date. Not a payment to store. `amountMinor` is the current cost.",
          },
          subscriptionStatus: {
            type: ["string", "null"],
            enum: [...SUBSCRIPTION_STATUSES, null],
            description:
              "The state the message says the subscription is in now, e.g. `active` when it says the person has subscribed again to something they had stopped.",
          },
          lifecycle: {
            type: ["string", "null"],
            enum: ["cancelled", "cancel_scheduled", "lapsed", null],
            description:
              "Only when the message says this already happened. `cancelled` when the subscription has stopped now; `cancel_scheduled` when it was cancelled but runs to the end of the paid period; `lapsed` when it stopped without anyone cancelling, e.g. a payment failed or it expired. Leave null when the message says the person wants to, should, or is about to cancel, and when it only says they do not use the service.",
          },
          endsOn: {
            type: ["string", "null"],
            description:
              "The day a cancellation takes effect, as YYYY-MM-DD, only when the message states it.",
          },
          confidence: { type: "string", enum: [...CONFIDENCES] },
          evidence: {
            type: "string",
            description: "The words from the message this candidate came from.",
          },
        },
        required: ["provider", "confidence", "evidence"],
      },
    },
  },
  required: ["candidates"],
};

/** Same canonical form the ledger uses, so duplicates collapse per provider. */
export function dedupeCandidates(
  candidates: ExtractionCandidate[],
  canonical: (provider: string) => string,
): ExtractionCandidate[] {
  const byProvider = new Map<string, ExtractionCandidate>();

  for (const candidate of candidates) {
    const key = canonical(candidate.provider);

    if (key.length > 0 && !byProvider.has(key)) {
      byProvider.set(key, candidate);
    }
  }

  return [...byProvider.values()].slice(0, MAX_CANDIDATES);
}
