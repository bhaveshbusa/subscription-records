import { parseAmountInput, toAmountInput } from "./money";
import type { CADENCES, Cadence, SUBSCRIPTION_STATUSES } from "./params";
import type { FieldStatus, SubscriptionDetail } from "./projection";

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
  notes: string;
};

/** Trust for money and date fields the edit form can confirm without changing. */
export type SubscriptionFormTrust = {
  amount: FieldStatus;
  cadence: FieldStatus;
  nextRenewal: FieldStatus;
};

export type FormConfirm = {
  amount: boolean;
  cadence: boolean;
  nextRenewal: boolean;
};

export const EMPTY_FORM_CONFIRM: FormConfirm = {
  amount: false,
  cadence: false,
  nextRenewal: false,
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
  notes?: string | null;
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
  notes: "",
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

export function amountMinorFromForm(amount: string): number | null {
  const parsed = parseAmountInput(amount);

  return parsed.ok ? parsed.minor : null;
}

export function toSubscriptionFormValues(
  subscription: SubscriptionDetail,
): SubscriptionFormValues {
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
    notes: subscription.notes ?? "",
  };
}

export function toSubscriptionFormTrust(
  subscription: SubscriptionDetail,
): SubscriptionFormTrust {
  return {
    amount: subscription.amount.status,
    cadence: subscription.cadence.status,
    nextRenewal: subscription.nextRenewal.status,
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
    notes: textOrNull(values.notes),
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

  if (textOrNull(options.current.notes) !== textOrNull(options.initial.notes)) {
    body.notes = textOrNull(options.current.notes);
  }

  if (termsFieldsChanged(options.initial, options.current, initialAmountMinor, options.amountMinor)) {
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
