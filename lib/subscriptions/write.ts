import { and, eq, isNull, type InferInsertModel } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";

import { isRecordId } from "@/lib/db/ids";
import { amendments, subscriptions } from "@/lib/db/schema";

import { CADENCES, SUBSCRIPTION_STATUSES } from "./params";
import type { FieldStatus, SubscriptionRow } from "./projection";
import { today } from "./query";

type SubscriptionInsert = InferInsertModel<typeof subscriptions>;
type AmendmentInsert = InferInsertModel<typeof amendments>;

/** Accepts the pool, a transaction, or a test double that shares one connection. */
export type WriteClient = Pick<NodePgDatabase, "select" | "insert" | "update">;

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullable();

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
  )
  .nullable();

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
  notes: nullableText(2000),
};

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
    notes: writeFields.notes.optional(),
  })
  .strict();

export const updateSubscriptionSchema = z
  .object(writeFields)
  .strict()
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: "no fields to update" });

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
    notes: input.notes ?? null,
    provider_field_status: "confirmed",
    provider_confidence: "high",
    amount_field_status: amount.status,
    amount_confidence: amount.confidence,
    cadence_field_status: cadence.status,
    cadence_confidence: cadence.confidence,
    renewal_field_status: renewal.status,
    renewal_confidence: renewal.confidence,
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

  return values;
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

  const [row] = await client
    .update(subscriptions)
    .set(toUpdateValues(options.input, now))
    .where(
      and(eq(subscriptions.user_id, options.userId), eq(subscriptions.id, options.id)),
    )
    .returning();

  if (!row) {
    return null;
  }

  await syncOpenAmendment(client, row, now);

  return row;
}
