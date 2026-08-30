import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";

import { reminders, subscriptions } from "@/lib/db/schema";

import { REMINDER_STATES, toReminderView, type ReminderView } from "./projection";

export type ReminderQueryClient = Pick<NodePgDatabase, "select">;

export const DEFAULT_REMINDER_LIMIT = 50;
export const MAX_REMINDER_LIMIT = 100;

const stateSchema = z
  .string()
  .transform((value) =>
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  )
  .pipe(z.array(z.enum(REMINDER_STATES)).min(1));

const reminderQuerySchema = z
  .object({
    state: stateSchema.optional(),
    limit: z
      .string()
      .regex(/^\d+$/, "must be a positive integer")
      .transform((value) => Number.parseInt(value, 10))
      .pipe(z.number().int().min(1).max(MAX_REMINDER_LIMIT))
      .optional(),
  })
  .transform((query) => ({
    state: query.state ?? (["pending"] as const),
    limit: query.limit ?? DEFAULT_REMINDER_LIMIT,
  }));

export type ReminderQuery = z.infer<typeof reminderQuerySchema>;
export type ReminderQueryResult =
  | { success: true; query: ReminderQuery }
  | { success: false; issues: { field: string; message: string }[] };

export function parseReminderQuery(searchParams: URLSearchParams): ReminderQueryResult {
  const raw: Record<string, string> = {};

  for (const key of ["state", "limit"]) {
    const value = searchParams.get(key);

    if (value !== null && value !== "") {
      raw[key] = value;
    }
  }

  const parsed = reminderQuerySchema.safeParse(raw);

  if (!parsed.success) {
    return {
      success: false,
      issues: parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || "query",
        message: issue.message,
      })),
    };
  }

  return { success: true, query: parsed.data };
}

/** Soonest due first, because the renewal this week matters more than next week's. */
export async function listReminders(
  client: ReminderQueryClient,
  options: { userId: string; query: ReminderQuery },
): Promise<ReminderView[]> {
  const rows = await client
    .select({ row: reminders, provider: subscriptions.provider_display })
    .from(reminders)
    .leftJoin(subscriptions, eq(subscriptions.id, reminders.subscription_id))
    .where(
      and(
        eq(reminders.user_id, options.userId),
        inArray(reminders.state, [...options.query.state]),
      ),
    )
    .orderBy(asc(reminders.due_on), desc(reminders.created_at), desc(reminders.id))
    .limit(options.query.limit);

  return rows.map((entry) => toReminderView(entry.row, entry.provider));
}
