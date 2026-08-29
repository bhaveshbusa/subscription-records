import type { FieldStatus, SubscriptionDetail, SubscriptionListItem } from "./projection";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FIELD_STATUS_LABEL: Record<FieldStatus, string> = {
  empty: "Missing",
  proposed: "Proposed",
  inferred: "Inferred",
  confirmed: "Confirmed",
  deferred: "Deferred",
  conflicted: "Conflicted",
};

export function formatMoneyMinor(minor: number, currency: string): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}

export function formatMonthlyEquivalent(minor: number | null): string {
  return minor === null ? "—" : `${formatMoneyMinor(minor, "GBP")}/mo`;
}

export function formatDate(iso: string | null): string {
  if (!iso) {
    return "—";
  }

  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > new Date(Date.UTC(year, month, 0)).getUTCDate()
  ) {
    return "—";
  }

  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function statusLabel(status: SubscriptionListItem["status"]["value"]): string {
  switch (status) {
    case "cancel_scheduled":
      return "Cancel scheduled";
    case "unknown":
      return "Unknown";
    case "trial":
      return "Trial";
    case "active":
      return "Active";
    case "paused":
      return "Paused";
    case "cancelled":
      return "Cancelled";
    case "lapsed":
      return "Lapsed";
    case null:
      return "Unknown";
  }
}

export function cadenceLabel(cadence: SubscriptionListItem["cadence"]["value"]): string {
  switch (cadence) {
    case "weekly":
      return "Weekly";
    case "monthly":
      return "Monthly";
    case "yearly":
      return "Yearly";
    case null:
      return "—";
  }
}

export function fieldStatusLabel(status: FieldStatus): string {
  return FIELD_STATUS_LABEL[status];
}

const EVENT_TYPE_LABEL: Record<SubscriptionDetail["events"][number]["type"], string> = {
  started: "Started",
  converted_to_paid: "Converted to paid",
  charged: "Charged",
  terms_changed: "Terms changed",
  paused: "Paused",
  resumed: "Resumed",
  cancel_scheduled: "Cancel scheduled",
  cancelled: "Cancelled",
  refunded: "Refunded",
  payment_failed: "Payment failed",
  lapsed: "Lapsed",
  reactivated: "Reactivated",
};

export function eventTypeLabel(type: SubscriptionDetail["events"][number]["type"]): string {
  return EVENT_TYPE_LABEL[type];
}

const TRUST_RANK: Record<SubscriptionListItem["amount"]["status"], number> = {
  confirmed: 0,
  inferred: 1,
  proposed: 2,
  deferred: 3,
  empty: 4,
  conflicted: 5,
};

const TRUST_LABEL: Record<SubscriptionListItem["amount"]["status"], string> = {
  confirmed: "Confirmed",
  inferred: "Inferred",
  proposed: "Proposed",
  deferred: "Deferred",
  empty: "Missing",
  conflicted: "Conflicted",
};

export function trustLabel(
  item: Pick<SubscriptionListItem, "amount" | "cadence" | "nextRenewal">,
): string {
  const worst = [item.amount.status, item.cadence.status, item.nextRenewal.status].reduce(
    (current, status) => (TRUST_RANK[status] > TRUST_RANK[current] ? status : current),
  );

  return TRUST_LABEL[worst];
}
