import { sql, type SQL } from "drizzle-orm";

import { subscriptions } from "@/lib/db/schema";

import { addDays, calendarToday, shiftCalendarMonths } from "./dates";
import { HOLDING_STATUSES, type Cadence } from "./params";
import type { FieldStatus, SubscriptionRow } from "./projection";

export type ExpectedNextRenewal = {
  value: string;
  status: "inferred";
  basis: "expected";
};

export type ScheduleFacts = {
  status: SubscriptionRow["status"];
  autoRenewal: SubscriptionRow["auto_renewal"];
  autoRenewalStatus: FieldStatus;
  cadence: SubscriptionRow["cadence"];
  cadenceStatus: FieldStatus;
  nextRenewal: string | null;
  nextRenewalStatus: FieldStatus;
  trialEndsOn?: string | null;
};

/** The four facts that must all be confirmed before a date may be projected. */
export function hasUsableExpectedSchedule(facts: ScheduleFacts): boolean {
  return (
    facts.status === "active" &&
    facts.autoRenewal === "yes" &&
    facts.autoRenewalStatus === "confirmed" &&
    facts.cadence !== null &&
    facts.cadenceStatus === "confirmed" &&
    facts.nextRenewal !== null &&
    facts.nextRenewalStatus === "confirmed"
  );
}

export function scheduleFactsFromRow(
  row: Pick<
    SubscriptionRow,
    | "status"
    | "auto_renewal"
    | "auto_renewal_field_status"
    | "cadence"
    | "cadence_field_status"
    | "next_renewal"
    | "renewal_field_status"
    | "trial_ends_on"
  >,
): ScheduleFacts {
  return {
    status: row.status,
    autoRenewal: row.auto_renewal,
    autoRenewalStatus: row.auto_renewal_field_status,
    cadence: row.cadence,
    cadenceStatus: row.cadence_field_status,
    nextRenewal: row.next_renewal,
    nextRenewalStatus: row.renewal_field_status,
    trialEndsOn: row.trial_ends_on,
  };
}

function calendarMonthDelta(from: string, to: string): number {
  const [fromYear, fromMonth] = from.split("-").map(Number);
  const [toYear, toMonth] = to.split("-").map(Number);

  return (toYear - fromYear) * 12 + (toMonth - fromMonth);
}

function calendarYearDelta(from: string, to: string): number {
  const fromYear = Number(from.slice(0, 4));
  const toYear = Number(to.slice(0, 4));

  return toYear - fromYear;
}

function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);

  return Math.round((end - start) / 86_400_000);
}

/**
 * The nth occurrence after an original recorded date. Each step is taken from
 * the anchor, never from the previous result: 31 Jan + 2 months is 31 Mar, not
 * 28 Mar. `n = 0` is the recorded date itself.
 */
export function occurrenceFromAnchor(anchor: string, cadence: Cadence, n: number): string {
  switch (cadence) {
    case "weekly":
      return addDays(anchor, 7 * n);
    case "monthly":
      return shiftCalendarMonths(anchor, n);
    case "yearly":
      return shiftCalendarMonths(anchor, 12 * n);
  }
}

/**
 * The first occurrence on or after `on`, derived from the original recorded
 * date. Does not write anything and does not reuse `rollNextRenewal`.
 */
export function nextOccurrenceOnOrAfter(
  anchor: string,
  cadence: Cadence,
  on: string,
): string {
  if (anchor >= on) {
    return anchor;
  }

  switch (cadence) {
    case "weekly": {
      const days = daysBetween(anchor, on);
      const n = Math.ceil(days / 7);

      return occurrenceFromAnchor(anchor, cadence, n);
    }
    case "monthly": {
      const n = calendarMonthDelta(anchor, on);
      const candidate = occurrenceFromAnchor(anchor, cadence, n);

      return candidate >= on ? candidate : occurrenceFromAnchor(anchor, cadence, n + 1);
    }
    case "yearly": {
      const n = calendarYearDelta(anchor, on);
      const candidate = occurrenceFromAnchor(anchor, cadence, n);

      return candidate >= on ? candidate : occurrenceFromAnchor(anchor, cadence, n + 1);
    }
  }
}

/**
 * A labelled expected date, or `null` when the row is not an ordinary active
 * recurring holding with confirmed auto-renewal, cadence, and recorded date.
 * Trial, paused, cancelled, and cancellation-scheduled rows never qualify.
 */
export function resolveExpectedNextRenewal(
  facts: ScheduleFacts,
  on = calendarToday(),
): ExpectedNextRenewal | null {
  if (!hasUsableExpectedSchedule(facts) || facts.nextRenewal === null || facts.cadence === null) {
    return null;
  }

  return {
    value: nextOccurrenceOnOrAfter(facts.nextRenewal, facts.cadence, on),
    status: "inferred",
    basis: "expected",
  };
}

/** The date “when is this due next” uses once a row qualifies; otherwise the stored date. */
export function resolveScheduleDueOn(facts: ScheduleFacts, on = calendarToday()): string | null {
  return resolveExpectedNextRenewal(facts, on)?.value ?? facts.nextRenewal;
}

/**
 * Holdings that still need an answer after a relevant date passed. A confirmed
 * auto-renewing active row with a usable expected schedule is not overdue merely
 * because its stored date has passed. A passed trial end still is.
 */
export function isHoldingOverdue(facts: ScheduleFacts, on = calendarToday()): boolean {
  if (!(HOLDING_STATUSES as readonly string[]).includes(facts.status)) {
    return false;
  }

  const usable = hasUsableExpectedSchedule(facts);
  const pastRenewal =
    facts.nextRenewal !== null && facts.nextRenewal < on && !usable;
  const pastTrialEnd =
    facts.status === "trial" &&
    facts.trialEndsOn !== undefined &&
    facts.trialEndsOn !== null &&
    facts.trialEndsOn < on;

  return pastRenewal || pastTrialEnd;
}

const usableExpectedScheduleSql = sql`(
  ${subscriptions.status} = 'active'
  and ${subscriptions.auto_renewal} = 'yes'
  and ${subscriptions.auto_renewal_field_status} = 'confirmed'
  and ${subscriptions.cadence} is not null
  and ${subscriptions.cadence_field_status} = 'confirmed'
  and ${subscriptions.next_renewal} is not null
  and ${subscriptions.renewal_field_status} = 'confirmed'
)`;

function monthlyOccurrenceSql(on: string): SQL {
  const months = sql`(
    (extract(year from ${on}::date)::int - extract(year from ${subscriptions.next_renewal})::int) * 12
    + (extract(month from ${on}::date)::int - extract(month from ${subscriptions.next_renewal})::int)
  )`;
  const candidate = sql`(${subscriptions.next_renewal}::date + (${months}) * interval '1 month')::date`;

  return sql`(
    case
      when ${candidate} >= ${on}::date then ${candidate}
      else (${subscriptions.next_renewal}::date + (${months} + 1) * interval '1 month')::date
    end
  )`;
}

function yearlyOccurrenceSql(on: string): SQL {
  const years = sql`(
    extract(year from ${on}::date)::int - extract(year from ${subscriptions.next_renewal})::int
  )`;
  const candidate = sql`(${subscriptions.next_renewal}::date + (${years}) * interval '1 year')::date`;

  return sql`(
    case
      when ${candidate} >= ${on}::date then ${candidate}
      else (${subscriptions.next_renewal}::date + (${years} + 1) * interval '1 year')::date
    end
  )`;
}

function weeklyOccurrenceSql(on: string): SQL {
  return sql`(
    ${subscriptions.next_renewal}::date
    + ((((${on}::date - ${subscriptions.next_renewal}::date) + 6) / 7) * 7)
  )`;
}

/** Same resolver as `resolveExpectedNextRenewal`, for sort/filter/Inbox SQL. */
export function expectedNextRenewalSql(on: string): SQL {
  return sql`(
    case
      when not ${usableExpectedScheduleSql} then null
      when ${subscriptions.next_renewal} >= ${on}::date then ${subscriptions.next_renewal}
      when ${subscriptions.cadence} = 'weekly' then ${weeklyOccurrenceSql(on)}
      when ${subscriptions.cadence} = 'monthly' then ${monthlyOccurrenceSql(on)}
      when ${subscriptions.cadence} = 'yearly' then ${yearlyOccurrenceSql(on)}
      else null
    end
  )`;
}

/** Recorded date for the recorded field; expected date for “when is this due next”. */
export function scheduleDueOnSql(on: string): SQL {
  return sql`coalesce(${expectedNextRenewalSql(on)}, ${subscriptions.next_renewal})`;
}

export function overdueSql(on: string): SQL {
  return sql`(
    ${subscriptions.status} in ('active', 'trial', 'paused', 'cancel_scheduled')
    and (
      (
        ${subscriptions.next_renewal} is not null
        and ${subscriptions.next_renewal} < ${on}::date
        and not ${usableExpectedScheduleSql}
      )
      or (
        ${subscriptions.status} = 'trial'
        and ${subscriptions.trial_ends_on} is not null
        and ${subscriptions.trial_ends_on} < ${on}::date
      )
    )
  )`;
}
