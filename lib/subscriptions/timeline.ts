import { eventTypeLabel, formatDate, formatMoneyMinor } from "./format";
import type { SubscriptionDetail } from "./projection";

export type TimelineEntry = {
  key: string;
  on: string;
  title: string;
  detail: string | null;
  unconfirmed: boolean;
};

/** Events and charges merged into one reverse-chronological activity feed. */
export function timelineEntries(
  detail: Pick<SubscriptionDetail, "events" | "charges">,
): TimelineEntry[] {
  const fromEvents = detail.events.map((event) => ({
    key: `event-${event.id}`,
    on: event.at.slice(0, 10),
    title: eventTypeLabel(event.type),
    detail: event.rationale,
    unconfirmed: !event.confirmed,
  }));
  const fromCharges = detail.charges.map((charge) => ({
    key: `charge-${charge.id}`,
    on: charge.paidOn,
    title: `Charged ${formatMoneyMinor(charge.amountMinor, charge.currency)}`,
    detail:
      charge.coversFrom && charge.coversTo
        ? `Covers ${formatDate(charge.coversFrom)} – ${formatDate(charge.coversTo)}`
        : null,
    unconfirmed: false,
  }));

  return [...fromEvents, ...fromCharges].sort((a, b) => b.on.localeCompare(a.on));
}
