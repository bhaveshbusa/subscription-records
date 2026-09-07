import { toAmountInput } from "./money";
import type { CADENCES, SUBSCRIPTION_STATUSES } from "./params";
import type { SubscriptionDetail } from "./projection";

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
