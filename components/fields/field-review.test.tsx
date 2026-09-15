import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FieldGroup, FieldReview } from "./field-review";

function render(props: Partial<Parameters<typeof FieldReview>[0]>) {
  return renderToStaticMarkup(
    <FieldReview
      editor={<input aria-label="Amount" />}
      hasValue
      label="Amount"
      onConfirm={() => {}}
      status="proposed"
      value="£9.99"
      {...props}
    />,
  );
}

describe("FieldReview", () => {
  it("offers Confirm amount and quiet Edit for an untrusted value", () => {
    const html = render({});

    expect(html).toContain('aria-label="Confirm amount: £9.99"');
    expect(html).toContain("Confirm amount");
    expect(html).toContain("ui-button--primary");
    expect(html).toContain('aria-label="Edit Amount"');
    expect(html).toContain("ui-button--quiet");
    expect(html).toContain("£9.99");
  });

  it("offers only Edit once the value is confirmed", () => {
    const html = render({ status: "confirmed" });

    expect(html).not.toContain("Confirm amount");
    expect(html).toContain('aria-label="Edit Amount"');
    expect(html).not.toContain("Confirmed");
    expect(html).not.toContain("ui-status--confirmed");
  });

  it("offers Add, not Confirm, for a blank and says Not recorded without a Missing chip", () => {
    const html = render({ hasValue: false, status: "empty", value: "—" });

    expect(html).not.toContain("Confirm amount");
    expect(html).toContain('aria-label="Add Amount"');
    expect(html).toContain("Not recorded");
    expect(html).toContain("ui-field-value--empty");
    expect(html).not.toContain("Missing");
    expect(html).not.toContain("ui-status--empty");
    expect(html).not.toContain(">£9.99<");
  });

  it("keeps Proposed labelled and softens Notes empty copy to None", () => {
    expect(render({})).toContain("Proposed");
    expect(
      render({
        emptyCopy: "None",
        hasValue: false,
        label: "Notes",
        onConfirm: undefined,
        status: null,
        value: "—",
      }),
    ).toContain("None");
  });

  it("shows Undo instead of Confirm while a confirmation is staged", () => {
    const html = render({ onUndo: () => {} });

    expect(html).toContain('aria-label="Undo Amount"');
    expect(html).not.toContain("Confirm amount");
  });

  it("keeps the editor closed until asked", () => {
    expect(render({})).not.toContain('aria-label="Amount"');
  });

  it("does not offer Confirm or Edit on a read-only expected date", () => {
    const html = render({
      editor: undefined,
      label: "Expected next renewal",
      onConfirm: () => {},
      readOnly: true,
      status: "inferred",
      value: "6 Oct 2026",
    });

    expect(html).not.toContain("Confirm expected");
    expect(html).not.toContain("Edit Expected");
    expect(html).toContain("6 Oct 2026");
    expect(html).toContain("Inferred");
  });

  it("names Saving on the confirm control without hiding the value", () => {
    const html = render({ saving: true });

    expect(html).toContain("Saving…");
    expect(html).toContain("£9.99");
    expect(html).toContain("aria-busy");
  });

  it("shows success and error at the field", () => {
    expect(render({ success: "Amount confirmed." })).toContain("Amount confirmed.");
    expect(render({ error: "That record changed. Refresh and try again." })).toContain(
      "That record changed. Refresh and try again.",
    );
    expect(render({ error: "Conflict", success: "Amount confirmed." })).not.toContain(
      "Amount confirmed.",
    );
  });

  it("explains a conflicted recorded value", () => {
    const html = render({ onConfirm: undefined, status: "conflicted" });

    expect(html).toContain("Conflicted");
    expect(html).toContain("nothing is replaced silently");
  });
});

describe("FieldGroup", () => {
  it("groups amount and cadence without merging their actions", () => {
    const html = renderToStaticMarkup(
      <FieldGroup label="Price and cadence">
        <FieldReview hasValue label="Amount" onConfirm={() => {}} status="inferred" value="£12.00" />
        <FieldReview hasValue label="Cadence" onConfirm={() => {}} status="proposed" value="Monthly" />
      </FieldGroup>,
    );

    expect(html).toContain('aria-label="Price and cadence"');
    expect(html).toContain("Confirm amount");
    expect(html).toContain("Confirm cadence");
  });
});
