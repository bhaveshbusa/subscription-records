import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OpenSubscription } from "@/components/workspace/open-subscription";
import { compactListFixture } from "@/lib/workspace/compact-list-fixture";

const idle = {
  conversation: [],
  conversationLoading: false,
  refreshKey: 0,
  closeHref: "/workspace",
  onCaptured: () => false,
  onSelectTarget: () => undefined,
  onWritten: () => undefined,
  onDecided: () => undefined,
};

describe("OpenSubscription coherent detail", () => {
  const rows = compactListFixture();

  it("uses one draft shell without a pending-review identity card or saved-details heading", () => {
    const cedar = rows.find((row) => row.key === "draft:draft-cedar-personal")!;
    const html = renderToStaticMarkup(
      <OpenSubscription
        {...idle}
        entry={cedar}
        filter="reviews"
        target={{
          kind: "proposal",
          id: cedar.draft!.id,
          provider: "Cedar Audio",
          subscriptionId: null,
        }}
      />,
    );

    expect(html).toContain("Draft details");
    expect(html).toContain("Proposed draft");
    expect(html).toContain("Not added yet");
    expect(html).toContain("Nothing saved");
    expect(html).not.toContain("Pending review");
    expect(html).not.toContain("Saved details");
    expect(html).not.toContain("Current terms");
    expect(html).not.toContain("Cedar Audio</h2>");
    expect(html).not.toContain('href="#reminders-');
    expect(html).toContain('href="#composer-draft-cedar-personal"');
    expect(html).toContain(">Conversation</a>");
  });

  it("keeps two Northstar Personal proposals independently addressable beside saved terms", () => {
    const northstar = rows.find((row) => row.key === "sub-northstar-personal")!;
    const html = renderToStaticMarkup(
      <OpenSubscription
        {...idle}
        entry={northstar}
        filter="reviews"
        target={{
          kind: "subscription",
          id: northstar.subscriptionId!,
          provider: "Northstar Notes",
        }}
      />,
    );

    expect(html).toContain("Pending update");
    expect(html).toContain("£15.00");
    expect(html).toContain("Pending cancellation");
    expect(html).toContain('id="proposal-northstar-amount"');
    expect(html).toContain('id="proposal-northstar-cancel"');
    expect(html).not.toContain("Pending review");
    expect(html).not.toContain("Saved details");
    expect(html).toContain('href="#reminders-sub-northstar-personal"');
    expect(html).toContain(">Reminders</a>");
    expect(html).toContain('href="#composer-sub-northstar-personal"');
    expect(html).toContain(">Conversation</a>");
    expect(html).not.toContain("Show reminders, amendments");
  });

  it("keeps a deferred Juniper question reachable from the toolbar without promising a date", () => {
    const juniper = rows.find((row) => row.key === "sub-juniper")!;
    const html = renderToStaticMarkup(
      <OpenSubscription
        {...idle}
        entry={{
          ...juniper,
          questions: [
            {
              id: "q-juniper-amount",
              reason: "amount",
              state: "deferred",
              provider: "Juniper Cloud",
              question: "What does Juniper Cloud cost?",
              subscriptionId: "sub-juniper",
              scopeKey: "holding:sub-juniper",
              updatedAt: "2026-09-14T00:00:00.000Z",
            },
          ],
        }}
        filter="questions"
        target={{
          kind: "subscription",
          id: juniper.subscriptionId!,
          provider: "Juniper Cloud",
        }}
      />,
    );

    expect(html).toContain('href="#questions-sub-juniper"');
    expect(html).toContain("Questions (1)");
    expect(html).toContain("Deferred — still available here");
    expect(html).toContain("Answer");
    expect(html).not.toContain(">Later</");
    expect(html).not.toContain("snooze");
  });
});
