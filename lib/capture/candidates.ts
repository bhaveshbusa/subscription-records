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
  subscriptionStatus: z.enum(SUBSCRIPTION_STATUSES).nullish(),
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
          subscriptionStatus: {
            type: ["string", "null"],
            enum: [...SUBSCRIPTION_STATUSES, null],
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
