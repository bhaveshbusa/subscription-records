import type { InferInsertModel } from "drizzle-orm";

import type { subscriptions } from "@/lib/db/schema";
import type {
  AutoRenewal,
  Cadence,
  SubscriptionStatus,
} from "@/lib/subscriptions/params";
import type { FieldStatus, SubscriptionRow } from "@/lib/subscriptions/projection";
import { canonicalProvider } from "@/lib/subscriptions/write";

import type { ConfirmedTerms } from "./confirm";
import type { ProposalPayload } from "./payload";

type SubscriptionInsert = InferInsertModel<typeof subscriptions>;
type Confidence = SubscriptionRow["amount_confidence"];

type Incoming<T> = { value: T; status: FieldStatus; confidence?: Confidence };

/** A field that an accepted proposal left flagged instead of overwriting. */
export type ProposalConflict =
  | "provider"
  | "status"
  | "amount"
  | "cadence"
  | "nextRenewal"
  | "trialEndsOn"
  | "autoRenewal";

type Resolution<T> =
  | { outcome: "apply"; value: T; status: FieldStatus; confidence: Confidence }
  | { outcome: "keep" }
  | { outcome: "conflict" };

/**
 * A confirmed field is the user's own answer. A proposal that disagrees with it
 * flags the field as `conflicted` and leaves the stored value alone.
 */
function resolve<T>(
  current: { value: T | null; status: FieldStatus },
  incoming: Incoming<T>,
  supersedes = false,
): Resolution<T> {
  const guarded = !supersedes && current.status === "confirmed";

  if (guarded && incoming.status !== "confirmed") {
    return current.value === incoming.value ? { outcome: "keep" } : { outcome: "conflict" };
  }

  return {
    outcome: "apply",
    value: incoming.value,
    status: incoming.status,
    confidence: incoming.confidence ?? null,
  };
}

type Terms = {
  currency: string | undefined;
  amountMinor: Incoming<number> | undefined;
  cadence: Incoming<Cadence> | undefined;
  nextRenewal: Incoming<string> | undefined;
  trialEndsOn: Incoming<string> | undefined;
  autoRenewal: Incoming<AutoRenewal> | undefined;
};

/**
 * The payload's terms, with anything the person confirmed on the card taking
 * over: their value, `confirmed`, and no confidence to qualify it.
 */
function terms(payload: ProposalPayload, confirm?: ConfirmedTerms): Terms {
  const confirmed = <T>(value: T): Incoming<T> => ({ value, status: "confirmed" });

  return {
    currency: confirm?.currency ?? payload.currency,
    amountMinor:
      confirm?.amountMinor === undefined
        ? payload.amountMinor
        : confirmed(confirm.amountMinor),
    cadence: confirm?.cadence === undefined ? payload.cadence : confirmed(confirm.cadence),
    nextRenewal:
      confirm?.nextRenewal === undefined
        ? payload.nextRenewal
        : confirmed(confirm.nextRenewal),
    trialEndsOn:
      confirm?.trialEndsOn === undefined
        ? payload.trialEndsOn
        : confirmed(confirm.trialEndsOn),
    autoRenewal:
      confirm?.autoRenewal === undefined
        ? payload.autoRenewal
        : confirmed(confirm.autoRenewal),
  };
}

/**
 * The status an accepted card lands on the row. Accepting a card is the person
 * saying yes to the status it displayed, so on a new subscription that status is
 * established - `confirmed` - without a second question about it. Accepting a
 * status confirms nothing else: amount, cadence, dates, and auto-renewal keep
 * their own trust.
 *
 * An update is different. The card is proposing a change to a row that already
 * has a status, so a reading stays `proposed` and meets the same guard every
 * other field does - unless the person picked the status themselves, which is
 * their own answer and wins the way confirmed money does.
 * [SUB-60](https://linear.app/lets-play-match/issue/SUB-60/interpret-new-subscriptions-as-active-and-current-trials-as-trial)
 */
function acceptedStatus(
  payload: ProposalPayload,
  confirm: ConfirmedTerms | undefined,
  establish: boolean,
): Incoming<SubscriptionStatus> | undefined {
  if (confirm?.subscriptionStatus !== undefined) {
    return { value: confirm.subscriptionStatus, status: "confirmed" };
  }

  if (!payload.subscriptionStatus) {
    return undefined;
  }

  return establish
    ? { value: payload.subscriptionStatus.value, status: "confirmed" }
    : payload.subscriptionStatus;
}

function emptyField() {
  return { status: "empty" as FieldStatus, confidence: null };
}

function insertField<T>(field: Incoming<T> | undefined) {
  return field === undefined
    ? { value: null, ...emptyField() }
    : { value: field.value, status: field.status, confidence: field.confidence ?? null };
}

/**
 * A new row from an accepted `create`. Trust comes from the payload, so money
 * and dates land as `proposed` or `inferred` unless the person confirmed them
 * on the card as they accepted it.
 */
export function toProposedInsertValues(
  userId: string,
  payload: ProposalPayload,
  confirm?: ConfirmedTerms,
): SubscriptionInsert {
  const provider = payload.provider;

  if (!provider) {
    throw new Error("a create proposal needs a provider");
  }

  const confirmed = terms(payload, confirm);
  const amount = insertField(confirmed.amountMinor);
  const cadence = insertField(confirmed.cadence);
  const renewal = insertField(confirmed.nextRenewal);
  const trialEnd = insertField(confirmed.trialEndsOn);
  const autoRenewal = insertField(confirmed.autoRenewal);
  const status = insertField(acceptedStatus(payload, confirm, true));

  return {
    user_id: userId,
    provider_canonical: canonicalProvider(provider.value),
    provider_display: provider.value,
    plan: payload.plan ?? null,
    account_hint: payload.accountHint ?? null,
    status: status.value ?? "unknown",
    amount_minor: amount.value,
    currency: confirmed.currency ?? "GBP",
    cadence: cadence.value,
    next_renewal: renewal.value,
    started_on: payload.startedOn ?? null,
    ends_on: payload.endsOn ?? null,
    trial_ends_on: trialEnd.value,
    auto_renewal: autoRenewal.value,
    notes: payload.notes ?? null,
    provider_field_status: provider.status,
    provider_confidence: provider.confidence ?? null,
    amount_field_status: amount.status,
    amount_confidence: amount.confidence,
    cadence_field_status: cadence.status,
    cadence_confidence: cadence.confidence,
    renewal_field_status: renewal.status,
    renewal_confidence: renewal.confidence,
    trial_end_field_status: trialEnd.status,
    trial_end_confidence: trialEnd.confidence,
    auto_renewal_field_status: autoRenewal.status,
    auto_renewal_confidence: autoRenewal.confidence,
    status_field_status: status.status,
    status_confidence: status.confidence,
  };
}

export type ProposedUpdate = {
  values: Partial<SubscriptionInsert> & { updated_at: Date };
  conflicts: ProposalConflict[];
};

/** Only the fields the payload carries change; the rest keep their trust. */
export function toProposedUpdateValues(
  row: SubscriptionRow,
  payload: ProposalPayload,
  now: Date,
  confirm?: ConfirmedTerms,
): ProposedUpdate {
  return buildUpdate(row, payload, now, confirm, false);
}

/**
 * A change of terms is news about the price itself, so accepting it moves the
 * projection onto the new amount and cadence rather than flagging them against
 * what was confirmed before. The old figure is not lost: it stays on the
 * amendment the change closes.
 */
export function toTermsChangedValues(
  row: SubscriptionRow,
  payload: ProposalPayload,
  now: Date,
  confirm?: ConfirmedTerms,
): ProposedUpdate {
  return buildUpdate(row, payload, now, confirm, true);
}

function buildUpdate(
  row: SubscriptionRow,
  payload: ProposalPayload,
  now: Date,
  confirm: ConfirmedTerms | undefined,
  supersedeTerms: boolean,
): ProposedUpdate {
  const values: Partial<SubscriptionInsert> & { updated_at: Date } = { updated_at: now };
  const conflicts: ProposalConflict[] = [];
  const confirmed = terms(payload, confirm);

  if (payload.plan !== undefined) {
    values.plan = payload.plan;
  }

  if (payload.accountHint !== undefined) {
    values.account_hint = payload.accountHint;
  }

  if (payload.notes !== undefined) {
    values.notes = payload.notes;
  }

  if (confirmed.currency !== undefined) {
    values.currency = confirmed.currency;
  }

  if (payload.startedOn !== undefined) {
    values.started_on = payload.startedOn;
  }

  if (payload.endsOn !== undefined) {
    values.ends_on = payload.endsOn;
  }

  if (payload.provider !== undefined) {
    const resolution = resolve(
      { value: row.provider_display, status: row.provider_field_status },
      payload.provider,
    );

    if (resolution.outcome === "apply") {
      values.provider_display = resolution.value;
      values.provider_canonical = canonicalProvider(resolution.value);
      values.provider_field_status = resolution.status;
      values.provider_confidence = resolution.confidence;
    } else if (resolution.outcome === "conflict") {
      values.provider_field_status = "conflicted";
      conflicts.push("provider");
    }
  }

  const status = acceptedStatus(payload, confirm, false);

  if (status !== undefined) {
    const resolution = resolve(
      { value: row.status, status: row.status_field_status },
      status,
    );

    if (resolution.outcome === "apply") {
      values.status = resolution.value;
      values.status_field_status = resolution.status;
      values.status_confidence = resolution.confidence;
    } else if (resolution.outcome === "conflict") {
      values.status_field_status = "conflicted";
      conflicts.push("status");
    }
  }

  if (confirmed.amountMinor !== undefined) {
    const resolution = resolve(
      { value: row.amount_minor, status: row.amount_field_status },
      confirmed.amountMinor,
      supersedeTerms,
    );

    if (resolution.outcome === "apply") {
      values.amount_minor = resolution.value;
      values.amount_field_status = resolution.status;
      values.amount_confidence = resolution.confidence;
    } else if (resolution.outcome === "conflict") {
      values.amount_field_status = "conflicted";
      conflicts.push("amount");
    }
  }

  if (confirmed.cadence !== undefined) {
    const resolution = resolve(
      { value: row.cadence, status: row.cadence_field_status },
      confirmed.cadence,
      supersedeTerms,
    );

    if (resolution.outcome === "apply") {
      values.cadence = resolution.value;
      values.cadence_field_status = resolution.status;
      values.cadence_confidence = resolution.confidence;
    } else if (resolution.outcome === "conflict") {
      values.cadence_field_status = "conflicted";
      conflicts.push("cadence");
    }
  }

  if (confirmed.nextRenewal !== undefined) {
    const resolution = resolve(
      { value: row.next_renewal, status: row.renewal_field_status },
      confirmed.nextRenewal,
    );

    if (resolution.outcome === "apply") {
      values.next_renewal = resolution.value;
      values.renewal_field_status = resolution.status;
      values.renewal_confidence = resolution.confidence;
    } else if (resolution.outcome === "conflict") {
      values.renewal_field_status = "conflicted";
      conflicts.push("nextRenewal");
    }
  }

  if (confirmed.trialEndsOn !== undefined) {
    const resolution = resolve(
      { value: row.trial_ends_on, status: row.trial_end_field_status },
      confirmed.trialEndsOn,
    );

    if (resolution.outcome === "apply") {
      values.trial_ends_on = resolution.value;
      values.trial_end_field_status = resolution.status;
      values.trial_end_confidence = resolution.confidence;
    } else if (resolution.outcome === "conflict") {
      values.trial_end_field_status = "conflicted";
      conflicts.push("trialEndsOn");
    }
  }

  if (confirmed.autoRenewal !== undefined) {
    const resolution = resolve(
      { value: row.auto_renewal, status: row.auto_renewal_field_status },
      confirmed.autoRenewal,
    );

    if (resolution.outcome === "apply") {
      values.auto_renewal = resolution.value;
      values.auto_renewal_field_status = resolution.status;
      values.auto_renewal_confidence = resolution.confidence;
    } else if (resolution.outcome === "conflict") {
      values.auto_renewal_field_status = "conflicted";
      conflicts.push("autoRenewal");
    }
  }

  return { values, conflicts };
}
