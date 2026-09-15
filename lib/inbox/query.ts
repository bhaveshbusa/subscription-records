import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { FollowUpReason } from "@/lib/capture/follow-up";
import {
  loadOpenQuestions,
  type QuestionRow,
} from "@/lib/capture/questions";
import {
  listOpenCancellationIntentions,
} from "@/lib/cancellation-intention/intention";
import {
  projectVisibleCancellationIntention,
  type CancellationIntentionOccurrence,
} from "@/lib/cancellation-intention/notifications";
import { subscriptionReminderPreferences, subscriptions } from "@/lib/db/schema";
import {
  projectVisibleReminder,
  reminderFactsFromRow,
  type ReminderOccurrence,
} from "@/lib/reminders/notifications";
import { toListItem, type SubscriptionListItem } from "@/lib/subscriptions/projection";
import { today } from "@/lib/subscriptions/query";
import { overdueSql, scheduleDueOnSql } from "@/lib/subscriptions/schedule";

/** Accepts both the pooled client and a transaction, so tests can roll back. */
export type InboxClient = Pick<NodePgDatabase, "select">;

/**
 * A row that cannot be read as settled: identity is `unknown`, a term is
 * `conflicted`, or a term the user put off is due again. Missing terms alone
 * are not here — an incomplete row is allowed to stay incomplete.
 */
function unfinishedSql(): SQL {
  return sql`(
    ${subscriptions.status} = 'unknown'
    or ${subscriptions.amount_field_status} = 'conflicted'
    or ${subscriptions.cadence_field_status} = 'conflicted'
    or ${subscriptions.renewal_field_status} = 'conflicted'
    or (
      (
        ${subscriptions.amount_field_status} = 'deferred'
        or ${subscriptions.cadence_field_status} = 'deferred'
        or ${subscriptions.renewal_field_status} = 'deferred'
      )
      and ${subscriptions.deferred_until} is not null
      and ${subscriptions.deferred_until} <= now()
    )
  )`;
}

export type PreferenceInboxReminder = ReminderOccurrence & {
  kind?: "preference";
  item: SubscriptionListItem;
};

export type CancellationInboxReminder = CancellationIntentionOccurrence & {
  item: SubscriptionListItem;
};

export type InboxReminder = PreferenceInboxReminder | CancellationInboxReminder;

export type InboxQuestion = {
  id: string;
  provider: string;
  reason: FollowUpReason;
  state: "asked" | "deferred";
  question: string;
  subscriptionId: string | null;
  /** The holding or draft it was asked about; see `holdingScope` / `draftScope`. */
  scopeKey: string;
  updatedAt: string;
};

export type InboxSections = {
  overdue: SubscriptionListItem[];
  unfinished: SubscriptionListItem[];
  reminders: InboxReminder[];
  questions: InboxQuestion[];
};

export function toInboxQuestion(row: QuestionRow): InboxQuestion {
  return {
    id: row.id,
    provider: row.provider_display,
    reason: row.reason,
    state: row.state === "deferred" ? "deferred" : "asked",
    question: row.question,
    subscriptionId: row.subscription_id,
    scopeKey: row.scope_key,
    updatedAt: row.updated_at.toISOString(),
  };
}

/**
 * The ledger rows Inbox works from, projected out of the same tables the
 * ledger reads. Nothing here is persisted and nothing is written: a section
 * is a question about a row, and the row is the only source of truth.
 *
 * A row can be in more than one section when more than one thing is true of
 * it — overdue and a visible reminder, say. It is listed in both rather than
 * hidden from one, because hiding it is how a work list loses work. An
 * expired reminder must not hide remaining reconciliation on the same holding.
 */
export async function getInboxSections(
  client: InboxClient,
  options: { userId: string; now?: Date },
): Promise<InboxSections> {
  const on = today(options.now ?? new Date());
  const overdue = overdueSql(on);
  const unfinished = unfinishedSql();

  const [ledgerRows, preferenceRows, intentionRows, questionRows] = await Promise.all([
    client
      .select({
        row: subscriptions,
        isOverdue: sql<boolean>`${overdue}`,
        isUnfinished: sql<boolean>`${unfinished}`,
      })
      .from(subscriptions)
      .where(
        and(eq(subscriptions.user_id, options.userId), sql`(${overdue} or ${unfinished})`),
      )
      .orderBy(
        asc(
          sql`coalesce(${scheduleDueOnSql(on)}, ${subscriptions.trial_ends_on}, date '9999-12-31')`,
        ),
        asc(subscriptions.provider_display),
      ),
    client
      .select({
        row: subscriptions,
        target: subscriptionReminderPreferences.target,
        leadValue: subscriptionReminderPreferences.lead_value,
        leadUnit: subscriptionReminderPreferences.lead_unit,
      })
      .from(subscriptionReminderPreferences)
      .innerJoin(
        subscriptions,
        eq(subscriptions.id, subscriptionReminderPreferences.subscription_id),
      )
      .where(
        and(
          eq(subscriptionReminderPreferences.user_id, options.userId),
          eq(subscriptions.user_id, options.userId),
          eq(subscriptionReminderPreferences.state, "enabled"),
        ),
      ),
    listOpenCancellationIntentions(client, { userId: options.userId }),
    loadOpenQuestions(client, options.userId),
  ]);

  const sections: InboxSections = { overdue: [], unfinished: [], reminders: [], questions: [] };

  for (const entry of ledgerRows) {
    const item = toListItem(entry.row, on);

    if (entry.isOverdue) {
      sections.overdue.push(item);
    }

    if (entry.isUnfinished) {
      sections.unfinished.push(item);
    }
  }

  const reminders: InboxReminder[] = [];
  const holdingsById = new Map<string, (typeof preferenceRows)[number]["row"]>();

  for (const entry of preferenceRows) {
    holdingsById.set(entry.row.id, entry.row);

    if (entry.leadValue === null || entry.leadUnit === null) {
      continue;
    }

    const { facts, trialEndStatus } = reminderFactsFromRow(entry.row);
    const occurrence = projectVisibleReminder({
      preference: {
        subscriptionId: entry.row.id,
        target: entry.target,
        state: "enabled",
        leadValue: entry.leadValue,
        leadUnit: entry.leadUnit,
      },
      facts,
      trialEndStatus,
      today: on,
    });

    if (!occurrence) {
      continue;
    }

    reminders.push({
      ...occurrence,
      kind: "preference",
      item: toListItem(entry.row, on),
    });
  }

  const missingIntentionIds = intentionRows
    .map((row) => row.subscriptionId)
    .filter((id) => !holdingsById.has(id));

  if (missingIntentionIds.length > 0) {
    const rows = await client
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.user_id, options.userId),
          inArray(subscriptions.id, missingIntentionIds),
        ),
      );

    for (const row of rows) {
      holdingsById.set(row.id, row);
    }
  }

  for (const intention of intentionRows) {
    const occurrence = projectVisibleCancellationIntention({
      subscriptionId: intention.subscriptionId,
      remindOn: intention.remindOn,
      today: on,
    });

    if (!occurrence) {
      continue;
    }

    const row = holdingsById.get(intention.subscriptionId);

    if (!row || row.status === "cancelled" || row.status === "cancel_scheduled" || row.status === "lapsed") {
      continue;
    }

    reminders.push({
      ...occurrence,
      item: toListItem(row, on),
    });
  }

  reminders.sort((left, right) => {
    if (left.dueDate !== right.dueDate) {
      return left.dueDate < right.dueDate ? -1 : 1;
    }

    const byProvider = (left.item.provider.value ?? "").localeCompare(
      right.item.provider.value ?? "",
    );

    if (byProvider !== 0) {
      return byProvider;
    }

    const leftKey = left.kind === "cancellation_intention" ? "cancel_intention" : left.target;
    const rightKey = right.kind === "cancellation_intention" ? "cancel_intention" : right.target;

    return leftKey.localeCompare(rightKey);
  });

  sections.reminders = reminders;
  sections.questions = questionRows.map(toInboxQuestion);

  return sections;
}
