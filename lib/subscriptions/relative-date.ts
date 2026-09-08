import { addDays, calendarToday, shiftCalendarMonths } from "./dates";
import { calendarDateSchema } from "./params";

const ISO_DATE_PATTERN = /\b(\d{4}-\d{2}-\d{2})\b/;

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

const MONTH_INDEX: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sept: 8,
  sep: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

const AGO_PATTERN =
  /\b(a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+)\s+(days?|weeks?|months?|years?)\s+ago\b/i;

const LAST_UNIT_PATTERN = /\blast\s+(week|month|year)\b/i;

const MONTH_NAME_PATTERN = new RegExp(
  `\\b(?:in|last)\\s+(${Object.keys(MONTH_INDEX).join("|")})\\b`,
  "i",
);

function parseCount(raw: string): number | null {
  if (/^\d+$/.test(raw)) {
    return Number(raw);
  }

  return NUMBER_WORDS[raw.toLowerCase()] ?? null;
}

const MONTH_NAME_ALTERNATION = Object.keys(MONTH_INDEX)
  .sort((left, right) => right.length - left.length)
  .join("|");

const DAY_MONTH_PATTERN = new RegExp(
  `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_NAME_ALTERNATION})(?:\\s*,?\\s*(\\d{4}))?\\b`,
  "i",
);

const MONTH_DAY_PATTERN = new RegExp(
  `\\b(${MONTH_NAME_ALTERNATION})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*,?\\s*(\\d{4}))?\\b`,
  "i",
);

function isoDateIn(text: string): string | null {
  const match = ISO_DATE_PATTERN.exec(text);

  if (!match) {
    return null;
  }

  return calendarDateSchema.safeParse(match[1]).success ? match[1] : null;
}

function monthOnDay(year: number, monthIndex: number, day: number): string {
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

  return new Date(Date.UTC(year, monthIndex, Math.min(day, lastDay))).toISOString().slice(0, 10);
}

/**
 * A past day the user stated. Approximate is enough.
 *
 * **Rule:** "N months ago" subtracts N calendar months from today, clamping the
 * day (31 Jan minus one month → 28 Feb). "In March" / "last March" is that
 * month on today's day-of-month: this year if that date is not in the future,
 * otherwise last year.
 */
export function readPastEventDate(text: string, now = new Date()): string | null {
  const on = calendarToday(now);
  const iso = isoDateIn(text);

  if (iso) {
    return iso <= on ? iso : null;
  }

  if (/\byesterday\b/i.test(text)) {
    return addDays(on, -1);
  }

  const lastUnit = LAST_UNIT_PATTERN.exec(text);

  if (lastUnit) {
    const unit = lastUnit[1].toLowerCase();

    if (unit === "week") {
      return addDays(on, -7);
    }

    if (unit === "month") {
      return shiftCalendarMonths(on, -1);
    }

    return shiftCalendarMonths(on, -12);
  }

  const ago = AGO_PATTERN.exec(text);

  if (ago) {
    const count = parseCount(ago[1]);

    if (count === null || count < 1) {
      return null;
    }

    const unit = ago[2].toLowerCase();

    if (unit.startsWith("day")) {
      return addDays(on, -count);
    }

    if (unit.startsWith("week")) {
      return addDays(on, -(count * 7));
    }

    if (unit.startsWith("month")) {
      return shiftCalendarMonths(on, -count);
    }

    return shiftCalendarMonths(on, -(count * 12));
  }

  const named = MONTH_NAME_PATTERN.exec(text);

  if (named) {
    const monthIndex = MONTH_INDEX[named[1].toLowerCase()];
    const day = new Date(`${on}T00:00:00.000Z`).getUTCDate();
    const thisYear = new Date(`${on}T00:00:00.000Z`).getUTCFullYear();
    const candidate = monthOnDay(thisYear, monthIndex, day);

    return candidate <= on ? candidate : monthOnDay(thisYear - 1, monthIndex, day);
  }

  return null;
}

function dateFromNamedParts(
  day: number,
  monthName: string,
  year: number | null,
  today: string,
): string | null {
  const monthIndex = MONTH_INDEX[monthName.toLowerCase()];

  if (monthIndex === undefined || day < 1 || day > 31) {
    return null;
  }

  if (year !== null) {
    const dated = monthOnDay(year, monthIndex, day);

    return calendarDateSchema.safeParse(dated).success ? dated : null;
  }

  const thisYear = new Date(`${today}T00:00:00.000Z`).getUTCFullYear();
  const thisYearDate = monthOnDay(thisYear, monthIndex, day);

  return thisYearDate >= today ? thisYearDate : monthOnDay(thisYear + 1, monthIndex, day);
}

/**
 * A calendar day the message states, including a future trial end. ISO dates
 * win. A day and month without a year is this year when that date is today or
 * later, otherwise next year.
 */
export function readStatedCalendarDate(text: string, now = new Date()): string | null {
  const iso = isoDateIn(text);

  if (iso) {
    return iso;
  }

  const today = calendarToday(now);
  const dayMonth = DAY_MONTH_PATTERN.exec(text);

  if (dayMonth) {
    return dateFromNamedParts(
      Number(dayMonth[1]),
      dayMonth[2],
      dayMonth[3] ? Number(dayMonth[3]) : null,
      today,
    );
  }

  const monthDay = MONTH_DAY_PATTERN.exec(text);

  if (monthDay) {
    return dateFromNamedParts(
      Number(monthDay[2]),
      monthDay[1],
      monthDay[3] ? Number(monthDay[3]) : null,
      today,
    );
  }

  return null;
}
