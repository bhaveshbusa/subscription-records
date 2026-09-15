import type { ConfirmedTerms } from "@/lib/proposals/confirm";
import type { ProposalPayload } from "@/lib/proposals/payload";
import {
  autoRenewalLabel,
  cadenceLabel,
  formatDate,
  formatMoneyMinor,
  statusLabel,
} from "@/lib/subscriptions/format";
import { isConfirmableField } from "@/lib/subscriptions/form-values";
import type { FieldStatus } from "@/lib/subscriptions/projection";

/**
 * The controls one field offers. Confirm is only for a value that exists and
 * is not yet trusted; a blank offers Add, a filled value offers Edit. A field
 * with no trust of its own (notes, plan on a card) never offers Confirm.
 */
export type FieldActions = { confirm: boolean; edit: "edit" | "add" };

export function fieldActions(
  status: FieldStatus | null,
  hasValue: boolean,
): FieldActions {
  return {
    confirm: status !== null && isConfirmableField(status, hasValue),
    edit: hasValue ? "edit" : "add",
  };
}

/** Missing money and dates stay unknown copy, never a zero or invented date. */
export const NOT_RECORDED = "Not recorded";

/** Soft empty for Notes / Account — not a ledger money or date fact. */
export const NONE_RECORDED = "None";

/**
 * Reminder preferences use Not set (consent unset). Ledger money/date facts use
 * Not recorded. Do not unify those words.
 */
export function displayFieldValue(
  value: string,
  hasValue: boolean,
  emptyCopy: string = NOT_RECORDED,
): string {
  if (hasValue && value.trim() !== "" && value !== "—") {
    return value;
  }

  return emptyCopy;
}

/**
 * Confirmed is the unmarked steady state — no persistent chip. Missing next to
 * Not recorded is redundant. Proposed / Inferred / Conflicted / Deferred stay.
 */
export function showsFieldStatusBadge(
  status: FieldStatus | null,
  hasValue: boolean,
): status is FieldStatus {
  if (status === null || status === "confirmed") {
    return false;
  }

  if (status === "empty" && !hasValue) {
    return false;
  }

  return true;
}

/** Visible confirm control names the field: "Confirm amount", not a generic Confirm. */
export function confirmActionLabel(label: string): string {
  const trimmed = label.trim();

  if (trimmed.length === 0) {
    return "Confirm";
  }

  return `Confirm ${trimmed.charAt(0).toLowerCase()}${trimmed.slice(1)}`;
}

export const CONFLICT_REVIEW_NOTE =
  "The recorded value and a later suggestion disagree. Confirm or edit the recorded field; nothing is replaced silently.";

export const EXPECTED_DATE_NOTE =
  "Inferred from the confirmed schedule. This date is not stored and cannot be confirmed.";

export const CURRENCY_OPTIONS = ["GBP", "USD", "EUR"] as const;

/** The currencies an amount editor offers, with the row's own always present. */
export function currencyOptions(current: string): string[] {
  const upper = current.toUpperCase();

  return CURRENCY_OPTIONS.includes(upper as (typeof CURRENCY_OPTIONS)[number])
    ? [...CURRENCY_OPTIONS]
    : [upper, ...CURRENCY_OPTIONS];
}

/** The terms a card can stage for confirmation, one at a time. */
export type StagedTerm = Exclude<keyof ConfirmedTerms, "currency">;

export const STAGED_TERM_LABEL: Record<StagedTerm, string> = {
  provider: "Provider",
  subscriptionStatus: "Status",
  amountMinor: "Amount",
  cadence: "Cadence",
  nextRenewal: "Next renewal",
  trialEndsOn: "Trial ends on",
  autoRenewal: "Auto-renewal",
};

/**
 * Stage exactly one field. Money carries its currency because the number means
 * nothing without it; nothing else on the card moves.
 */
export function stageTerm<K extends StagedTerm>(
  staged: ConfirmedTerms,
  field: K,
  value: NonNullable<ConfirmedTerms[K]>,
  currency?: string,
): ConfirmedTerms {
  const next: ConfirmedTerms = { ...staged, [field]: value };

  if (field === "amountMinor") {
    next.currency = (currency ?? staged.currency ?? "GBP").toUpperCase();
  }

  return next;
}

export function unstageTerm(
  staged: ConfirmedTerms,
  field: StagedTerm,
): ConfirmedTerms {
  const next: ConfirmedTerms = { ...staged };

  delete next[field];

  if (field === "amountMinor") {
    delete next.currency;
  }

  return next;
}

export function isStaged(staged: ConfirmedTerms, field: StagedTerm): boolean {
  return staged[field] !== undefined;
}

/**
 * The confirmation an accept sends, or nothing when the card is accepted as
 * proposed. A status equal to the one the card shows is not a confirmation of
 * anything extra: accepting establishes the shown status anyway.
 */
export function toAcceptConfirm(
  staged: ConfirmedTerms,
  shownStatus: string | null,
): ConfirmedTerms | undefined {
  const confirm = { ...staged };

  if (
    confirm.subscriptionStatus !== undefined &&
    confirm.subscriptionStatus === shownStatus
  ) {
    delete confirm.subscriptionStatus;
  }

  return Object.keys(confirm).length === 0 ? undefined : confirm;
}

export type ConfirmSummaryLine = {
  field: StagedTerm;
  label: string;
  value: string;
};

/**
 * Every value an accept will confirm, spelled out with its unit, so a
 * multi-field confirmation never hides what it covers.
 */
export function confirmSummary(
  staged: ConfirmedTerms,
  payload: Pick<ProposalPayload, "provider"> | null,
): ConfirmSummaryLine[] {
  const lines: ConfirmSummaryLine[] = [];
  const line = (field: StagedTerm, value: string) =>
    lines.push({ field, label: STAGED_TERM_LABEL[field], value });

  if (staged.provider) {
    line("provider", payload?.provider?.value ?? "as shown");
  }

  if (staged.subscriptionStatus !== undefined) {
    line("subscriptionStatus", statusLabel(staged.subscriptionStatus));
  }

  if (staged.amountMinor !== undefined) {
    const currency = staged.currency ?? "GBP";

    line(
      "amountMinor",
      `${formatMoneyMinor(staged.amountMinor, currency)} (${currency})`,
    );
  }

  if (staged.cadence !== undefined) {
    line("cadence", cadenceLabel(staged.cadence));
  }

  if (staged.nextRenewal !== undefined) {
    line("nextRenewal", formatDate(staged.nextRenewal));
  }

  if (staged.trialEndsOn !== undefined) {
    line("trialEndsOn", formatDate(staged.trialEndsOn));
  }

  if (staged.autoRenewal !== undefined) {
    line("autoRenewal", autoRenewalLabel(staged.autoRenewal));
  }

  return lines;
}

/** Accept confirms the terms on the card; there is no separate staged count. */
export function acceptLabel(): string {
  return "Accept";
}
