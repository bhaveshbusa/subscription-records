import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StatusFieldEditor } from "./status-field-editor";

describe("StatusFieldEditor", () => {
  it("renders a status select without lifecycle timing until cancel is chosen", () => {
    const html = renderToStaticMarkup(
      <StatusFieldEditor initialNotes="" initialStatus="active" save={async () => null} />,
    );

    expect(html).toContain("Status");
    expect(html).toContain("Active");
    expect(html).toContain("Cancelled");
    expect(html).toContain("Cancel scheduled");
    expect(html).toContain("Save");
    expect(html).not.toContain("Ended on");
    expect(html).not.toContain("Confirm cancelled");
  });
});
