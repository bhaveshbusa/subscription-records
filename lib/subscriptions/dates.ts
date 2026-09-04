import type { Cadence } from "./params";

/** Today's calendar date in UTC, so a local timezone cannot shift the day. */
export function calendarToday(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Calendar arithmetic in UTC, so a date string never shifts by a timezone. */
export function addDays(from: string, days: number): string {
  const date = new Date(`${from}T00:00:00.000Z`);

  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

function addMonths(from: string, months: number): string {
  const date = new Date(`${from}T00:00:00.000Z`);
  const day = date.getUTCDate();

  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);

  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();

  date.setUTCDate(Math.min(day, lastDay));

  return date.toISOString().slice(0, 10);
}

/** Shift a calendar date by whole months, clamping the day (31 Jan → 28 Feb). */
export function shiftCalendarMonths(from: string, months: number): string {
  return addMonths(from, months);
}

/** One billing period after `from`, clamped to the month: 31 Jan → 28 Feb. */
export function advanceByCadence(from: string, cadence: Cadence): string {
  switch (cadence) {
    case "weekly":
      return addDays(from, 7);
    case "monthly":
      return addMonths(from, 1);
    case "yearly":
      return addMonths(from, 12);
  }
}

/**
 * Advance `from` by cadence until it is `on` or later. Used to turn a stale
 * `next_renewal` into the next due date without treating silence as a lapse.
 */
export function rollNextRenewal(from: string, cadence: Cadence, on: string): string {
  let date = from;
  let steps = 0;

  while (date < on && steps < 1200) {
    date = advanceByCadence(date, cadence);
    steps += 1;
  }

  return date;
}
