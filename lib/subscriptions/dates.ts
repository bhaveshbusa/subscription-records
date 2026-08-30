import type { Cadence } from "./params";

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
