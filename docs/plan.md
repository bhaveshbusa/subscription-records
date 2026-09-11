# Delivery status and scope

The definition of correct is [AGENTS.md](../AGENTS.md), [product.md](product.md) and the data/API contracts. [User journeys](user-journeys.md) record the motivations and alternative paths behind the current experience. Linear is the work queue; this page does not duplicate a completed issue sequence.

Stage One and the workspace changes through SUB-65 have landed. The current `/workspace` centres subscriptions, with All, Pending reviews, Open questions and Reminders filters and contextual conversation. SUB-65 superseded the separate Work/Subscriptions presentation. The primary surface has no aggregate totals or coverage panel; the summary API remains.

The current activity is [SUB-63: real onboarding and return validation](https://linear.app/lets-play-match/issue/SUB-63/validate-the-subscription-workspace-with-real-onboarding-and-return). Follow [testing-and-signoff.md](testing-and-signoff.md), record live outcomes and complete two later visits on the retained dataset. This remains unverified until the human records sign-off. Substantive repairs need their own issue and PR.

SUB-64's cancellation-intention reminders and follow-up are outside SUB-63. Actual completed cancellation still uses the existing lifecycle rules. Automatic application of captured changes and any separate summary view are not part of this work.

Use the existing login and setup. Resetting records is only deliberate test preparation, never assumed or new reset UI. Production sign-in setup, email ingestion, external notifications, schedulers, payments, automatic trial conversion and other integrations remain excluded.

One issue → one PR → human sign-off. Do not merge automatically. See [coordination.md](coordination.md) and the [Subscription Workspace UX project](https://linear.app/lets-play-match/project/subscription-workspace-ux-6fb87b2cf4de/overview).
