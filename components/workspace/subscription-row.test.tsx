import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SubscriptionRow } from "@/components/workspace/subscription-row";
import { compactListFixture } from "@/lib/workspace/compact-list-fixture";
import { entryAccountHint, rowElementId } from "@/lib/workspace/row-presentation";

describe("SubscriptionRow", () => {
  const rows = compactListFixture();

  it("renders 25 compact rows with account, after-trial and not-added-yet copy", () => {
    const html = rows
      .map((entry) =>
        renderToStaticMarkup(
          <SubscriptionRow entry={entry} filter="all" href={`/workspace?row=${entry.key}`} open={false} />,
        ),
      )
      .join("\n");

    expect(rows).toHaveLength(25);
    expect(html).toContain("Northstar Notes");
    expect(html).toContain("personal@example.test");
    expect(html).toContain("studio-billing-contact-with-a-very-long-identifier@example.test");
    expect(html).toContain("Harbor Design Library and Collaboration Studio");
    expect(html).toContain("After trial");
    expect(html).toContain("Not added yet");
    expect(html).toContain("Proposed draft");
    expect(html).toContain("Not recorded");
    expect(html).toContain("Recorded renewal");
    expect(html).toContain("Expected renewal");
    expect(html).toContain("31 Oct 2026");
    expect(html).toContain("Recorded 31 Jan 2026");
    expect(html).not.toContain("Expected 31 Oct 2026");
    expect(html).toContain("Trial ends");
    expect(html).not.toContain("needs attention");
    expect(html).not.toContain("Amount unknown");
  });

  it("marks the open row as expanded and keeps missing accounts out of the copy", () => {
    const juniper = rows.find((row) => row.provider === "Juniper Cloud")!;
    const html = renderToStaticMarkup(
      <SubscriptionRow entry={juniper} filter="all" href="/workspace" open />,
    );

    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain(`id="${rowElementId(juniper.key)}"`);
    expect(entryAccountHint(juniper)).toBeNull();
    expect(html).not.toContain("No account");
    expect(html).not.toContain("inferred account");
  });
});
