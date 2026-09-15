import { describe, expect, it } from "vitest";

import { intentionIsDue, intentionRowHint } from "./copy";
import { projectVisibleCancellationIntention } from "./notifications";

describe("projectVisibleCancellationIntention", () => {
  it("hides the Reminders card before remind_on", () => {
    expect(
      projectVisibleCancellationIntention({
        subscriptionId: "sub-1",
        remindOn: "2026-10-01",
        today: "2026-09-30",
      }),
    ).toBeNull();
  });

  it("shows from remind_on onward with no auto-expiry", () => {
    expect(
      projectVisibleCancellationIntention({
        subscriptionId: "sub-1",
        remindOn: "2026-10-01",
        today: "2026-10-01",
      }),
    ).toMatchObject({
      kind: "cancellation_intention",
      remindOn: "2026-10-01",
      dueDate: "2026-10-01",
    });

    expect(
      projectVisibleCancellationIntention({
        subscriptionId: "sub-1",
        remindOn: "2026-10-01",
        today: "2026-12-15",
      }),
    ).not.toBeNull();
  });
});

describe("intention copy", () => {
  it("distinguishes soft vs due presentation", () => {
    const intention = { remindOn: "2026-10-01" };

    expect(intentionIsDue(intention, "2026-09-15")).toBe(false);
    expect(intentionRowHint(intention, "2026-09-15")).toContain("Planning to cancel");
    expect(intentionRowHint(intention, "2026-10-01")).toContain("Time to cancel");
  });
});
