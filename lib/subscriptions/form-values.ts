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
  amount: FieldStatus;
  cadence: FieldStatus;
  nextRenewal: FieldStatus;
  trialEndsOn: FieldStatus;
  autoRenewal: FieldStatus;
};

export type FormConfirm = {
  amount: boolean;
  cadence: boolean;
  nextRenewal: boolean;
  trialEndsOn: boolean;
  autoRenewal: boolean;
};

export const EMPTY_FORM_CONFIRM: FormConfirm = {
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

export function termsFieldsChanged(
  initial: SubscriptionFormValues,
  current: SubscriptionFormValues,
  initialAmountMinor: number | null,
  amountMinor: number | null,
): boolean {
  return (
    amountMinor !== initialAmountMinor ||
    cadenceOrNull(current.cadence) !== cadenceOrNull(initial.cadence) ||
    textOrNull(current.plan) !== textOrNull(initial.plan)
  );
}

/**
 * Amount, cadence, and plan on a trial are the paid plan after trial, not
 * currently in-force terms. Filling or changing them is an ordinary write, not
 * a correction versus an actual terms change.
 */
export function needsTermsIntent(
  initial: SubscriptionFormValues,
  current: SubscriptionFormValues,
  initialAmountMinor: number | null,
  amountMinor: number | null,
): boolean {
  if (initial.status === "trial" || current.status === "trial") {
    return false;
  }

  return termsFieldsChanged(initial, current, initialAmountMinor, amountMinor);
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

  if (options.current.provider.trim() !== options.initial.provider.trim()) {
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

  const amountChanged = options.amountMinor !== initialAmountMinor;
  if (amountChanged || confirm.amount) {
    body.amountMinor = options.amountMinor;
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

  if (needsTermsIntent(options.initial, options.current, initialAmountMinor, options.amountMinor)) {
    if (options.termsIntent === "terms_change") {
      const effectiveFrom = options.termsEffectiveFrom?.trim() ?? "";

      if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
        return {
          ok: false,
          message: "A terms change needs the date the new price or plan took effect.",
        };
      }

      body.termsChange = { effectiveFrom };
    } else if (options.termsIntent !== "correction") {
      return {
        ok: false,
        message: "Say whether this is a correction or an actual terms change.",
      };
    }
  }

  if (Object.keys(body).length === 0) {
    return { ok: false, message: "No changes to save." };
  }

  return { ok: true, body };
}
