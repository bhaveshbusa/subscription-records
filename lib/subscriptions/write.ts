import { and, eq, isNull, type InferInsertModel } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";

import { isRecordId } from "@/lib/db/ids";
import { amendments, subscriptions } from "@/lib/db/schema";
import type { LifecycleProposalKind } from "@/lib/proposals/payload";
import {
  reminderPreferencesInputSchema,
  saveReminderPreferences,
} from "@/lib/reminders/preferences";

import { AUTO_RENEWALS, CADENCES, calendarDateSchema, SUBSCRIPTION_STATUSES } from "./params";
import type { FieldStatus, SubscriptionRow } from "./projection";
import { today } from "./query";

type SubscriptionInsert = InferInsertModel<typeof subscriptions>;
type AmendmentInsert = InferInsertModel<typeof amendments>;

/** Accepts the pool, a transaction, or a test double that shares one connection. */
export type WriteClient = Pick<NodePgDatabase, "select" | "insert" | "update" | "delete">;

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullable();

const calendarDate = calendarDateSchema.nullable();

const writeFields = {
  provider: z.string().trim().min(1, "provider is required").max(120),
  plan: nullableText(120),
  accountHint: nullableText(120),
  status: z.enum(SUBSCRIPTION_STATUSES),
  amountMinor: z.number().int().min(0).max(2_000_000_000).nullable(),
  currency: z.string().trim().length(3).toUpperCase(),
  cadence: z.enum(CADENCES).nullable(),
  nextRenewal: calendarDate,
  startedOn: calendarDate,
  endsOn: calendarDate,
  trialEndsOn: calendarDate,
  autoRenewal: z.enum(AUTO_RENEWALS).nullable(),
  notes: nullableText(2000),
};

const writeFieldKeys = [
  "provider",
  "plan",
  "accountHint",
  "status",
  "amountMinor",
  "currency",
  "cadence",
  "nextRenewal",
  "startedOn",
  "endsOn",
  "trialEndsOn",
  "autoRenewal",
  "notes",
] as const satisfies readonly (keyof typeof writeFields)[];

export const createSubscriptionSchema = z
  .object({
    ...writeFields,
    plan: writeFields.plan.optional(),
    accountHint: writeFields.accountHint.optional(),
    status: writeFields.status.optional(),
    amountMinor: writeFields.amountMinor.optional(),
    currency: writeFields.currency.optional(),
    cadence: writeFields.cadence.optional(),
    nextRenewal: writeFields.nextRenewal.optional(),
    startedOn: writeFields.startedOn.optional(),
    endsOn: writeFields.endsOn.optional(),
    trialEndsOn: writeFields.trialEndsOn.optional(),
    autoRenewal: writeFields.autoRenewal.optional(),
    notes: writeFields.notes.optional(),
    reminderPreferences: reminderPreferencesInputSchema.optional(),
  })
  .strict();

const termsChangeSchema = z
  .object({
    /** The day the new terms took effect. Required when the user says the price actually changed. */
    effectiveFrom: calendarDateSchema,
  })
  .strict();

export const updateSubscriptionSchema = z
  .object({
    ...writeFields,
    termsChange: termsChangeSchema.optional(),
    resumedOn: calendarDate,
    reminderPreferences: reminderPreferencesInputSchema.optional(),
  })
  .strict()
  .partial()
  .refine(
    (body) =>
      writeFieldKeys.some((key) => body[key] !== undefined) ||
      body.reminderPreferences !== undefined,
    { message: "no fields to update" },
  )
  .refine(
    (body) =>
      body.termsChange === undefined ||
      body.amountMinor !== undefined ||
      body.currency !== undefined ||
      body.cadence !== undefined ||
      body.plan !== undefined,
    { message: "a terms change needs an amount, cadence, currency, or plan" },
  );

export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;
export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionSchema>;

export type WriteIssue = { field: string; message: string };
export type ParseResult<T> =
  | { success: true; input: T }
  | { success: false; issues: WriteIssue[] };

function parse<T extends z.ZodTypeAny>(schema: T, body: unknown): ParseResult<z.infer<T>> {
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return {
      success: false,
      issues: parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || "body",
        message: issue.message,
      })),
    };
  }

  return { success: true, input: parsed.data };
}

/** A body that is not JSON fails validation rather than throwing. */
export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function parseCreateBody(body: unknown) {
  return parse(createSubscriptionSchema, body);
}

export function parseUpdateBody(body: unknown) {
  return parse(updateSubscriptionSchema, body);
}

/** `The Athletic` → `the-athletic`, so manual rows match the seeded naming. */
export function canonicalProvider(provider: string): string {
  return provider
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** A value the user typed is theirs: `confirmed`. Clearing it leaves `empty`. */
function userSetField(value: unknown): {
  status: FieldStatus;
  confidence: SubscriptionRow["amount_confidence"];
} {
  return value === null || value === undefined
    ? { status: "empty", confidence: null }
    : { status: "confirmed", confidence: "high" };
}

export function toInsertValues(
  userId: string,
  input: CreateSubscriptionInput,
): SubscriptionInsert {
  const amount = userSetField(input.amountMinor ?? null);
  const cadence = userSetField(input.cadence ?? null);
  const renewal = userSetField(input.nextRenewal ?? null);
  const trialEnd = userSetField(input.trialEndsOn ?? null);
  const autoRenewal = userSetField(input.autoRenewal ?? null);
  const status = userSetField(input.status);

  return {
    user_id: userId,
    provider_canonical: canonicalProvider(input.provider),
    provider_display: input.provider,
    plan: input.plan ?? null,
    account_hint: input.accountHint ?? null,
    status: input.status ?? "unknown",
    amount_minor: input.amountMinor ?? null,
    currency: input.currency ?? "GBP",
    cadence: input.cadence ?? null,
    next_renewal: input.nextRenewal ?? null,
    started_on: input.startedOn ?? null,
    ends_on: input.endsOn ?? null,
    trial_ends_on: input.trialEndsOn ?? null,
    auto_renewal: input.autoRenewal ?? null,
    notes: input.notes ?? null,
    provider_field_status: "confirmed",
    provider_confidence: "high",
    amount_field_status: amount.status,
    amount_confidence: amount.confidence,
    cadence_field_status: cadence.status,
    cadence_confidence: cadence.confidence,
    renewal_field_status: renewal.status,
    renewal_confidence: renewal.confidence,
    trial_end_field_status: trialEnd.status,
    trial_end_confidence: trialEnd.confidence,
    auto_renewal_field_status: autoRenewal.status,
    auto_renewal_confidence: autoRenewal.confidence,
    status_field_status: status.status,
    status_confidence: status.confidence,
  };
}

/** Only the fields present in the request change; the rest keep their trust. */
export function toUpdateValues(input: UpdateSubscriptionInput, now = new Date()) {
  const values: Partial<SubscriptionInsert> & { updated_at: Date } = {
    updated_at: now,
  };

  if (input.provider !== undefined) {
    values.provider_display = input.provider;
    values.provider_canonical = canonicalProvider(input.provider);
    values.provider_field_status = "confirmed";
    values.provider_confidence = "high";
  }

  if (input.plan !== undefined) {
    values.plan = input.plan;
  }

  if (input.accountHint !== undefined) {
    values.account_hint = input.accountHint;
  }

  if (input.notes !== undefined) {
    values.notes = input.notes;
  }

  if (input.currency !== undefined) {
    values.currency = input.currency;
  }

  if (input.startedOn !== undefined) {
    values.started_on = input.startedOn;
  }

  if (input.endsOn !== undefined) {
    values.ends_on = input.endsOn;
  }

  if (input.status !== undefined) {
    const status = userSetField(input.status);

    values.status = input.status;
    values.status_field_status = status.status;
    values.status_confidence = status.confidence;
  }

  if (input.amountMinor !== undefined) {
    const amount = userSetField(input.amountMinor);

    values.amount_minor = input.amountMinor;
    values.amount_field_status = amount.status;
    values.amount_confidence = amount.confidence;
  }

  if (input.cadence !== undefined) {
    const cadence = userSetField(input.cadence);

    values.cadence = input.cadence;
    values.cadence_field_status = cadence.status;
    values.cadence_confidence = cadence.confidence;
  }

  if (input.nextRenewal !== undefined) {
    const renewal = userSetField(input.nextRenewal);

    values.next_renewal = input.nextRenewal;
    values.renewal_field_status = renewal.status;
    values.renewal_confidence = renewal.confidence;
  }

  if (input.trialEndsOn !== undefined) {
    const trialEnd = userSetField(input.trialEndsOn);

    values.trial_ends_on = input.trialEndsOn;
    values.trial_end_field_status = trialEnd.status;
    values.trial_end_confidence = trialEnd.confidence;
  }

  if (input.autoRenewal !== undefined) {
    const autoRenewal = userSetField(input.autoRenewal);

    values.auto_renewal = input.autoRenewal;
    values.auto_renewal_field_status = autoRenewal.status;
    values.auto_renewal_confidence = autoRenewal.confidence;
  }

  return values;
}

function isEndedStatus(status: SubscriptionRow["status"]): boolean {
  return status === "cancelled" || status === "lapsed";
}

/**
 * Manual cancel uses the same lifecycle kinds an accepted proposal uses. A row
 * that has already ended is not ended again — coming back is a reactivation.
 */
export function endingKindFor(
  current: SubscriptionRow["status"],
  requested: UpdateSubscriptionInput["status"],
): LifecycleProposalKind | null {
  if (requested === undefined || requested === current || isEndedStatus(current)) {
    return null;
  }

  if (requested === "cancelled" || requested === "cancel_scheduled") {
    return requested;
  }

  return null;
}

export function isManualReactivation(
  current: SubscriptionRow["status"],
  requested: UpdateSubscriptionInput["status"],
): boolean {
  return isEndedStatus(current) && requested !== undefined && !isEndedStatus(requested);
}

function fieldUpdatesFrom(input: UpdateSubscriptionInput): UpdateSubscriptionInput {
  const fields: UpdateSubscriptionInput = { ...input };
  delete fields.termsChange;
  delete fields.resumedOn;
  delete fields.reminderPreferences;

  return fields;
}

function hasAssignedFields(input: UpdateSubscriptionInput): boolean {
  return writeFieldKeys.some((key) => input[key] !== undefined);
}

function openAmendmentValues(row: SubscriptionRow, now: Date): AmendmentInsert {
  return {
    user_id: row.user_id,
    subscription_id: row.id,
    effective_from: row.started_on ?? today(now),
    effective_to: null,
    amount_minor: row.amount_minor,
    currency: row.currency,
    cadence: row.cadence,
    plan: row.plan,
  };
}

/** The open amendment holds the terms in force now, so it follows the row. */
export async function syncOpenAmendment(client: WriteClient, row: SubscriptionRow, now: Date) {
  const values = openAmendmentValues(row, now);
  const updated = await client
    .update(amendments)
    .set({
      amount_minor: values.amount_minor,
      currency: values.currency,
      cadence: values.cadence,
      plan: values.plan,
      updated_at: now,
    })
    .where(
      and(
        eq(amendments.user_id, row.user_id),
        eq(amendments.subscription_id, row.id),
        isNull(amendments.effective_to),
      ),
    )
    .returning({ id: amendments.id });

  const hasTerms =
    values.amount_minor !== null || values.cadence !== null || values.plan !== null;

  if (updated.length === 0 && hasTerms) {
    await client.insert(amendments).values(values);
  }
}

export async function createSubscription(
  client: WriteClient,
  options: { userId: string; input: CreateSubscriptionInput; now?: Date },
): Promise<SubscriptionRow> {
  const now = options.now ?? new Date();
  const [row] = await client
    .insert(subscriptions)
    .values(toInsertValues(options.userId, options.input))
    .returning();

  await syncOpenAmendment(client, row, now);

  if (options.input.reminderPreferences) {
    await saveReminderPreferences(client, {
      userId: options.userId,
      subscriptionId: row.id,
      input: options.input.reminderPreferences,
      now,
    });
  }

  return row;
}

/** `null` when the id does not belong to the signed-in user, so callers 404. */
export async function updateSubscription(
  client: WriteClient,
  options: { userId: string; id: string; input: UpdateSubscriptionInput; now?: Date },
): Promise<SubscriptionRow | null> {
  const now = options.now ?? new Date();

  if (!isRecordId(options.id)) {
    return null;
  }

  const [current] = await client
    .select()
    .from(subscriptions)
    .where(
      and(eq(subscriptions.user_id, options.userId), eq(subscriptions.id, options.id)),
    )
    .limit(1);

  if (!current) {
    return null;
  }

  if (options.input.reminderPreferences) {
    await saveReminderPreferences(client, {
      userId: options.userId,
      subscriptionId: current.id,
      input: options.input.reminderPreferences,
      now,
    });
  }

  const endingKind = endingKindFor(current.status, options.input.status);
  const resuming = isManualReactivation(current.status, options.input.status);
  const fieldInput = fieldUpdatesFrom(options.input);

  if (endingKind) {
    delete fieldInput.status;
    delete fieldInput.endsOn;
    delete fieldInput.nextRenewal;
  }

  if (resuming) {
    delete fieldInput.status;
    delete fieldInput.endsOn;
  }

  let row = current;

  if (hasAssignedFields(fieldInput)) {
    const [updated] = await client
      .update(subscriptions)
      .set(toUpdateValues(fieldInput, now))
      .where(
        and(eq(subscriptions.user_id, options.userId), eq(subscriptions.id, options.id)),
      )
      .returning();

    if (!updated) {
      return null;
    }

    row = updated;
  }

  const { amendTerms, termsDiffer, termsOf } = await import("@/lib/proposals/terms");
  const termsChanged =
    options.input.termsChange !== undefined && termsDiffer(termsOf(current), termsOf(row));

  if (termsChanged && options.input.termsChange) {
    await amendTerms(client, {
      before: current,
      after: row,
      effectiveFrom: options.input.termsChange.effectiveFrom,
      now,
    });
  } else if (!endingKind && !resuming) {
    await syncOpenAmendment(client, row, now);
  } else if (hasAssignedFields(fieldInput)) {
    /**
     * A cancel or reactivation still needs the open amendment to carry any
     * corrected terms before the shared lifecycle writer closes or versions it.
     */
    await syncOpenAmendment(client, row, now);
  }

  if (endingKind) {
    const { applyLifecycleProposal, toLifecycleValues } = await import(
      "@/lib/proposals/lifecycle"
    );
    const { values, endsOn, stillBilling } = toLifecycleValues(
      endingKind,
      { endsOn: options.input.endsOn ?? null },
      row,
      now,
    );

    await client
      .update(subscriptions)
      .set(values)
      .where(
        and(eq(subscriptions.user_id, options.userId), eq(subscriptions.id, options.id)),
      );

    await applyLifecycleProposal(client, {
      kind: endingKind,
      subscription: row,
      endsOn,
      stillBilling,
      now,
    });

    const [ended] = await client
      .select()
      .from(subscriptions)
      .where(
        and(eq(subscriptions.user_id, options.userId), eq(subscriptions.id, options.id)),
      )
      .limit(1);

    return ended ?? null;
  }

  if (resuming) {
    const { applyReactivationProposal, toReactivationValues } = await import(
      "@/lib/proposals/reactivate"
    );
    const requestedStatus = options.input.status ?? "active";
    const update = toReactivationValues(
      row,
      {
        subscriptionStatus: { value: requestedStatus, status: "confirmed" },
      },
      now,
    );
    const [revived] = await client
      .update(subscriptions)
      .set(update.values)
      .where(
        and(eq(subscriptions.user_id, options.userId), eq(subscriptions.id, options.id)),
      )
      .returning();

    if (!revived) {
      return null;
    }

    await applyReactivationProposal(client, {
      subscription: revived,
      resumedOn: options.input.resumedOn ?? today(now),
      now,
    });

    return revived;
  }

  return row;
}

