import {
  cadenceLabel,
  formatDate,
  formatMoneyMinor,
  isTrialHolding,
  reminderTargetLabel,
  statusLabel,
} from "@/lib/subscriptions/format";

import { reasonDetail, type SubscriptionEntry } from "./subscription-list";
import type { WorkspaceFilter } from "./view";

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function storedAccount(value: string | null | undefined): string | null {
  const hint = value?.trim();

  return hint ? hint : null;
}

/** The account the row already has. Never invented when the field is empty. */
export function entryAccountHint(entry: SubscriptionEntry): string | null {
  return storedAccount(entry.item?.accountHint) ?? storedAccount(entry.draft?.payload?.accountHint);
}

export function entryPlan(entry: SubscriptionEntry): string | null {
  const plan = entry.item?.plan.value ?? entry.draft?.payload?.plan ?? null;
  const trimmed = plan?.trim();

  return trimmed ? trimmed : null;
}

export function entryStatusText(entry: SubscriptionEntry): string {
  return entry.kind === "draft" ? "Not added yet" : statusLabel(entry.item?.status.value ?? null);
}

export function entryIdentityLabel(entry: SubscriptionEntry): string {
  const account = entryAccountHint(entry);

  return account ? `${entry.provider}, ${account}` : entry.provider;
}

function cadenceText(
  value: Parameters<typeof cadenceLabel>[0],
): string | null {
  const label = cadenceLabel(value);

  return label === "—" ? null : label;
}

export type AmountPreview = {
  amount: string | null;
  cadence: string | null;
  afterTrial: boolean;
  proposedDraft: boolean;
};

/**
 * Individual recorded or proposed cost. Trial paid terms are labelled after
 * trial; a draft previews its own proposal and does not pretend to be saved.
 */
export function entryAmountPreview(entry: SubscriptionEntry): AmountPreview {
  const item = entry.item;
  const draft = entry.draft?.payload ?? null;
  const afterTrial = item
    ? isTrialHolding(item.status.value)
    : draft?.subscriptionStatus?.value === "trial";
  const amount = item?.amount.value
    ? formatMoneyMinor(item.amount.value.minor, item.amount.value.currency)
    : draft?.amountMinor && draft.currency
      ? formatMoneyMinor(draft.amountMinor.value, draft.currency)
      : null;

  return {
    amount,
    cadence: cadenceText(item?.cadence.value ?? draft?.cadence?.value ?? null),
    afterTrial,
    proposedDraft: entry.kind === "draft" && amount !== null,
  };
}

export type DatePreview = {
  label: string;
  recorded: string | null;
  expected: string | null;
};

export type DateColumn = {
  label: string;
  value: string | null;
  supporting: string | null;
};

/**
 * Recorded dates stay recorded. An expected next renewal is a separate labelled
 * value and is never substituted for the stored one.
 */
export function entryDatePreview(entry: SubscriptionEntry): DatePreview {
  const item = entry.item;

  if (!item) {
    const draft = entry.draft?.payload ?? null;
    const trial = draft?.subscriptionStatus?.value === "trial";
    const recorded = trial ? draft?.trialEndsOn?.value ?? null : draft?.nextRenewal?.value ?? null;

    return {
      label: trial ? "Trial ends" : "Recorded renewal",
      recorded: recorded ? formatDate(recorded) : null,
      expected: null,
    };
  }

  const trial = isTrialHolding(item.status.value);
  const expected =
    !trial &&
    item.expectedNextRenewal &&
    item.expectedNextRenewal.value !== item.nextRenewal.value
      ? formatDate(item.expectedNextRenewal.value)
      : null;

  if (trial) {
    return {
      label: "Trial ends",
      recorded: item.trialEndsOn.value ? formatDate(item.trialEndsOn.value) : null,
      expected: null,
    };
  }

  return {
    label: "Recorded renewal",
    recorded: item.nextRenewal.value ? formatDate(item.nextRenewal.value) : null,
    expected,
  };
}

/**
 * Collapsed-row scan order: when a distinct expected date exists it is the
 * main value, with the recorded date on the supporting line. Stored
 * `next_renewal` is not replaced.
 */
export function entryDateColumn(entry: SubscriptionEntry): DateColumn {
  const dates = entryDatePreview(entry);

  if (dates.expected) {
    return {
      label: "Expected renewal",
      value: dates.expected,
      supporting: dates.recorded ? `Recorded ${dates.recorded}` : null,
    };
  }

  return {
    label: dates.label,
    value: dates.recorded,
    supporting: null,
  };
}

/**
 * Why the row is in this filter. Under All the inventory stays plain: no
 * attention chip on a saved holding.
 */
export function entryFilterContext(
  entry: SubscriptionEntry,
  filter: WorkspaceFilter,
): string | null {
  switch (filter) {
    case "all":
      return null;
    case "reviews": {
      const parts: string[] = [];

      if (entry.kind === "draft") {
        parts.push("Card waiting");
      } else if (entry.proposals.length > 0) {
        parts.push(count(entry.proposals.length, "proposed change", "proposed changes"));
      }

      if (entry.item) {
        const item = entry.item;

        parts.push(...entry.reasons.map((reason) => reasonDetail(item, reason)));
      }

      return parts.join(" · ") || null;
    }
    case "questions": {
      const [first] = entry.questions;

      if (!first) {
        return null;
      }

      const more = entry.questions.length - 1;

      return more > 0 ? `${first.question} · ${count(more, "more question", "more questions")}` : first.question;
    }
    case "reminders": {
      const [first] = entry.reminders;

      return first
        ? `${reminderTargetLabel(first.target)} due ${formatDate(first.dueDate)}`
        : null;
    }
  }
}

export function rowElementId(key: string): string {
  return `subscription-row-${key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}
