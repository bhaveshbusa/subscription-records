import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FieldReview } from "./field-review";

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
  it("offers Confirm and Edit for an untrusted value", () => {
    const html = render({});

    expect(html).toContain('aria-label="Confirm Amount: £9.99"');
    expect(html).toContain('aria-label="Edit Amount"');
    expect(html).toContain("£9.99");
  });

  it("offers only Edit once the value is confirmed", () => {
    const html = render({ status: "confirmed" });

    expect(html).not.toContain("Confirm Amount");
    expect(html).toContain('aria-label="Edit Amount"');
  });

  it("offers Add, not Confirm, for a blank", () => {
    const html = render({ hasValue: false, status: "empty", value: "—" });

    expect(html).not.toContain("Confirm Amount");
    expect(html).toContain('aria-label="Add Amount"');
  });

  it("shows Undo instead of Confirm while a confirmation is staged", () => {
    const html = render({ onUndo: () => {} });

    expect(html).toContain('aria-label="Undo Amount"');
    expect(html).not.toContain("Confirm Amount");
  });

  it("keeps the editor closed until asked", () => {
    expect(render({})).not.toContain('aria-label="Amount"');
  });
});
