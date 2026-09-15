import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  describeDecisionOutcome,
  OutcomeNotice,
} from "@/components/proposals/outcome-notice";
import type { Outcome } from "@/components/proposals/use-proposal-decision";

function outcome(partial: Partial<Outcome> & Pick<Outcome, "decision" | "kind" | "provider">): Outcome {
  return {
    subscriptionId: "sub-1",
    conflicts: [],
    confirmed: [],
    ...partial,
  };
}

describe("OutcomeNotice", () => {
  it("names create, update, reject and conflict outcomes differently", () => {
    expect(
      describeDecisionOutcome(
        outcome({ decision: "accept", kind: "create", provider: "Cedar Audio" }),
      ),
    ).toContain("is now a saved subscription with its amounts still proposed");

    expect(
      describeDecisionOutcome(
        outcome({
          decision: "accept",
          kind: "update",
          provider: "Northstar Notes",
          confirmed: ["amountMinor"],
        }),
      ),
    ).toBe("Northstar Notes was updated with your amount confirmed.");

    expect(
      describeDecisionOutcome(
        outcome({ decision: "reject", kind: "create", provider: "Cedar Audio" }),
      ),
    ).toBe("Cedar Audio was rejected. Nothing was saved.");
  });

  it("omits Open it when the notice is already on the open row", () => {
    const accepted = outcome({
      decision: "accept",
      kind: "create",
      provider: "Cedar Audio",
      subscriptionId: "sub-cedar",
    });

    const onRow = renderToStaticMarkup(
      <OutcomeNotice alreadyOnRow outcome={accepted} />,
    );
    const elsewhere = renderToStaticMarkup(<OutcomeNotice outcome={accepted} />);

    expect(onRow).toContain("ui-feedback--success");
    expect(onRow).toContain("is now a saved subscription");
    expect(onRow).not.toContain("Open it");
    expect(elsewhere).toContain("Open it");
    expect(elsewhere).toContain("/workspace?");
  });

  it("keeps conflict wording under shared Feedback", () => {
    const html = renderToStaticMarkup(
      <OutcomeNotice
        alreadyOnRow
        outcome={outcome({
          decision: "accept",
          kind: "update",
          provider: "Northstar Notes",
          conflicts: ["amount"],
          confirmed: ["cadence"],
        })}
      />,
    );

    expect(html).toContain("ui-feedback--success");
    expect(html).toContain("was updated with your cadence confirmed");
    expect(html).toContain("Kept your confirmed amount");
    expect(html).toContain("flagged the field as conflicted");
    expect(html).not.toContain("Open it");
  });
});
