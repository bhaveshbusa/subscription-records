import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { amendments, charges, events, subscriptions } from "@/lib/db/schema";

import { decodeCursor, encodeCursor, querySignature } from "./cursor";
import type { ListQuery } from "./params";
import {
  toDetail,
  toListItem,
  type SubscriptionDetail,
  type SubscriptionListItem,
} from "./projection";

/** Accepts both the pooled client and a transaction, so tests can roll back. */
export type QueryClient = Pick<NodePgDatabase, "select">;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Statuses that still bill the user, and so count towards the monthly total. */
const BILLING_STATUSES = ["active", "trial", "cancel_scheduled"] as const;

export const monthlyEquivalentSql = sql<number | null>`case
  when ${subscriptions.amount_minor} is null or ${subscriptions.cadence} is null then null
  when ${subscriptions.cadence} = 'monthly' then ${subscriptions.amount_minor}
  when ${subscriptions.cadence} = 'yearly' then round(${subscriptions.amount_minor}::numeric / 12)::int
  else round(${subscriptions.amount_minor}::numeric * 52 / 12)::int
end`;

const needsAttentionSql = sql`(
  ${subscriptions.status} in ('unknown', 'lapsed')
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

export function today(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function addDays(from: string, days: number) {
  const date = new Date(`${from}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function likePattern(value: string) {
  return `%${value.replace(/([\\%_])/g, "\\$1")}%`;
}

function filters(userId: string, query: ListQuery, now: Date): SQL[] {
  const conditions: SQL[] = [eq(subscriptions.user_id, userId)];

  if (query.q) {
    const pattern = likePattern(query.q);
    conditions.push(
      sql`(
        ${subscriptions.provider_display} ilike ${pattern}
        or ${subscriptions.provider_canonical} ilike ${pattern}
        or coalesce(${subscriptions.plan}, '') ilike ${pattern}
        or coalesce(${subscriptions.account_hint}, '') ilike ${pattern}
      )`,
    );
  }

  if (query.status) {
    conditions.push(inArray(subscriptions.status, query.status));
  }

  if (query.needsAttention !== undefined) {
    conditions.push(query.needsAttention ? needsAttentionSql : sql`not ${needsAttentionSql}`);
  }

  if (query.renewingWithinDays !== undefined) {
    const from = today(now);
    const to = addDays(from, query.renewingWithinDays);
    conditions.push(
      sql`${subscriptions.next_renewal} is not null
        and ${subscriptions.next_renewal} between ${from}::date and ${to}::date`,
    );
  }

  return conditions;
}

type SortPlan = { expression: SQL; cast: string };

function sortPlan(query: ListQuery): SortPlan {
  const nullsLast = query.order === "asc";

  switch (query.sort) {
    case "provider":
      return { expression: sql`${subscriptions.provider_display}`, cast: "text" };
    case "updatedAt":
      return { expression: sql`${subscriptions.updated_at}`, cast: "timestamptz" };
    case "monthlyEquivalent":
      return {
        expression: sql`coalesce(${monthlyEquivalentSql}, ${
          nullsLast ? sql`2147483647` : sql`-2147483648`
        })`,
        cast: "int",
      };
    case "nextRenewal":
      return {
        expression: sql`coalesce(${subscriptions.next_renewal}, ${
          nullsLast ? sql`date '9999-12-31'` : sql`date '0001-01-01'`
        })`,
        cast: "date",
      };
  }
}

export type ListResult =
  | { ok: true; items: SubscriptionListItem[]; nextCursor: string | null }
  | { ok: false; error: "invalid_cursor" };

export async function listSubscriptions(
  client: QueryClient,
  options: { userId: string; query: ListQuery; now?: Date },
): Promise<ListResult> {
  const now = options.now ?? new Date();
  const { query } = options;
  const plan = sortPlan(query);
  const conditions = filters(options.userId, query, now);
  const signature = querySignature(query);

  if (query.cursor) {
    const cursor = decodeCursor(query.cursor, signature);

    if (!cursor) {
      return { ok: false, error: "invalid_cursor" };
    }

    const bound = sql.raw(plan.cast);
    conditions.push(
      query.order === "asc"
        ? sql`(${plan.expression}, ${subscriptions.id}) > (${cursor.sortValue}::${bound}, ${cursor.id}::uuid)`
        : sql`(${plan.expression}, ${subscriptions.id}) < (${cursor.sortValue}::${bound}, ${cursor.id}::uuid)`,
    );
  }

  const direction = query.order === "asc" ? asc : desc;
  const rows = await client
    .select({
      row: subscriptions,
      sortValue: sql<string>`(${plan.expression})::text`,
    })
    .from(subscriptions)
    .where(and(...conditions))
    .orderBy(direction(plan.expression), direction(subscriptions.id))
    .limit(query.limit + 1);

  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  const nextCursor =
    rows.length > query.limit && last
      ? encodeCursor({ sortValue: last.sortValue, id: last.row.id, signature })
      : null;

  return { ok: true, items: page.map((entry) => toListItem(entry.row, now)), nextCursor };
}

export type SubscriptionSummary = {
  activeCount: number;
  trialCount: number;
  needsAttentionCount: number;
  monthlyEquivalentMinor: number;
  currency: string;
  nextRenewal: { subscriptionId: string; provider: string; on: string } | null;
};

export async function getSummary(
  client: QueryClient,
  options: { userId: string; now?: Date },
): Promise<SubscriptionSummary> {
  const now = options.now ?? new Date();
  const scope = eq(subscriptions.user_id, options.userId);

  const [totals] = await client
    .select({
      activeCount: sql<number>`count(*) filter (where ${subscriptions.status} = 'active')::int`,
      trialCount: sql<number>`count(*) filter (where ${subscriptions.status} = 'trial')::int`,
      needsAttentionCount: sql<number>`count(*) filter (where ${needsAttentionSql})::int`,
      monthlyEquivalentMinor: sql<number>`coalesce(sum(${monthlyEquivalentSql}) filter (
        where ${subscriptions.currency} = 'GBP'
        and ${inArray(subscriptions.status, [...BILLING_STATUSES])}
      ), 0)::int`,
    })
    .from(subscriptions)
    .where(scope);

  const [upcoming] = await client
    .select({
      subscriptionId: subscriptions.id,
      provider: subscriptions.provider_display,
      on: subscriptions.next_renewal,
    })
    .from(subscriptions)
    .where(
      and(
        scope,
        sql`${subscriptions.next_renewal} is not null
          and ${subscriptions.next_renewal} >= ${today(now)}::date
          and ${subscriptions.status} not in ('cancelled', 'lapsed')`,
      ),
    )
    .orderBy(asc(subscriptions.next_renewal))
    .limit(1);

  return {
    activeCount: totals.activeCount,
    trialCount: totals.trialCount,
    needsAttentionCount: totals.needsAttentionCount,
    monthlyEquivalentMinor: totals.monthlyEquivalentMinor,
    currency: "GBP",
    nextRenewal:
      upcoming && upcoming.on
        ? {
            subscriptionId: upcoming.subscriptionId,
            provider: upcoming.provider,
            on: upcoming.on,
          }
        : null,
  };
}

export async function getSubscriptionDetail(
  client: QueryClient,
  options: { userId: string; id: string; now?: Date },
): Promise<SubscriptionDetail | null> {
  if (!UUID_PATTERN.test(options.id)) {
    return null;
  }

  const [row] = await client
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.user_id, options.userId), eq(subscriptions.id, options.id)))
    .limit(1);

  if (!row) {
    return null;
  }

  const scope = (table: typeof amendments | typeof charges | typeof events) =>
    and(eq(table.user_id, options.userId), eq(table.subscription_id, options.id));

  const amendmentRows = await client
    .select()
    .from(amendments)
    .where(scope(amendments))
    .orderBy(desc(amendments.effective_from));
  const eventRows = await client.select().from(events).where(scope(events)).orderBy(desc(events.at));
  const chargeRows = await client
    .select()
    .from(charges)
    .where(scope(charges))
    .orderBy(desc(charges.paid_on));

  return toDetail(
    row,
    {
      amendments: amendmentRows,
      events: eventRows,
      charges: chargeRows,
    },
    options.now,
  );
}
