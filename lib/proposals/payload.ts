import { z } from "zod";

import { CADENCES, SUBSCRIPTION_STATUSES } from "@/lib/subscriptions/params";

export const PROPOSAL_KINDS = [
  "create",
  "update",
  "charged",
  "terms_changed",
  "cancel_scheduled",
  "cancelled",
  "reactivated",
  "lapsed",
] as const;

export const PROPOSAL_STATES = ["pending", "accepted", "rejected", "superseded"] as const;

/** Kinds this issue can apply. The rest are recorded and can only be rejected. */
export const APPLIABLE_PROPOSAL_KINDS = ["create", "update"] as const;

export type ProposalKind = (typeof PROPOSAL_KINDS)[number];
export type ProposalState = (typeof PROPOSAL_STATES)[number];

const confidenceSchema = z.enum(["low", "medium", "high"]);

/** Identity is a name, so a confident source may claim it outright. */
const identityStatus = z.enum(["proposed", "inferred", "confirmed"]);

/**
 * Money and dates never arrive confirmed: only a user action confirms them,
 * so the payload cannot ask for it.
 */
const termsStatus = z.enum(["proposed", "inferred"]);

const calendarDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be a date like 2026-09-12")
  .refine(
    (value) => {
      const parsed = new Date(`${value}T00:00:00.000Z`);

      return (
        !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
      );
    },
    { message: "must be a real calendar date" },
  );

function proposedField<Value extends z.ZodTypeAny, Status extends z.ZodTypeAny>(
  value: Value,
  status: Status,
) {
  return z
    .object({
      value,
      status,
      confidence: confidenceSchema.nullable().optional(),
    })
    .strict();
}

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullable();

export const proposalPayloadSchema = z
  .object({
    provider: proposedField(z.string().trim().min(1).max(120), identityStatus).optional(),
    plan: nullableText(120).optional(),
    accountHint: nullableText(120).optional(),
    notes: nullableText(2000).optional(),
    currency: z.string().trim().length(3).toUpperCase().optional(),
    subscriptionStatus: proposedField(
      z.enum(SUBSCRIPTION_STATUSES),
      identityStatus,
    ).optional(),
    amountMinor: proposedField(
      z.number().int().min(0).max(2_000_000_000),
      termsStatus,
    ).optional(),
    cadence: proposedField(z.enum(CADENCES), termsStatus).optional(),
    nextRenewal: proposedField(calendarDate, termsStatus).optional(),
    startedOn: calendarDate.optional(),
    endsOn: calendarDate.optional(),
  })
  .strict();

export type ProposalPayload = z.infer<typeof proposalPayloadSchema>;

/** A `create` needs a provider, because identity is the one required column. */
export const createProposalPayloadSchema = proposalPayloadSchema.refine(
  (payload) => payload.provider !== undefined,
  { message: "a create proposal needs a provider", path: ["provider"] },
);

export const updateProposalPayloadSchema = proposalPayloadSchema.refine(
  (payload) => Object.keys(payload).length > 0,
  { message: "an update proposal needs at least one field", path: ["payload"] },
);

export type PayloadIssue = { field: string; message: string };
export type PayloadResult =
  | { success: true; payload: ProposalPayload }
  | { success: false; issues: PayloadIssue[] };

/**
 * Payloads are stored as jsonb, so a row written by an earlier version (or by
 * hand) is validated on the way out rather than trusted.
 */
export function parseProposalPayload(kind: ProposalKind, payload: unknown): PayloadResult {
  const schema =
    kind === "create"
      ? createProposalPayloadSchema
      : kind === "update"
        ? updateProposalPayloadSchema
        : proposalPayloadSchema;
  const parsed = schema.safeParse(payload);

  if (!parsed.success) {
    return {
      success: false,
      issues: parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || "payload",
        message: issue.message,
      })),
    };
  }

  return { success: true, payload: parsed.data };
}
