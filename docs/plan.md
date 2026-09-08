# Product

The app on `main` is a personal subscription inventory. It records what you **hold**, what it **costs**, and when the **next payment is due**. It does not record payments.

The **definition of correct** is now the stage-one contract in [AGENTS.md](../AGENTS.md) and [product.md](product.md). `main` still runs the Inbox-workbench product below until the linked issues ship. One issue → one PR; do not implement a forthcoming row in a different issue.

| You can | Surfaces |
|---|---|
| List, search, filter, open detail | `/ledger`, `/ledger/[id]`, `GET /api/subscriptions*` |
| Add or edit a stub without filling every field | `/ledger/new`, `/ledger/[id]/edit` |
| Capture text, lists, files, voice → pending proposals | `/inbox` |
| Accept, reject, overdue actions | `/inbox` |

How it is wired: [architecture.md](architecture.md). How to verify a change: [testing-and-signoff.md](testing-and-signoff.md). Issue map: [stage-one-linear-backlog.md](stage-one-linear-backlog.md).

## Shipped: the Inbox workbench

The product is two places. `/ledger` is inventory — what you hold, what it
costs, when it is next due. `/inbox` is the workbench — capture, plus
everything still open.

SUB-30 wrote that contract into `AGENTS.md`, this file and the other
`docs/*.md` without touching code. SUB-31 to SUB-36 made the code match, one
issue per PR:

| Issue | What changed |
|---|---|
| SUB-31 | No job or projection rolls a passed `next_renewal`; list and detail return the **stored** date |
| SUB-32 | Inbox became four projected sections; the ledger lost its Needs attention chip, filter and count |
| SUB-33 | Overdue rows carry **still have it** and **cancelled** — now the only things that move a stored due date — and capture stopped greeting anyone with a still-holding question |
| SUB-34 | The capture composer moved onto `/inbox`; `/chat` redirects there and the transcript is gone |
| SUB-35 | The `reminders` table, both scans and Inngest are gone; nothing runs on a schedule |
| SUB-36 | No `lapsed` status: a subscription that stopped is `cancelled`, however it stopped |

What that adds up to: **nothing writes a money or date field unless the user
asked it to.** Every question the system used to ask unprompted — a nightly
roll, a persisted nudge, a chat-open greeting — is now a section you look at
when you choose, projected from the ledger on read and storing nothing of its
own.

Those invariants still hold. Stage one **adds** expected-date projections,
trial/auto-renewal facts, reminder preferences, and Inbox notifications
computed on read. It does not bring back jobs, dismissable stored cards, or
silent confirmation.

## Current epic: Stage one

[Stage One](https://linear.app/lets-play-match/project/stage-one-e9ded9c215f5/overview) in Linear. Tracking epics: [SUB-39](https://linear.app/lets-play-match/issue/SUB-39/stage-one-core-records-and-trust), [SUB-40](https://linear.app/lets-play-match/issue/SUB-40/stage-one-expected-renewals-and-inbox-reminders), [SUB-41](https://linear.app/lets-play-match/issue/SUB-41/stage-one-onboarding-and-recovery-validation).

Bhavesh uses the existing login. He may clear records before a run. Production sign-in, external notifications, a scheduler, payment recording, and automatic trial conversion are excluded.

Approved rules (D1–D6, 8 September 2026) live in [AGENTS.md](../AGENTS.md) and [product.md](product.md). Summary:

- Keep stored `next_renewal`; expose a separate expected date only for active confirmed auto-renewal with confirmed cadence and confirmed recorded date; never write it back.
- Original-anchor recurrence. Trial/paused/cancelled/cancel-scheduled are not ordinary recurring holdings. Trial end does not convert to paid.
- Independent reminder preferences. Weekly/monthly renewal suggests off; yearly one calendar month; trial three days. Unset ≠ off.
- Reminder window: reminder date ≤ today ≤ due date; gone the next calendar day. No dismiss. Replace Renewing soon with Reminders.
- Trials are free; paid-plan terms reuse amount/cadence labelled “after trial”; exclude trials from current paid totals.
- Corrections vs terms changes; overdue cancel reviews the actual end date.

SUB-42 (this contract) is docs-only. Implementation issues, in order: SUB-43 → SUB-44 → SUB-47 → SUB-45 → SUB-48 → SUB-49 and SUB-46 → SUB-50 → SUB-51.

## Out of scope

New Linear issues only: production magic-link auth, email ingest, bank CSV, PWA share-target, native camera, encryption extras, multi-currency FX, teams, external notification channels, schedulers.

Do not implement those as “while I’m here” work. One issue → one PR.
