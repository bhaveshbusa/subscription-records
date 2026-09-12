import { calendarToday, shiftCalendarMonths } from "@/lib/subscriptions/dates";

import type { ExtractionCandidate } from "./candidates";

/**
 * What a stated service period says about the terms, when it says it plainly.
 * The period end is not a renewal the invoice states: it is the next boundary
 * if the service continues, so it arrives `inferred` and the card says why.
 */
export type ServicePeriodReading = {
  cadence: "monthly";
  nextBoundary: string;
  continuation: string;
};

/**
 * Read only the simple case: one full calendar month, and today falls inside
 * it. A period that has already ended is history, one that has not started is
 * not the current terms, and any other length may be prorated or a different
 * cadence — those return null so the usual question is asked instead.
 */
export function readServicePeriod(
  period: ExtractionCandidate["servicePeriod"],
  now = new Date(),
): ServicePeriodReading | null {
  if (!period) {
    return null;
  }

  const today = calendarToday(now);

  if (period.to !== shiftCalendarMonths(period.from, 1)) {
    return null;
  }

  if (today < period.from || today > period.to) {
    return null;
  }

  return {
    cadence: "monthly",
    nextBoundary: period.to,
    continuation: `Service period ${period.from} to ${period.to} is one calendar month, so the cadence is read as monthly and ${period.to} is the next payment boundary if the service continues. The invoice's issue or due date is not the renewal, and nothing here confirms auto-renewal.`,
  };
}

/** The evidence shown on the card, with the period reading's assumption spelled out. */
export function reviewRationale(candidate: ExtractionCandidate, now = new Date()): string {
  const reading = readServicePeriod(candidate.servicePeriod, now);

  return reading ? `${candidate.evidence} ${reading.continuation}` : candidate.evidence;
}
