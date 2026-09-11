import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { SubscriptionListItem } from "@/lib/subscriptions/projection";
import { recordWorkspaceHref } from "@/lib/workspace/view";

import { SubscriptionsTable } from "./subscriptions-table";

const NETFLIX_ID = "11111111-2222-4333-8444-555555555555";
const SPOTIFY_ID = "66666666-7777-4888-8999-aaaaaaaaaaaa";

function field<T>(value: T | null) {
  return { value, status: "proposed" as const, confidence: null };
}

function item(id: string, provider: string): SubscriptionListItem {
  return {
    id,
    provider: field(provider),
    plan: field(null),
    status: field("active" as const),
    amount: field(null),
    cadence: field(null),
    nextRenewal: field(null),
    trialEndsOn: field(null),
    autoRenewal: field(null),
    endsOn: null,
    monthlyEquivalentMinor: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function render(selectedId: string | null) {
  return renderToStaticMarkup(
    <SubscriptionsTable
      items={[item(NETFLIX_ID, "Netflix"), item(SPOTIFY_ID, "Spotify")]}
      recordHref={(row) => recordWorkspaceHref(row.id)}
      selectedId={selectedId}
    />,
  );
}

describe("SubscriptionsTable", () => {
  it("opens each record in the workspace rather than on a page of its own", () => {
    const html = render(null);

    expect(html).toContain(`href="/workspace?record=${NETFLIX_ID}"`);
    expect(html).not.toContain("/ledger/");
  });

  it("marks the row whose record is already open", () => {
    const html = render(NETFLIX_ID);

    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
    expect(html.indexOf('aria-current="true"')).toBeLessThan(html.indexOf("Spotify"));
  });

  it("marks nothing when no record is open", () => {
    expect(render(null)).not.toContain("aria-current");
  });
});
