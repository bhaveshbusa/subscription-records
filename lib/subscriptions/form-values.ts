import { parseAmountInput, toAmountInput } from "./money";
import type { AUTO_RENEWALS, AutoRenewal, CADENCES, Cadence, SUBSCRIPTION_STATUSES } from "./params";
import type { FieldStatus, SubscriptionDetail } from "./projection";
import type {
  ReminderConsent,
  ReminderLeadUnit,
  ReminderPreferenceInput,
  ReminderPreferencesInput,
} from "@/lib/reminders/preferences";
import { REMINDER_LEAD_UNITS } from "@/lib/reminders/dates";

/** The create and edit form as text, so a server page can prefill it. */
export type SubscriptionFormValues = {
  provider: string;
  plan: string;
  accountHint: string;
  status: (typeof SUBSCRIPTION_STATUSES)[number];
  amount: string;
  /** ISO 4217 code; a change of currency is always sent together with the amount. */
  currency: string;
  cadence: "" | (typeof CADENCES)[number];
  nextRenewal: string;
  startedOn: string;
  endsOn: string;
  trialEndsOn: string;
  autoRenewal: "" | (typeof AUTO_RENEWALS)[number];
  notes: string;
  renewalReminder: ReminderConsent;
  renewalLeadValue: string;
  renewalLeadUnit: "" | ReminderLeadUnit;
  trialReminder: ReminderConsent;
  trialLeadValue: string;
  trialLeadUnit: "" | ReminderLeadUnit;
};

/** Trust for money and date fields the edit form can confirm without changing. */
export type SubscriptionFormTrust = {
  provider: FieldStatus;
  amount: FieldStatus;
  cadence: FieldStatus;
  nextRenewal: FieldStatus;
  trialEndsOn: FieldStatus;
  autoRenewal: FieldStatus;
};

export type FormConfirm = {
  provider: boolean;
  amount: boolean;
  cadence: boolean;
  nextRenewal: boolean;
  trialEndsOn: boolean;
  autoRenewal: boolean;
};

export const EMPTY_FORM_CONFIRM: FormConfirm = {
  provider: false,
  amount: false,
  cadence: false,
  nextRenewal: false,
  trialEndsOn: false,
  autoRenewal: false,
};

/** A correction overwrites the open amendment; a terms change versions history. */
export type TermsIntent = "correction" | "terms_change";

export type SubscriptionWriteBody = {
  provider?: string;
  plan?: string | null;
  accountHint?: string | null;
  status?: SubscriptionFormValues["status"];
  amountMinor?: number | null;
  currency?: string;
  cadence?: Cadence | null;
  nextRenewal?: string | null;
  startedOn?: string | null;
  endsOn?: string | null;
  trialEndsOn?: string | null;
  autoRenewal?: AutoRenewal | null;
  notes?: string | null;
  reminderPreferences?: ReminderPreferencesInput;
  termsChange?: { effectiveFrom: string };
  resumedOn?: string;
};

export type EditPayloadResult =
  | { ok: true; body: SubscriptionWriteBody }
  | { ok: false; message: string };

export const EMPTY_SUBSCRIPTION_FORM: SubscriptionFormValues = {
  provider: "",
  plan: "",
  accountHint: "",
  status: "active",
  amount: "",
  currency: "GBP",
  cadence: "",
  nextRenewal: "",
  startedOn: "",
  endsOn: "",
  trialEndsOn: "",
  autoRenewal: "",
  notes: "",
  renewalReminder: "unset",
  renewalLeadValue: "",
  renewalLeadUnit: "",
  trialReminder: "unset",
  trialLeadValue: "3",
  trialLeadUnit: "days",
};

/**
 * A legacy `lapsed` row edits as `cancelled`: the form offers only the statuses
 * the app writes, and that is what such a row means. `0013_drop_lapsed` left
 * none behind, so this is a guard, not a path anyone takes.
 */
function formStatus(
  status: SubscriptionDetail["status"]["value"],
): SubscriptionFormValues["status"] {
  if (status === null) {
    return "unknown";
  }

  return status === "lapsed" ? "cancelled" : status;
}

function textOrNull(value: string): string | null {
  const trimmed = value.trim();

  return trimmed === "" ? null : trimmed;
}

function cadenceOrNull(
  value: SubscriptionFormValues["cadence"],
): SubscriptionWriteBody["cadence"] {
  return value === "" ? null : value;
}

function autoRenewalOrNull(
  value: SubscriptionFormValues["autoRenewal"],
): SubscriptionWriteBody["autoRenewal"] {
  return value === "" ? null : value;
}

export function reminderInputFromForm(
  state: ReminderConsent,
  leadValue: string,
  leadUnit: "" | ReminderLeadUnit,
): { ok: true; input: ReminderPreferenceInput } | { ok: false; message: string } {
  if (state === "unset") {
    return { ok: true, input: { state: "unset" } };
  }

  if (state === "off") {
    return { ok: true, input: { state: "off" } };
  }

  const parsed = Number.parseInt(leadValue.trim(), 10);

  if (!Number.isInteger(parsed) || parsed < 1 || !REMINDER_LEAD_UNITS.includes(leadUnit as ReminderLeadUnit)) {
    return { ok: false, message: "An enabled reminder needs how far ahead to notify you." };
  }

  return { ok: true, input: { state: "enabled", leadValue: parsed, leadUnit: leadUnit as ReminderLeadUnit } };
}

function reminderTargetChanged(
  initialState: ReminderConsent,
  currentState: ReminderConsent,
  initialLead: string,
  currentLead: string,
  initialUnit: "" | ReminderLeadUnit,
  currentUnit: "" | ReminderLeadUnit,
): boolean {
  if (initialState !== currentState) {
    return true;
  }

  return (
    currentState === "enabled" &&
    (initialLead.trim() !== currentLead.trim() || initialUnit !== currentUnit)
  );
}

function reminderPreferencesFromEdit(
  initial: SubscriptionFormValues,
  current: SubscriptionFormValues,
): EditPayloadResult & { value?: ReminderPreferencesInput } {
  const renewalChanged = reminderTargetChanged(
    initial.renewalReminder,
    current.renewalReminder,
    initial.renewalLeadValue,
    current.renewalLeadValue,
    initial.renewalLeadUnit,
    current.renewalLeadUnit,
  );
  const trialChanged = reminderTargetChanged(
    initial.trialReminder,
    current.trialReminder,
    initial.trialLeadValue,
    current.trialLeadValue,
    initial.trialLeadUnit,
    current.trialLeadUnit,
  );

  if (!renewalChanged && !trialChanged) {
    return { ok: true, body: {} };
  }

  const value: ReminderPreferencesInput = {};

  if (renewalChanged) {
    const renewal = reminderInputFromForm(
      current.renewalReminder,
      current.renewalLeadValue,
      current.renewalLeadUnit,
    );

    if (!renewal.ok) {
      return { ok: false, message: renewal.message };
    }

    value.renewal = renewal.input;
  }

  if (trialChanged) {
    const trial = reminderInputFromForm(
      current.trialReminder,
      current.trialLeadValue,
      current.trialLeadUnit,
    );

    if (!trial.ok) {
      return { ok: false, message: trial.message };
    }

    value.trialEnd = trial.input;
  }

  return { ok: true, body: {}, value };
}

export function amountMinorFromForm(amount: string): number | null {
  const parsed = parseAmountInput(amount);

  return parsed.ok ? parsed.minor : null;
}

export function toSubscriptionFormValues(
  subscription: SubscriptionDetail,
): SubscriptionFormValues {
  const renewal = reminderFormFields(subscription.reminderPreferences.renewal);
  const trial = reminderFormFields(subscription.reminderPreferences.trialEnd);

  return {
    provider: subscription.provider.value ?? "",
    plan: subscription.plan.value ?? "",
    accountHint: subscription.accountHint ?? "",
    status: formStatus(subscription.status.value),
    amount: toAmountInput(subscription.amount.value?.minor ?? null),
    currency: subscription.currency,
    cadence: subscription.cadence.value ?? "",
    nextRenewal: subscription.nextRenewal.value ?? "",
    startedOn: subscription.startedOn ?? "",
    endsOn: subscription.endsOn ?? "",
    trialEndsOn: subscription.trialEndsOn.value ?? "",
    autoRenewal: subscription.autoRenewal.value ?? "",
    notes: subscription.notes ?? "",
    renewalReminder: renewal.state,
    renewalLeadValue: renewal.leadValue,
    renewalLeadUnit: renewal.leadUnit,
    trialReminder: trial.state,
    trialLeadValue: trial.leadValue,
    trialLeadUnit: trial.leadUnit,
  };
}

function reminderFormFields(view: SubscriptionDetail["reminderPreferences"]["renewal"]): {
  state: ReminderConsent;
  leadValue: string;
  leadUnit: "" | ReminderLeadUnit;
} {
  const lead =
    view.state === "enabled"
      ? { leadValue: view.leadValue, leadUnit: view.leadUnit }
      : view.suggestion.state === "enabled"
        ? { leadValue: view.suggestion.leadValue, leadUnit: view.suggestion.leadUnit }
        : { leadValue: null, leadUnit: null };

  return {
    state: view.state,
    leadValue: lead.leadValue === null ? "" : String(lead.leadValue),
    leadUnit: lead.leadUnit ?? "",
  };
}

export function toSubscriptionFormTrust(
  subscription: SubscriptionDetail,
): SubscriptionFormTrust {
  return {
    provider: subscription.provider.status,
    amount: subscription.amount.status,
    cadence: subscription.cadence.status,
    nextRenewal: subscription.nextRenewal.status,
    trialEndsOn: subscription.trialEndsOn.status,
    autoRenewal: subscription.autoRenewal.status,
  };
}

export function isConfirmableField(status: FieldStatus, hasValue: boolean): boolean {
  return hasValue && (status === "inferred" || status === "proposed" || status === "conflicted");
}

/**
 * What an edit did to one of the terms in force. The distinction is the whole
 * point of [SUB-58](https://linear.app/lets-play-match/issue/SUB-58/add-missing-subscription-terms-without-a-terms-change-question):
 * writing down a price nobody had recorded is completing the record, and asking
 * "correction or terms change?" about it is asking someone to classify an
 * answer to a question the ledger never had. Only `replaced` — a known value
 * giving way to a different known value — is genuinely ambiguous.
 */
export type TermsFieldChange = "first_fill" | "cleared" | "replaced";

export type TermsEdit =
  | {
      field: "amount";
      change: TermsFieldChange;
      from: number | null;
      to: number | null;
      /** Set only when the currency itself changed alongside the amount. */
      fromCurrency?: string;
      toCurrency?: string;
    }
  | {
      field: "cadence";
      change: TermsFieldChange;
      from: Cadence | null;
      to: Cadence | null;
    }
  | { field: "plan"; change: TermsFieldChange; from: string | null; to: string | null };

function currencyOf(values: SubscriptionFormValues): string {
  return values.currency.trim().toUpperCase();
}

function changeOf(from: unknown, to: unknown): TermsFieldChange | null {
  if (from === to) {
    return null;
  }

  if (from === null) {
    return "first_fill";
  }

  return to === null ? "cleared" : "replaced";
}

/** Every in-force term this edit touched, with what it was and what it becomes. */
export function termsEdits(
  initial: SubscriptionFormValues,
  current: SubscriptionFormValues,
  initialAmountMinor: number | null,
  amountMinor: number | null,
): TermsEdit[] {
  const edits: TermsEdit[] = [];
  const currencyChanged = currencyOf(initial) !== currencyOf(current);
  const amount =
    changeOf(initialAmountMinor, amountMinor) ??
    (currencyChanged && initialAmountMinor !== null && amountMinor !== null ? "replaced" : null);

  if (amount) {
    edits.push({
      field: "amount",
      change: amount,
      from: initialAmountMinor,
      to: amountMinor,
      ...(currencyChanged
        ? { fromCurrency: currencyOf(initial), toCurrency: currencyOf(current) }
        : {}),
    });
  }

  const from = cadenceOrNull(initial.cadence) ?? null;
  const to = cadenceOrNull(current.cadence) ?? null;
  const cadence = changeOf(from, to);

  if (cadence) {
    edits.push({ field: "cadence", change: cadence, from, to });
  }

  const planFrom = textOrNull(initial.plan);
  const planTo = textOrNull(current.plan);
  const plan = changeOf(planFrom, planTo);

  if (plan) {
    edits.push({ field: "plan", change: plan, from: planFrom, to: planTo });
  }

  return edits;
}

export function termsFieldsChanged(
  initial: SubscriptionFormValues,
  current: SubscriptionFormValues,
  initialAmountMinor: number | null,
  amountMinor: number | null,
): boolean {
  return termsEdits(initial, current, initialAmountMinor, amountMinor).length > 0;
}

/**
 * Amount, cadence, and plan on a trial are the paid plan after trial, not
 * currently in-force terms. Filling or changing them is an ordinary write, not
 * a correction versus an actual terms change.
 */
function trialTerms(
  initial: SubscriptionFormValues,
  current: SubscriptionFormValues,
): boolean {
  return initial.status === "trial" || current.status === "trial";
}

/**
 * Whether this edit has to be classified before it can be saved. Only replacing
 * a term that was already recorded: the stored value was either wrong or it is
 * genuinely out of date, and only the person editing knows which. Filling in a
 * blank, or clearing a value back to unknown, is neither — nothing is being
 * superseded, and there is no date on which "unknown" took effect.
 */
export function needsTermsIntent(
  initial: SubscriptionFormValues,
  current: SubscriptionFormValues,
  initialAmountMinor: number | null,
  amountMinor: number | null,
): boolean {
  if (trialTerms(initial, current)) {
    return false;
  }

  return termsEdits(initial, current, initialAmountMinor, amountMinor).some(
    (edit) => edit.change === "replaced",
  );
}

/**
 * Whether an actual terms change is something this edit could be. It stays
 * offered when the old terms were unknown — "it went up to £15 in March" is a
 * real change worth keeping in history even though the ledger never held the
 * old price — but it is never demanded there.
 */
export function canRecordTermsChange(
  initial: SubscriptionFormValues,
  current: SubscriptionFormValues,
  initialAmountMinor: number | null,
  amountMinor: number | null,
): boolean {
  if (trialTerms(initial, current)) {
    return false;
  }

  return termsEdits(initial, current, initialAmountMinor, amountMinor).some(
    (edit) => edit.to !== null,
  );
}

/** Create still sends the filled form: every value here is the user's own answer. */
export function toCreateBody(
  values: SubscriptionFormValues,
  amountMinor: number | null,
): SubscriptionWriteBody {
  return {
    provider: values.provider.trim(),
    plan: textOrNull(values.plan),
    accountHint: textOrNull(values.accountHint),
    status: values.status,
    amountMinor,
    currency: currencyOf(values),
    cadence: cadenceOrNull(values.cadence),
    nextRenewal: textOrNull(values.nextRenewal),
    startedOn: textOrNull(values.startedOn),
    endsOn: textOrNull(values.endsOn),
    trialEndsOn: textOrNull(values.trialEndsOn),
    autoRenewal: autoRenewalOrNull(values.autoRenewal),
    notes: textOrNull(values.notes),
    ...createReminderPreferences(values),
  };
}

function createReminderPreferences(
  values: SubscriptionFormValues,
): { reminderPreferences?: ReminderPreferencesInput } {
  if (values.renewalReminder === "unset" && values.trialReminder === "unset") {
    return {};
  }

  const renewal = reminderInputFromForm(
    values.renewalReminder,
    values.renewalLeadValue,
    values.renewalLeadUnit,
  );
  const trial = reminderInputFromForm(
    values.trialReminder,
    values.trialLeadValue,
    values.trialLeadUnit,
  );

  if (!renewal.ok || !trial.ok) {
    return {};
  }

  return {
    reminderPreferences: {
      ...(values.renewalReminder === "unset" ? {} : { renewal: renewal.input }),
      ...(values.trialReminder === "unset" ? {} : { trialEnd: trial.input }),
    },
  };
}

/**
 * Edit sends only intended changes. Unchanged inferred/proposed money and dates
 * stay off the body, so saving notes cannot confirm them. An explicit confirm
 * flag includes a field even when its value is the same.
 */
export function toEditBody(options: {
  initial: SubscriptionFormValues;
  current: SubscriptionFormValues;
  amountMinor: number | null;
  confirm?: FormConfirm;
  termsIntent?: TermsIntent | null;
  termsEffectiveFrom?: string;
}): EditPayloadResult {
  const confirm = options.confirm ?? EMPTY_FORM_CONFIRM;
  const initialAmountMinor = amountMinorFromForm(options.initial.amount);
  const body: SubscriptionWriteBody = {};

  if (options.current.provider.trim() !== options.initial.provider.trim() || confirm.provider) {
    body.provider = options.current.provider.trim();
  }

  if (textOrNull(options.current.plan) !== textOrNull(options.initial.plan)) {
    body.plan = textOrNull(options.current.plan);
  }

  if (textOrNull(options.current.accountHint) !== textOrNull(options.initial.accountHint)) {
    body.accountHint = textOrNull(options.current.accountHint);
  }

  if (options.current.status !== options.initial.status) {
    body.status = options.current.status;
  }

  const currencyChanged = currencyOf(options.current) !== currencyOf(options.initial);
  const amountChanged = options.amountMinor !== initialAmountMinor || currencyChanged;
  if (amountChanged || confirm.amount) {
    body.amountMinor = options.amountMinor;
  }

  if (currencyChanged) {
    body.currency = currencyOf(options.current);
  }

  const cadenceChanged =
    cadenceOrNull(options.current.cadence) !== cadenceOrNull(options.initial.cadence);
  if (cadenceChanged || confirm.cadence) {
    body.cadence = cadenceOrNull(options.current.cadence);
  }

  const nextRenewalChanged =
    textOrNull(options.current.nextRenewal) !== textOrNull(options.initial.nextRenewal);
  if (nextRenewalChanged || confirm.nextRenewal) {
    body.nextRenewal = textOrNull(options.current.nextRenewal);
  }

  if (textOrNull(options.current.startedOn) !== textOrNull(options.initial.startedOn)) {
    body.startedOn = textOrNull(options.current.startedOn);
  }

  if (textOrNull(options.current.endsOn) !== textOrNull(options.initial.endsOn)) {
    body.endsOn = textOrNull(options.current.endsOn);
  }

  const trialEndsOnChanged =
    textOrNull(options.current.trialEndsOn) !== textOrNull(options.initial.trialEndsOn);
  if (trialEndsOnChanged || confirm.trialEndsOn) {
    body.trialEndsOn = textOrNull(options.current.trialEndsOn);
  }

  const autoRenewalChanged =
    autoRenewalOrNull(options.current.autoRenewal) !==
    autoRenewalOrNull(options.initial.autoRenewal);
  if (autoRenewalChanged || confirm.autoRenewal) {
    body.autoRenewal = autoRenewalOrNull(options.current.autoRenewal);
  }

  if (textOrNull(options.current.notes) !== textOrNull(options.initial.notes)) {
    body.notes = textOrNull(options.current.notes);
  }

  const reminderPreferences = reminderPreferencesFromEdit(options.initial, options.current);

  if (!reminderPreferences.ok) {
    return reminderPreferences;
  }

  if (reminderPreferences.value) {
    body.reminderPreferences = reminderPreferences.value;
  }

  /**
   * An actual terms change is honoured whenever the person asks for one, not
   * only when the edit was ambiguous enough to be asked about: a price that
   * went up in March belongs in history even if the ledger never held the old
   * one. The question is only *demanded* when a recorded term was replaced.
   */
  if (options.termsIntent === "terms_change") {
    if (
      !canRecordTermsChange(
        options.initial,
        options.current,
        initialAmountMinor,
        options.amountMinor,
      )
    ) {
      return {
        ok: false,
        message: "A terms change needs a new price, cadence, or plan on a paid subscription.",
      };
    }

    const effectiveFrom = options.termsEffectiveFrom?.trim() ?? "";

    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
      return {
        ok: false,
        message: "A terms change needs the date the new price or plan took effect.",
      };
    }

    body.termsChange = { effectiveFrom };
  } else if (
    needsTermsIntent(
      options.initial,
      options.current,
      initialAmountMinor,
      options.amountMinor,
    ) &&
    options.termsIntent !== "correction"
  ) {
    return {
      ok: false,
      message: "Say whether this is a correction or an actual terms change.",
    };
  }

  if (Object.keys(body).length === 0) {
    return { ok: false, message: "No changes to save." };
  }

  return { ok: true, body };
}
