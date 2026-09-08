# Stage one: Linear backlog

Issue identifiers and blocking relationships for the [Stage One project](https://linear.app/lets-play-match/project/stage-one-e9ded9c215f5/overview). Tracking epics are not implementation PRs. Status, assignees, and sign-off live in Linear.

The contract is [AGENTS.md](../AGENTS.md) and [product.md](product.md). Planning narrative: [stage-one-implementation-plan.md](stage-one-implementation-plan.md). Human journeys: [stage-one-acceptance-scenarios.md](stage-one-acceptance-scenarios.md).

## Epics

| Epic | Title | Children |
|---|---|---|
| [SUB-39](https://linear.app/lets-play-match/issue/SUB-39/stage-one-core-records-and-trust) | Core records and trust | SUB-42, SUB-43, SUB-44, SUB-45, SUB-46 |
| [SUB-40](https://linear.app/lets-play-match/issue/SUB-40/stage-one-expected-renewals-and-inbox-reminders) | Expected renewals and Inbox reminders | SUB-47, SUB-48, SUB-49 |
| [SUB-41](https://linear.app/lets-play-match/issue/SUB-41/stage-one-onboarding-and-recovery-validation) | Onboarding and recovery validation | SUB-50, SUB-51 |

SUB-45 and SUB-46 sit under SUB-39 but are blocked by SUB-40 work (preferences and expected schedules). Completing SUB-39 therefore requires SUB-47 and SUB-48.

## Implementation issues

Recommended order: SUB-42 → SUB-43 → SUB-44 → SUB-47 → SUB-45 → SUB-48 → SUB-49 / SUB-46 → SUB-50 → SUB-51. SUB-45 and SUB-48 can swap after their dependencies. SUB-46 and SUB-49 are independent after theirs.

| Issue | Plan | Title | Blocked by | Blocks |
|---|---|---|---|---|
| [SUB-42](https://linear.app/lets-play-match/issue/SUB-42/publish-the-revised-stage-one-contract) | 00 | Publish the revised stage-one contract (docs only) | — | SUB-43 and the D1–D6 dependents |
| [SUB-43](https://linear.app/lets-play-match/issue/SUB-43/make-manual-edits-preserve-trust-and-history) | 01 | Make manual edits preserve trust and history | SUB-42 | SUB-44 |
| [SUB-44](https://linear.app/lets-play-match/issue/SUB-44/add-trial-and-auto-renewal-facts-to-manual-entry-and-reads) | 02 | Add trial and auto-renewal facts to manual entry and reads | SUB-43 | SUB-47 |
| [SUB-47](https://linear.app/lets-play-match/issue/SUB-47/save-independent-reminder-preferences) | 03 | Save independent reminder preferences | SUB-44 | SUB-45, SUB-48 |
| [SUB-45](https://linear.app/lets-play-match/issue/SUB-45/capture-the-new-facts-and-preferences-through-proposals) | 04 | Capture the new facts and preferences through proposals | SUB-47 | SUB-50 |
| [SUB-48](https://linear.app/lets-play-match/issue/SUB-48/show-expected-renewals-and-remove-routine-confirmation-work) | 05 | Show expected renewals and remove routine confirmation work | SUB-47 | SUB-46, SUB-49 |
| [SUB-49](https://linear.app/lets-play-match/issue/SUB-49/deliver-expiring-reminder-notifications-in-inbox) | 06 | Deliver expiring reminder notifications in Inbox | SUB-48 | SUB-50 |
| [SUB-46](https://linear.app/lets-play-match/issue/SUB-46/explain-spend-coverage-and-separate-trials-from-paid-commitments) | 07 | Explain spend coverage and separate trials from paid commitments | SUB-48 | SUB-50 |
| [SUB-50](https://linear.app/lets-play-match/issue/SUB-50/prove-onboarding-and-recovery-with-representative-scenarios) | 08 | Prove onboarding and recovery with representative scenarios | SUB-45, SUB-46, SUB-49 | SUB-51 |
| [SUB-51](https://linear.app/lets-play-match/issue/SUB-51/complete-real-onboarding-and-human-stage-one-sign-off) | 09 | Complete real onboarding and human stage-one sign-off | SUB-50 | — |

## Out of scope for the project

Production sign-in, external notification channels, schedulers, persisted notification cards, dismissal, payment recording, automatic trial-to-paid conversion, paid-trial / delayed-first-payment models, onboarding wizards, bank/email ingest.
