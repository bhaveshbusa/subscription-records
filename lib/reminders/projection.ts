import type { InferSelectModel } from "drizzle-orm";

import type { reminders } from "@/lib/db/schema";

export type ReminderRow = InferSelectModel<typeof reminders>;
export type ReminderKind = ReminderRow["kind"];
export type ReminderState = ReminderRow["state"];

export const REMINDER_STATES = ["pending", "dismissed"] as const;

/**
 * A reminder as the inbox reads it. There is no payload and nothing to accept:
 * a reminder points at a subscription and says what is due, and the ledger is
 * changed by opening that subscription, never by the card itself.
 */
export type ReminderView = {
  id: string;
  kind: ReminderKind;
  state: ReminderState;
  subscriptionId: string;
  subscriptionProvider: string | null;
  dueOn: string;
  body: string;
  createdAt: string;
  dismissedAt: string | null;
};

export function toReminderView(
  row: ReminderRow,
  subscriptionProvider: string | null = null,
): ReminderView {
  return {
    id: row.id,
    kind: row.kind,
    state: row.state,
    subscriptionId: row.subscription_id,
    subscriptionProvider,
    dueOn: row.due_on,
    body: row.body,
    createdAt: row.created_at.toISOString(),
    dismissedAt: row.dismissed_at?.toISOString() ?? null,
  };
}
