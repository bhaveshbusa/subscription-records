import { z } from "zod";

import {
  CADENCES,
  calendarDateSchema,
  SUBSCRIPTION_STATUSES,
} from "@/lib/subscriptions/params";

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
export const APPLIABLE_PROPOSAL_KINDS = [
  "create",
  "update",
  "charged",
  "terms_changed",
  "cancel_scheduled",
  "cancelled",
  "reactivated",
  "lapsed",
] as const;

/** Kinds that end a subscription's life rather than change its terms. */
export const LIFECYCLE_PROPOSAL_KINDS = [
  "cancel_scheduled",
  "cancelled",
  "lapsed",
] as const;

export type LifecycleProposalKind = (typeof LIFECYCLE_PROPOSAL_KINDS)[number];

export function isLifecycleKind(kind: ProposalKind): kind is LifecycleProposalKind {
  return (LIFECYCLE_PROPOSAL_KINDS as readonly ProposalKind[]).includes(kind);
}

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
    nextRenewal: proposedField(calendarDateSchema, termsStatus).optional(),
    startedOn: calendarDateSchema.optional(),
    endsOn: calendarDateSchema.optional(),
    /** The day the terms in this payload start, for a `terms_changed`. */
    effectiveFrom: calendarDateSchema.optional(),
    /**
     * A payment the message says already happened. `idempotencyKey` is decided
     * when the message is captured, so re-reporting the same payment lands on
     * the charge that is already stored instead of a second one.
     */
    charge: z
      .object({
        paidOn: calendarDateSchema,
        amountMinor: z.number().int().min(0).max(2_000_000_000),
        currency: z.string().trim().length(3).toUpperCase(),
        idempotencyKey: z.string().trim().min(1).max(200),
      })
      .strict()
      .optional(),
  })
  .strict();

export type ProposalPayload = z.infer<typeof proposalPayloadSchema>;

/** A `create` needs a provider, because identity is the one required column. */
export const createProposalPayloadSchema = proposalPayloadSchema.refine(
  (payload) => payload.provider !== undefined,
  { message: "a create proposal needs a provider", path: ["provider"] },
);

export const chargedProposalPayloadSchema = proposalPayloadSchema.refine(
  (payload) => payload.charge !== undefined,
  { message: "a charged proposal needs a charge", path: ["charge"] },
);

export const updateProposalPayloadSchema = proposalPayloadSchema.refine(
  (payload) => Object.keys(payload).length > 0,
  { message: "an update proposal needs at least one field", path: ["payload"] },
);

/** A change of terms is about the terms, so it has to carry at least one. */
export const termsChangedProposalPayloadSchema = proposalPayloadSchema.refine(
  (payload) =>
    payload.amountMinor !== undefined ||
    payload.cadence !== undefined ||
    payload.plan !== undefined ||
    payload.currency !== undefined,
  {
    message: "a terms changed proposal needs a price, a cadence, or a plan",
    path: ["payload"],
  },
);

/**
 * A reactivation puts a subscription that had ended back on, so it carries the
 * status the row comes back to. `reactivated` is something that happened to a
 * subscription rather than a state one can be in, hence the running status.
 */
export const reactivatedProposalPayloadSchema = proposalPayloadSchema.refine(
  (payload) =>
    payload.subscriptionStatus?.value === "active" ||
    payload.subscriptionStatus?.value === "trial",
  {
    message: "a reactivated proposal needs a subscriptionStatus of active or trial",
    path: ["subscriptionStatus"],
  },
);

/**
 * A lifecycle payload says what the subscription becomes, and the status has to
 * be the kind's own: a `cancelled` proposal that carries `active` would move the
 * row somewhere its card never showed.
 */
export function lifecycleProposalPayloadSchema(kind: LifecycleProposalKind) {
  return proposalPayloadSchema.refine(
    (payload) => payload.subscriptionStatus?.value === kind,
    {
      message: `a ${kind} proposal needs a subscriptionStatus of ${kind}`,
      path: ["subscriptionStatus"],
    },
  );
}

export type PayloadIssue = { field: string; message: string };
export type PayloadResult =
  | { success: true; payload: ProposalPayload }
  | { success: false; issues: PayloadIssue[] };

/**
 * Payloads are stored as jsonb, so a row written by an earlier version (or by
 * hand) is validated on the way out rather than trusted.
 */
export function parseProposalPayload(kind: ProposalKind, payload: unknown): PayloadResult {
  const schema = isLifecycleKind(kind)
    ? lifecycleProposalPayloadSchema(kind)
    : kind === "create"
      ? createProposalPayloadSchema
      : kind === "update"
        ? updateProposalPayloadSchema
        : kind === "charged"
          ? chargedProposalPayloadSchema
          : kind === "terms_changed"
            ? termsChangedProposalPayloadSchema
            : kind === "reactivated"
              ? reactivatedProposalPayloadSchema
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
