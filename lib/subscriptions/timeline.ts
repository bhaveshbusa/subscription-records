import { eventTypeLabel } from "./format";
import type { SubscriptionDetail } from "./projection";

export type TimelineEntry = {
  key: string;
  on: string;
  title: string;
  detail: string | null;
  unconfirmed: boolean;
};

const CHARGE_EVENT_TYPES = new Set(["charged"]);

/**
 * Lifecycle and terms changes, newest first. Charges are inventory-irrelevant:
 * a payment line is not what the ledger records.
 */
export function timelineEntries(
  detail: Pick<SubscriptionDetail, "events">,
): TimelineEntry[] {
  return detail.events
    .filter((event) => !CHARGE_EVENT_TYPES.has(event.type))
    .map((event) => ({
      key: `event-${event.id}`,
      on: event.at.slice(0, 10),
      title: eventTypeLabel(event.type),
      detail: event.rationale,
      unconfirmed: !event.confirmed,
    }))
    .sort((a, b) => b.on.localeCompare(a.on));
}
