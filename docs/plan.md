# Delivery status and scope

The definition of correct is [AGENTS.md](../AGENTS.md), [product.md](product.md) and the data/API contracts. [User journeys](user-journeys.md) record the motivations and alternative paths behind the current experience. Linear is the work queue; this page does not duplicate a completed issue sequence.

Stage One and the workspace changes including SUB-66–SUB-69 have landed. The current `/workspace` centres subscriptions, with All, Pending reviews, Open questions and Reminders filters and contextual conversation. SUB-65 superseded the separate Work/Subscriptions presentation. The primary surface has no aggregate totals or coverage panel; the summary API remains.

[SUB-63](https://linear.app/lets-play-match/issue/SUB-63/validate-the-subscription-workspace-with-real-onboarding-and-return) is Done. On 13 September 2026, Bhavesh confirmed the four validation fixes, completed another real-subscription onboarding round, accepted the outcome and asked to conclude the project. The [validation record](validation/sub-63-run-2026-09-11.md) distinguishes this human sign-off from checklist details that were not individually reported. The two separately documented return visits were not established; no additional visits are required by this closure decision. [testing-and-signoff.md](testing-and-signoff.md) remains a reusable guide. Future changes need their own issue and PR.

The compact UI from SUB-72–SUB-78 was signed off on 15 September 2026 as [SUB-79](https://linear.app/lets-play-match/issue/SUB-79/validate-the-new-ui-with-comparison-tasks-and-record-human-sign-off). That record is [validation/sub-79-ui-signoff.md](validation/sub-79-ui-signoff.md). Bhavesh also signed off SUB-80 and concluded the Subscription UI & Interaction Design project. Unreported comparison-task outcomes are not claimed as passed. Remaining observations, including SUB-81, belong in their own issue and thread. This does not reopen SUB-63.

SUB-64's cancellation-intention reminders and follow-up are outside SUB-63. Actual completed cancellation still uses the existing lifecycle rules. Automatic application of captured changes and any separate summary view are not part of this work.

Use the existing login and setup. Resetting records is only deliberate test preparation, never assumed or new reset UI. Production sign-in setup, email ingestion, external notifications, schedulers, payments, automatic trial conversion and other integrations remain excluded.

One issue → one PR → human sign-off. Do not merge automatically. See [coordination.md](coordination.md) and the [Subscription Workspace UX project](https://linear.app/lets-play-match/project/subscription-workspace-ux-6fb87b2cf4de/overview).
