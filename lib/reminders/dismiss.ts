import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { isRecordId } from "@/lib/db/ids";
import { reminders } from "@/lib/db/schema";

import { toReminderView, type ReminderView } from "./projection";

export type DismissClient = Pick<NodePgDatabase, "select" | "update">;

export type DismissError = "not_found" | "not_pending";

export type DismissResult =
  | { ok: true; reminder: ReminderView }
  | { ok: false; error: DismissError };

/**
 * The only thing a user can do to a reminder. Dismissing it says "seen", and
 * that is all it says: no subscription column is touched, so a renewal reminder
 * cannot confirm the date it was reminding about.
 */
export async function dismissReminder(
  client: DismissClient,
  options: { userId: string; id: string; now?: Date },
): Promise<DismissResult> {
  if (!isRecordId(options.id)) {
    return { ok: false, error: "not_found" };
  }

  const now = options.now ?? new Date();
  const [existing] = await client
    .select({ state: reminders.state })
    .from(reminders)
    .where(and(eq(reminders.user_id, options.userId), eq(reminders.id, options.id)))
    .limit(1);

  if (!existing) {
    return { ok: false, error: "not_found" };
  }

  if (existing.state !== "pending") {
    return { ok: false, error: "not_pending" };
  }

  const [row] = await client
    .update(reminders)
    .set({ state: "dismissed", dismissed_at: now, updated_at: now })
    .where(
      and(
        eq(reminders.user_id, options.userId),
        eq(reminders.id, options.id),
        eq(reminders.state, "pending"),
      ),
    )
    .returning();

  /** A second click lost the race: the first dismissal is the one that stands. */
  return row ? { ok: true, reminder: toReminderView(row) } : { ok: false, error: "not_pending" };
}
