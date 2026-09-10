import { z } from "zod";

import { proposedReminderPreferencesSchema } from "@/lib/reminders/preferences";
import {
  AUTO_RENEWALS,
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
  lifecycle: z.enum(["cancelled", "cancel_scheduled"]).nullish(),
  /** The day a cancellation takes effect, when the message states it. */
  endsOn: calendarDateSchema.nullish(),
  /** Trial end is not subscription end and not next renewal. */
  trialEndsOn: calendarDateSchema.nullish(),
  /** Evidence of provider auto-renewal. Never inferred from cadence. */
  autoRenewal: z.enum(AUTO_RENEWALS).nullish(),
  /**
   * A user instruction to be reminded, not provider auto-renewal. Stays a
   * proposal until the card is accepted.
   */
  reminderPreferences: proposedReminderPreferencesSchema.nullish(),
  /**
   * A paid trial or a first-payment date later than trial end. Surfaced on the
   * card rather than rewritten into the free-trial model.
   */
  unsupportedStageOne: z
    .object({
      reason: z.enum(["paid_trial", "different_payment_start"]),
      detail: z.string().trim().min(1).max(500),
    })
    .strict()
    .nullish(),
  confidence: z.enum(CONFIDENCES),
  evidence: z.string().trim().min(1).max(500),
});

/**
 * The cap is applied when the candidates are read, not here: a reply carrying
 * one entry too many is still a reading of the person's list, and rejecting the
 * whole thing over the twenty-sixth name would throw away the other
 * twenty-five. `candidateCapNotice` is what stops the extras being dropped
 * silently.
 */
export const extractionResultSchema = z.object({
  candidates: z.array(extractionCandidateSchema),
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
            enum: ["cancelled", "cancel_scheduled", null],
            description:
              "Only when the message says this already happened. `cancelled` when the subscription has stopped now, including when it stopped without anyone pressing cancel — a payment failed, or it expired; `cancel_scheduled` when it was cancelled but runs to the end of the paid period. Leave null when the message says the person wants to, should, or is about to cancel, and when it only says they do not use the service.",
          },
          endsOn: {
            type: ["string", "null"],
            description:
              "The day a cancellation takes effect, as YYYY-MM-DD, only when the message states it. Not a trial end.",
          },
          trialEndsOn: {
            type: ["string", "null"],
            description:
              "The day the trial ends, as YYYY-MM-DD, only when stated. Not endsOn and not nextRenewal. During trial this is the expected payment-start boundary if the person continues. Leave null when no trial is mentioned.",
          },
          autoRenewal: {
            type: ["string", "null"],
            enum: [...AUTO_RENEWALS, null],
            description:
              "yes or no only when the message states auto-renewal. Never infer from cadence. Leave null when unknown. Evidence of auto-renewal is not a reminder.",
          },
          reminderPreferences: {
            type: ["object", "null"],
            description:
              "Only when the person asks to be reminded, or to turn a reminder off. Not from auto-renewal. 'Remind me to cancel' is not a reminder preference. state off is {state: off} only — omit leadValue and leadUnit. state enabled requires leadValue and leadUnit.",
            properties: {
              renewal: {
                type: "object",
                properties: {
                  state: { type: "string", enum: ["off", "enabled"] },
                  leadValue: { type: ["integer", "null"] },
                  leadUnit: { type: "string", enum: ["days", "months"] },
                },
                description:
                  "off: {state: off} only. enabled: state, leadValue, and leadUnit.",
              },
              trialEnd: {
                type: "object",
                properties: {
                  state: { type: "string", enum: ["off", "enabled"] },
                  leadValue: { type: ["integer", "null"] },
                  leadUnit: { type: "string", enum: ["days", "months"] },
                },
                description:
                  "off: {state: off} only. enabled: state, leadValue, and leadUnit.",
              },
            },
          },
          unsupportedStageOne: {
            type: ["object", "null"],
            description:
              "Set when the input describes a paid trial or a first payment later than trial end. Do not silently rewrite those terms into the free-trial model.",
            properties: {
              reason: {
                type: "string",
                enum: ["paid_trial", "different_payment_start"],
              },
              detail: { type: "string" },
            },
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

/**
 * What a reading that came back at the cap has to say for itself. A pasted list
 * longer than `MAX_CANDIDATES` is read as far as the cap and no further, and the
 * person who pasted it is the only one who knows whether there was more: saying
 * so is the difference between a limit and a list quietly losing its tail.
 */
export function candidateCapNotice(candidates: ExtractionCandidate[]): string | null {
  if (candidates.length < MAX_CANDIDATES) {
    return null;
  }

  return `This reading stopped at ${MAX_CANDIDATES} subscriptions, which is the most one capture holds. If your list was longer, send the rest in another message.`;
}

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
