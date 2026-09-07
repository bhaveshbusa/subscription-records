import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { subscriptions } from "@/lib/db/schema";
import { addDays } from "@/lib/subscriptions/dates";
import { HOLDING_STATUSES, type Cadence } from "@/lib/subscriptions/params";
import { toListItem, type SubscriptionListItem } from "@/lib/subscriptions/projection";
import { today } from "@/lib/subscriptions/query";

/** Accepts both the pooled client and a transaction, so tests can roll back. */
export type InboxClient = Pick<NodePgDatabase, "select">;

/** Renewing soon is a glance, so only what is still billing can appear in it. */
const BILLING_NOW = ["active", "trial"] as const;

/**
 * How far ahead a renewal is worth a glance, by cadence. A yearly bill gets a
 * month because it is large and easy to forget; a monthly one gets a week.
 *
 * Weekly is deliberately absent. It comes round again before anyone could act
 * on the warning, so it would sit in the section every week and teach the user
 * to ignore the section.
 */
export const RENEWING_SOON_DAYS = { yearly: 30, monthly: 7 } as const;

/** Days of notice for a cadence, or `null` when it never counts as soon. */
export function renewingSoonDays(cadence: Cadence | null): number | null {
  if (cadence === null) {
    return null;
  }

  switch (cadence) {
    case "yearly":
      return RENEWING_SOON_DAYS.yearly;
    case "monthly":
      return RENEWING_SOON_DAYS.monthly;
    case "weekly":
      return null;
  }
}

/**
 * A holding row whose stored `next_renewal` has passed. Nothing rolls it, so it
 * stays here until the user says what happened.
 */
function overdueSql(on: string): SQL {
  return sql`(
    ${inArray(subscriptions.status, [...HOLDING_STATUSES])}
    and ${subscriptions.next_renewal} is not null
    and ${subscriptions.next_renewal} < ${on}::date
  )`;
}

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

/**
 * Built from the same `RENEWING_SOON_DAYS` the pure helper reads, so the SQL
 * and the rule can't drift apart. A past date is Overdue, never soon.
 */
function renewingSoonSql(on: string): SQL {
  const windows = (Object.keys(RENEWING_SOON_DAYS) as (keyof typeof RENEWING_SOON_DAYS)[]).map(
    (cadence) =>
      sql`(
        ${subscriptions.cadence} = ${cadence}
        and ${subscriptions.next_renewal} <= ${addDays(on, RENEWING_SOON_DAYS[cadence])}::date
      )`,
  );

  return sql`(
    ${inArray(subscriptions.status, [...BILLING_NOW])}
    and ${subscriptions.next_renewal} is not null
    and ${subscriptions.next_renewal} >= ${on}::date
    and (${sql.join(windows, sql` or `)})
  )`;
}

export type InboxSections = {
  overdue: SubscriptionListItem[];
  unfinished: SubscriptionListItem[];
  renewingSoon: SubscriptionListItem[];
};

/**
 * The ledger rows Inbox works from, in three sections projected out of the same
 * tables the ledger reads. Nothing here is persisted and nothing is written: a
 * section is a question about a row, and the row is the only source of truth.
 *
 * A row can be in more than one section when more than one thing is true of it
 * — overdue and conflicted, say. It is listed in both rather than hidden from
 * one, because hiding it is how a work list loses work.
 */
export async function getInboxSections(
  client: InboxClient,
  options: { userId: string; now?: Date },
): Promise<InboxSections> {
  const on = today(options.now ?? new Date());
  const overdue = overdueSql(on);
  const unfinished = unfinishedSql();
  const renewingSoon = renewingSoonSql(on);

  const rows = await client
    .select({
      row: subscriptions,
      isOverdue: sql<boolean>`${overdue}`,
      isUnfinished: sql<boolean>`${unfinished}`,
      isRenewingSoon: sql<boolean>`${renewingSoon}`,
    })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.user_id, options.userId),
        sql`(${overdue} or ${unfinished} or ${renewingSoon})`,
      ),
    )
    /** Soonest date first within every section; dateless rows last, by name. */
    .orderBy(
      asc(sql`coalesce(${subscriptions.next_renewal}, date '9999-12-31')`),
      asc(subscriptions.provider_display),
    );

  const sections: InboxSections = { overdue: [], unfinished: [], renewingSoon: [] };

  for (const entry of rows) {
    const item = toListItem(entry.row);

    if (entry.isOverdue) {
      sections.overdue.push(item);
    }

    if (entry.isUnfinished) {
      sections.unfinished.push(item);
    }

    if (entry.isRenewingSoon) {
      sections.renewingSoon.push(item);
    }
  }

  return sections;
}
