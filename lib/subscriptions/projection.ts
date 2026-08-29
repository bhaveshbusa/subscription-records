import type { InferSelectModel } from "drizzle-orm";

import type { amendments, charges, events, subscriptions } from "@/lib/db/schema";

export type SubscriptionRow = InferSelectModel<typeof subscriptions>;
export type AmendmentRow = InferSelectModel<typeof amendments>;
export type EventRow = InferSelectModel<typeof events>;
export type ChargeRow = InferSelectModel<typeof charges>;

type Cadence = NonNullable<SubscriptionRow["cadence"]>;
type FieldStatus = SubscriptionRow["provider_field_status"];
type Confidence = NonNullable<SubscriptionRow["amount_confidence"]>;

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
  monthlyEquivalentMinor: number | null;
  needsAttention: boolean;
  updatedAt: string;
};

export type SubscriptionDetail = SubscriptionListItem & {
  accountHint: string | null;
  startedOn: string | null;
  endsOn: string | null;
  notes: string | null;
  currency: string;
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
  charges: {
    id: string;
    paidOn: string;
    amountMinor: number;
    currency: string;
    coversFrom: string | null;
    coversTo: string | null;
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

  return null;
}

export function needsAttention(row: SubscriptionRow, now = new Date()): boolean {
  const hasConflictedTerms =
    row.amount_field_status === "conflicted" ||
    row.cadence_field_status === "conflicted" ||
    row.renewal_field_status === "conflicted";
  const hasDueDeferredTerms =
    (row.amount_field_status === "deferred" ||
      row.cadence_field_status === "deferred" ||
      row.renewal_field_status === "deferred") &&
    row.deferred_until !== null &&
    row.deferred_until <= now;

  return row.status === "unknown" || row.status === "lapsed" || hasConflictedTerms || hasDueDeferredTerms;
}

function field<T>(
  value: T | null,
  status: FieldStatus,
  confidence: Confidence | null,
): Field<T> {
  return { value, status, confidence };
}

export function toListItem(row: SubscriptionRow, now = new Date()): SubscriptionListItem {
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
    nextRenewal: field(row.next_renewal, row.renewal_field_status, row.renewal_confidence),
    monthlyEquivalentMinor: monthlyEquivalentMinor(row.amount_minor, row.cadence),
    needsAttention: needsAttention(row, now),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function toDetail(
  row: SubscriptionRow,
  related: {
    amendments: AmendmentRow[];
    events: EventRow[];
    charges: ChargeRow[];
  },
  now = new Date(),
): SubscriptionDetail {
  return {
    ...toListItem(row, now),
    accountHint: row.account_hint,
    startedOn: row.started_on,
    endsOn: row.ends_on,
    notes: row.notes,
    currency: row.currency,
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
    charges: related.charges.map((charge) => ({
      id: charge.id,
      paidOn: charge.paid_on,
      amountMinor: charge.amount_minor,
      currency: charge.currency,
      coversFrom: charge.covers_from,
      coversTo: charge.covers_to,
    })),
  };
}
