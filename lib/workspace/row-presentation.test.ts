import { describe, expect, it } from "vitest";

import { compactListFixture } from "./compact-list-fixture";
import {
  entryAccountHint,
  entryAmountPreview,
  entryDateColumn,
  entryDatePreview,
  entryFilterContext,
  entryIdentityLabel,
  entryIdentitySecondary,
  entryStatusText,
} from "./row-presentation";

describe("compact list fixture", () => {
  const rows = compactListFixture();

  it("has 25 distinct rows covering the SUB-73 scan cases", () => {
    expect(rows).toHaveLength(25);
    expect(new Set(rows.map((row) => row.key)).size).toBe(25);

    const northstars = rows.filter((row) => row.provider === "Northstar Notes" && row.kind === "saved");
    const cedars = rows.filter((row) => row.provider === "Cedar Audio" && row.kind === "draft");

    expect(northstars.map((row) => entryAccountHint(row))).toEqual([
      "personal@example.test",
      "studio-billing-contact-with-a-very-long-identifier@example.test",
    ]);
    expect(cedars).toHaveLength(2);
    expect(cedars[0].key).not.toBe(cedars[1].key);
    expect(rows.some((row) => row.provider === "Harbor Design Library and Collaboration Studio")).toBe(
      true,
    );
    expect(rows.some((row) => row.item?.status.value === "trial")).toBe(true);
    expect(rows.some((row) => row.item?.status.value === "cancelled")).toBe(true);
    expect(rows.some((row) => row.item?.amount.value === null && row.kind === "saved")).toBe(true);
  });
});

describe("row presentation", () => {
  const rows = compactListFixture();
  const byProvider = (name: string) => rows.filter((row) => row.provider === name);

  it("shows a stored account and leaves a missing one unset", () => {
    const [personal, studio] = byProvider("Northstar Notes");
    const juniper = byProvider("Juniper Cloud")[0];

    expect(entryAccountHint(personal)).toBe("personal@example.test");
    expect(entryAccountHint(studio)).toContain("studio-billing-contact");
    expect(entryAccountHint(juniper)).toBeNull();
    expect(entryIdentityLabel(personal)).toBe("Northstar Notes, personal@example.test");
    expect(entryIdentitySecondary(personal)).toBe(
      "Active · Plus · personal@example.test",
    );
    expect(entryIdentitySecondary(studio)).toContain("Team · studio-billing-contact");
    expect(entryIdentitySecondary(juniper)).toBe("Active · Storage");
    expect(entryIdentitySecondary(personal)).not.toBe(entryIdentitySecondary(studio));
  });

  it("keeps two drafts of one provider as separate not-added-yet rows", () => {
    const cedars = byProvider("Cedar Audio");

    expect(cedars).toHaveLength(2);
    expect(cedars.every((row) => entryStatusText(row) === "Not added yet")).toBe(true);
    expect(entryAccountHint(cedars[0])).toBe("personal@example.test");
    expect(entryAccountHint(cedars[1])).toBe("family@example.test");
    expect(entryAmountPreview(cedars[0]).proposedDraft).toBe(true);
  });

  it("labels trial paid terms after trial and keeps unknown amounts unknown", () => {
    const harbor = byProvider("Harbor Design Library and Collaboration Studio")[0];
    const juniper = byProvider("Juniper Cloud")[0];

    expect(entryAmountPreview(harbor)).toMatchObject({
      amount: "£18.00",
      cadence: "Monthly",
      afterTrial: true,
    });
    expect(entryAmountPreview(juniper).amount).toBeNull();
    expect(entryDatePreview(harbor).label).toBe("Trial ends");
  });

  it("labels recorded and expected dates independently", () => {
    const atlas = byProvider("Atlas Learning")[0];
    const dates = entryDatePreview(atlas);

    expect(dates.label).toBe("Recorded renewal");
    expect(dates.recorded).toBe("31 Jan 2026");
    expect(dates.expected).toBe("31 Oct 2026");
    expect(dates.expected).not.toBe(dates.recorded);
    expect(entryDateColumn(atlas)).toEqual({
      label: "Expected renewal",
      value: "31 Oct 2026",
      supporting: "Recorded 31 Jan 2026",
    });
  });

  it("keeps recorded as the main date when there is no distinct expected date", () => {
    const juniper = byProvider("Juniper Cloud")[0];

    expect(entryDateColumn(juniper)).toEqual({
      label: "Recorded renewal",
      value: null,
      supporting: null,
    });
  });

  it("does not put an attention chip on saved inventory under All", () => {
    const northstar = byProvider("Northstar Notes")[0];

    expect(entryFilterContext(northstar, "all")).toBeNull();
  });
});
