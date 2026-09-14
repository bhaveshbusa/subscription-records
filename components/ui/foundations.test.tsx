import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Button, Disclosure, Feedback, FieldFrame, Surface } from "./foundations";

describe("shared UI foundations", () => {
  it("keeps button intent and native disabled state visible", () => {
    const html = renderToStaticMarkup(<Button variant="primary" disabled>Saving…</Button>);
    expect(html).toContain('type="button"');
    expect(html).toContain("ui-button--primary");
    expect(html).toContain("disabled");
  });

  it("labels fields and disclosures without substituting domain state", () => {
    const html = renderToStaticMarkup(
      <Surface><FieldFrame label="Amount"><span>£12.00</span></FieldFrame><Disclosure label="Evidence"><p>Synthetic</p></Disclosure></Surface>,
    );
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Amount"');
    expect(html).toContain("<summary>Evidence</summary>");
  });

  it("exposes failures as alerts", () => {
    expect(renderToStaticMarkup(<Feedback tone="error">Try again</Feedback>)).toContain('role="alert"');
  });
});
