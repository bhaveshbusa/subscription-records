import { and, eq, gte, inArray, isNotNull, lte, or, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { reminders, subscriptions } from "@/lib/db/schema";
import { toReminderView, type ReminderKind, type ReminderView } from "@/lib/reminders/projection";
import { addDays } from "@/lib/subscriptions/dates";
import { formatDate, formatMoneyMinor } from "@/lib/subscriptions/format";
import { today } from "@/lib/subscriptions/query";

export type ReminderScanClient = Pick<NodePgDatabase, "select" | "insert">;

/**
 * How far ahead a renewal is worth mentioning. A week is long enough to cancel
 * something before it bills again, and short enough that the inbox is not a list
 * of everything you pay for.
 */
export const RENEWAL_LEAD_DAYS = 7;

/** The last renewal date the scan reminds about on this run. */
export function renewalHorizon(now: Date): string {
  return addDays(today(now), RENEWAL_LEAD_DAYS);
}

type ReminderRow = {
  id: string;
  user_id: string;
  provider_display: string;
  status: (typeof subscriptions.status.enumValues)[number];
  amount_minor: number | null;
  currency: string;
  cadence: (typeof subscriptions.cadence.enumValues)[number] | null;
  next_renewal: string | null;
  renewal_field_status: (typeof subscriptions.renewal_field_status.enumValues)[number];
  amount_field_status: (typeof subscriptions.amount_field_status.enumValues)[number];
  cadence_field_status: (typeof subscriptions.cadence_field_status.enumValues)[number];
  deferred_until: Date | null;
};

/** A nudge the scan wants to raise, before it knows whether it already has. */
export type PendingReminder = {
  kind: ReminderKind;
  dueOn: string;
  body: string;
};

export type ReminderScanResult = {
  /** Subscriptions with a renewal in the window or a deferral now due. */
  scanned: number;
  raised: {
    subscriptionId: string;
    provider: string;
    kind: ReminderKind;
    dueOn: string;
    reminder: ReminderView;
  }[];
  /** Nudges left alone because this subscription was already reminded about them. */
  skipped: {
    subscriptionId: string;
    provider: string;
    kind: ReminderKind;
    dueOn: string;
    reason: "already_reminded";
  }[];
};

/** The manual run's answer: what it raised, and the window it looked in. */
export type ReminderScanResponse = ReminderScanResult & {
  leadDays: number;
  renewalHorizon: string;
};

/** The terms the user put off answering, in the order the inbox reads them. */
export function deferredTermFields(
  row: Pick<
    ReminderRow,
    "amount_field_status" | "cadence_field_status" | "renewal_field_status"
  >,
): ("amount" | "cadence" | "renewal")[] {
  const fields: ("amount" | "cadence" | "renewal")[] = [];

  if (row.amount_field_status === "deferred") {
    fields.push("amount");
  }

  if (row.cadence_field_status === "deferred") {
    fields.push("cadence");
  }

  if (row.renewal_field_status === "deferred") {
    fields.push("renewal");
  }

  return fields;
}

function sentence(parts: string[]): string {
  if (parts.length <= 1) {
    return parts.join("");
  }

  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

const TERM_LABEL = {
  amount: "the price",
  cadence: "how often it bills",
  renewal: "when it renews",
} as const;

/**
 * The day a deferral came due, which is the day the user asked to be asked
 * again. `null` when nothing was put off, or when that day has not arrived.
 */
export function deferralDueOn(row: Pick<ReminderRow, "deferred_until">, now: Date): string | null {
  if (!row.deferred_until || row.deferred_until > now) {
    return null;
  }

  return row.deferred_until.toISOString().slice(0, 10);
}

/**
 * The renewal worth mentioning: one inside the lead window on a subscription
 * that is still billing. A past renewal is a stale schedule (rolled, not a
 * lapse), not a reminder.
 */
export function renewalDueOn(
  row: Pick<ReminderRow, "status" | "next_renewal">,
  now: Date,
): string | null {
  if (row.status !== "active" && row.status !== "trial") {
    return null;
  }

  if (!row.next_renewal) {
    return null;
  }

  return row.next_renewal >= today(now) && row.next_renewal <= renewalHorizon(now)
    ? row.next_renewal
    : null;
}

/** What the row currently says it costs, or nothing when it does not say. */
function priceClause(row: Pick<ReminderRow, "amount_minor" | "currency" | "cadence">): string {
  if (row.amount_minor === null) {
    return "";
  }

  const money = formatMoneyMinor(row.amount_minor, row.currency);

  return row.cadence ? ` for ${money} ${row.cadence}` : ` for ${money}`;
}

/**
 * A renewal reminder repeats what the ledger already holds and says how sure it
 * is of it. An unconfirmed date stays unconfirmed: the reminder says so in as
 * many words, because a nudge is not evidence.
 */
export function renewalReminderBody(
  row: Pick<
    ReminderRow,
    "provider_display" | "amount_minor" | "currency" | "cadence" | "renewal_field_status"
  >,
  dueOn: string,
  now: Date,
): string {
  const days = daysUntil(dueOn, now);
  const when =
    days === 0 ? "today" : days === 1 ? "tomorrow" : `on ${formatDate(dueOn)}, in ${days} days`;

  return `${row.provider_display} renews ${when}${priceClause(row)}. ${renewalTrust(
    row.renewal_field_status,
  )}`;
}

/**
 * How much the renewal date is worth, said plainly. Only the user confirms a
 * date, so a reminder about an unconfirmed one has to admit it is a guess rather
 * than quietly presenting it as settled.
 */
function renewalTrust(status: ReminderRow["renewal_field_status"]): string {
  switch (status) {
    case "confirmed":
      return "This is the date you confirmed.";
    case "conflicted":
      return "Two sources disagree about this date, and it stays unconfirmed until you settle it.";
    case "empty":
      return "Nobody has confirmed this date.";
    case "proposed":
    case "inferred":
    case "deferred":
      return `This date is ${status} and stays that way until you confirm it yourself.`;
  }
}

/** Whole days from today to a date, in UTC. */
export function daysUntil(dueOn: string, now: Date): number {
  const start = Date.parse(`${today(now)}T00:00:00.000Z`);
  const end = Date.parse(`${dueOn}T00:00:00.000Z`);

  return Math.round((end - start) / 86_400_000);
}

/** A deferred-terms reminder names what is still open and where to answer it. */
export function deferredReminderBody(
  row: Pick<
    ReminderRow,
    | "provider_display"
    | "amount_field_status"
    | "cadence_field_status"
    | "renewal_field_status"
  >,
  dueOn: string,
): string {
  const fields = deferredTermFields(row).map((field) => TERM_LABEL[field]);

  return `You put off ${sentence(fields)} for ${row.provider_display} until ${formatDate(
    dueOn,
  )}. Nothing has been filled in for you: the ${
    fields.length === 1 ? "field is" : "fields are"
  } still waiting for your answer.`;
}

/**
 * Every nudge this subscription is due, which may be both: a renewal coming up
 * on a row whose price the user also put off answering.
 */
export function remindersFor(row: ReminderRow, now: Date): PendingReminder[] {
  const pending: PendingReminder[] = [];
  const deferralDue = deferralDueOn(row, now);
  const renewalDue = renewalDueOn(row, now);

  if (deferralDue && deferredTermFields(row).length > 0) {
    pending.push({
      kind: "deferred_terms",
      dueOn: deferralDue,
      body: deferredReminderBody(row, deferralDue),
    });
  }

  if (renewalDue) {
    pending.push({
      kind: "upcoming_renewal",
      dueOn: renewalDue,
      body: renewalReminderBody(row, renewalDue, now),
    });
  }

  return pending;
}

function reminderKey(subscriptionId: string, kind: ReminderKind, dueOn: string): string {
  return `${subscriptionId}:${kind}:${dueOn}`;
}

async function remindableSubscriptions(
  client: ReminderScanClient,
  options: { userId: string | null; now: Date },
): Promise<ReminderRow[]> {
  const dueDeferral = and(
    isNotNull(subscriptions.deferred_until),
    lte(subscriptions.deferred_until, options.now),
    or(
      eq(subscriptions.amount_field_status, "deferred"),
      eq(subscriptions.cadence_field_status, "deferred"),
      eq(subscriptions.renewal_field_status, "deferred"),
    ),
  );
  const upcomingRenewal = and(
    inArray(subscriptions.status, ["active", "trial"]),
    isNotNull(subscriptions.next_renewal),
    gte(subscriptions.next_renewal, today(options.now)),
    lte(subscriptions.next_renewal, renewalHorizon(options.now)),
  );
  const conditions: SQL[] = [or(dueDeferral, upcomingRenewal) as SQL];

  if (options.userId) {
    conditions.push(eq(subscriptions.user_id, options.userId));
  }

  return client
    .select({
      id: subscriptions.id,
      user_id: subscriptions.user_id,
      provider_display: subscriptions.provider_display,
      status: subscriptions.status,
      amount_minor: subscriptions.amount_minor,
      currency: subscriptions.currency,
      cadence: subscriptions.cadence,
      next_renewal: subscriptions.next_renewal,
      renewal_field_status: subscriptions.renewal_field_status,
      amount_field_status: subscriptions.amount_field_status,
      cadence_field_status: subscriptions.cadence_field_status,
      deferred_until: subscriptions.deferred_until,
    })
    .from(subscriptions)
    .where(and(...conditions))
    .orderBy(subscriptions.next_renewal, subscriptions.provider_display);
}

/**
 * Nudges these subscriptions have already had, whatever the user did with them.
 * A dismissed reminder is an answer — the user has seen it — so the same day is
 * not raised again.
 */
async function remindedAlready(
  client: ReminderScanClient,
  subscriptionIds: string[],
): Promise<Set<string>> {
  const rows = await client
    .select({
      subscription_id: reminders.subscription_id,
      kind: reminders.kind,
      due_on: reminders.due_on,
    })
    .from(reminders)
    .where(inArray(reminders.subscription_id, subscriptionIds));

  return new Set(rows.map((row) => reminderKey(row.subscription_id, row.kind, row.due_on)));
}

/**
 * Looks for the two things worth a nudge: terms the user asked to be reminded
 * about, now that the day has come, and renewals inside the next week.
 *
 * The scan only ever inserts reminders. It writes no subscription column, moves
 * no field to `confirmed`, and raises no proposal, so being reminded that
 * Netflix renews on Friday leaves that date exactly as trusted as it was.
 *
 * Runs for one user when given a `userId`, and across every user otherwise,
 * which is what the nightly cron does.
 */
export async function scanForReminders(
  client: ReminderScanClient,
  options: { userId?: string | null; now?: Date } = {},
): Promise<ReminderScanResult> {
  const now = options.now ?? new Date();
  const rows = await remindableSubscriptions(client, {
    userId: options.userId ?? null,
    now,
  });
  const result: ReminderScanResult = { scanned: rows.length, raised: [], skipped: [] };

  if (rows.length === 0) {
    return result;
  }

  const seen = await remindedAlready(
    client,
    rows.map((row) => row.id),
  );
  const raising: { row: ReminderRow; reminder: PendingReminder }[] = [];

  for (const row of rows) {
    for (const reminder of remindersFor(row, now)) {
      if (seen.has(reminderKey(row.id, reminder.kind, reminder.dueOn))) {
        result.skipped.push({
          subscriptionId: row.id,
          provider: row.provider_display,
          kind: reminder.kind,
          dueOn: reminder.dueOn,
          reason: "already_reminded",
        });
        continue;
      }

      raising.push({ row, reminder });
    }
  }

  if (raising.length === 0) {
    return result;
  }

  /**
   * Two runs at once would otherwise both insert: the unique index makes the
   * second a no-op rather than a duplicate nudge.
   */
  const raised = await client
    .insert(reminders)
    .values(
      raising.map(({ row, reminder }) => ({
        user_id: row.user_id,
        subscription_id: row.id,
        kind: reminder.kind,
        state: "pending" as const,
        due_on: reminder.dueOn,
        body: reminder.body,
      })),
    )
    .onConflictDoNothing({
      target: [reminders.subscription_id, reminders.kind, reminders.due_on],
    })
    .returning();
  const byKey = new Map(
    raised.map((row) => [reminderKey(row.subscription_id, row.kind, row.due_on), row]),
  );

  for (const { row, reminder } of raising) {
    const inserted = byKey.get(reminderKey(row.id, reminder.kind, reminder.dueOn));

    if (!inserted) {
      result.skipped.push({
        subscriptionId: row.id,
        provider: row.provider_display,
        kind: reminder.kind,
        dueOn: reminder.dueOn,
        reason: "already_reminded",
      });
      continue;
    }

    result.raised.push({
      subscriptionId: row.id,
      provider: row.provider_display,
      kind: reminder.kind,
      dueOn: reminder.dueOn,
      reminder: toReminderView(inserted, row.provider_display),
    });
  }

  return result;
}
