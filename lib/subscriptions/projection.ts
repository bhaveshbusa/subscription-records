import type { InferSelectModel } from "drizzle-orm";

import type { amendments, events, subscriptions } from "@/lib/db/schema";
import type { ReminderPreferencesView } from "@/lib/reminders/preferences";

import { calendarToday } from "./dates";
import {
  resolveExpectedNextRenewal,
  scheduleFactsFromRow,
  type ExpectedNextRenewal,
} from "./schedule";

export type SubscriptionRow = InferSelectModel<typeof subscriptions>;
export type AmendmentRow = InferSelectModel<typeof amendments>;
export type EventRow = InferSelectModel<typeof events>;

type Cadence = NonNullable<SubscriptionRow["cadence"]>;
export type FieldStatus = SubscriptionRow["provider_field_status"];
type Confidence = NonNullable<SubscriptionRow["amount_confidence"]>;
type AutoRenewal = NonNullable<SubscriptionRow["auto_renewal"]>;

type Field<T> = {
  value: T | null;
  status: FieldStatus;
  confidence: Confidence | null;
};

export type Money = { minor: number; currency: string };

export type SubscriptionListItem = {
  id: string;
  provider: Field<string>;
  plan: Field<string>;
  status: Field<SubscriptionRow["status"]>;
  amount: Field<Money>;
  cadence: Field<Cadence>;
  nextRenewal: Field<string>;
  /**
   * Present only for an active holding with confirmed auto-renewal yes, confirmed
   * cadence, and a confirmed recorded date. Never written back onto `nextRenewal`.
   */
  expectedNextRenewal?: ExpectedNextRenewal;
  trialEndsOn: Field<string>;
  autoRenewal: Field<AutoRenewal>;
  /** The day the subscription stops, once something has ended it. */
  endsOn: string | null;
  monthlyEquivalentMinor: number | null;
  updatedAt: string;
};

export type SubscriptionDetail = SubscriptionListItem & {
  accountHint: string | null;
  startedOn: string | null;
  notes: string | null;
  currency: string;
  reminderPreferences: ReminderPreferencesView;
  amendments: {
    id: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    amountMinor: number | null;
    currency: string;
    cadence: Cadence | null;
    plan: string | null;
  }[];
  events: {
    id: string;
    type: EventRow["type"];
    at: string;
    confirmed: boolean;
    rationale: string | null;
  }[];
};

/**
 * Monthly equivalent in minor units. Display only; never persisted.
 * Yearly divides by 12, weekly uses 52 weeks a year, both rounded to whole minor units.
 */
export function monthlyEquivalentMinor(
  amountMinor: number | null,
  cadence: Cadence | null,
): number | null {
  if (amountMinor === null || cadence === null) {
    return null;
  }

  switch (cadence) {
    case "monthly":
      return amountMinor;
    case "yearly":
      return Math.round(amountMinor / 12);
    case "weekly":
      return Math.round((amountMinor * 52) / 12);
  }
}

function field<T>(
  value: T | null,
  status: FieldStatus,
  confidence: Confidence | null,
): Field<T> {
  return { value, status, confidence };
}

export function listItemDueOn(
  item: Pick<SubscriptionListItem, "nextRenewal" | "expectedNextRenewal">,
): string | null {
  return item.expectedNextRenewal?.value ?? item.nextRenewal.value;
}

export function toListItem(row: SubscriptionRow, on = calendarToday()): SubscriptionListItem {
  const expectedNextRenewal = resolveExpectedNextRenewal(scheduleFactsFromRow(row), on);

  return {
    id: row.id,
    provider: field(row.provider_display, row.provider_field_status, row.provider_confidence),
    plan: field(row.plan, row.provider_field_status, row.provider_confidence),
    status: field(row.status, row.status_field_status, row.status_confidence),
    amount: field(
      row.amount_minor === null ? null : { minor: row.amount_minor, currency: row.currency },
      row.amount_field_status,
      row.amount_confidence,
    ),
    cadence: field(row.cadence, row.cadence_field_status, row.cadence_confidence),
    /**
     * The stored date, even when it has passed. A separate expected date may sit
     * beside it; substituting one for the other would be asserting they still
     * hold it as a recorded fact.
     */
    nextRenewal: field(row.next_renewal, row.renewal_field_status, row.renewal_confidence),
    ...(expectedNextRenewal ? { expectedNextRenewal } : {}),
    trialEndsOn: field(row.trial_ends_on, row.trial_end_field_status, row.trial_end_confidence),
    autoRenewal: field(row.auto_renewal, row.auto_renewal_field_status, row.auto_renewal_confidence),
    endsOn: row.ends_on,
    monthlyEquivalentMinor: monthlyEquivalentMinor(row.amount_minor, row.cadence),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function toDetail(
  row: SubscriptionRow,
  related: {
    amendments: AmendmentRow[];
    events: EventRow[];
    reminderPreferences: ReminderPreferencesView;
  },
  on = calendarToday(),
): SubscriptionDetail {
  return {
    ...toListItem(row, on),
    accountHint: row.account_hint,
    startedOn: row.started_on,
    notes: row.notes,
    currency: row.currency,
    reminderPreferences: related.reminderPreferences,
    amendments: related.amendments.map((amendment) => ({
      id: amendment.id,
      effectiveFrom: amendment.effective_from,
      effectiveTo: amendment.effective_to,
      amountMinor: amendment.amount_minor,
      currency: amendment.currency,
      cadence: amendment.cadence,
      plan: amendment.plan,
    })),
    events: related.events.map((event) => ({
      id: event.id,
      type: event.type,
      at: event.at.toISOString(),
      confirmed: event.confirmed,
      rationale: event.rationale,
    })),
  };
}
