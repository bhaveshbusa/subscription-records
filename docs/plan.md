# Product

The app on `main` is a personal subscription inventory. It records what you **hold**, what it **costs**, and when the **next payment is due**. It does not record payments.

The **definition of correct** is the contract in [AGENTS.md](../AGENTS.md) and [product.md](product.md). Stage One has landed in full; the agreed next phase is **Subscription Workspace UX** — its contract is [subscription-workspace-ux-plan.md](subscription-workspace-ux-plan.md) with journeys in [subscription-workspace-ux-acceptance-journeys.md](subscription-workspace-ux-acceptance-journeys.md), and it is not implemented yet. One issue → one PR; do not implement a forthcoming row in a different issue.

| You can | Surfaces |
|---|---|
| List, search, filter, open detail | `/ledger`, `/ledger/[id]`, `GET /api/subscriptions*` |
| Add or edit a stub without filling every field | `/ledger/new`, `/ledger/[id]/edit` |
| Capture text, lists, files, voice → pending proposals | `/inbox` |
| Accept, reject, overdue actions | `/inbox` |

How it is wired: [architecture.md](architecture.md). How to verify a change: [testing-and-signoff.md](testing-and-signoff.md). Work queue: [Subscription Workspace UX in Linear](https://linear.app/lets-play-match/project/subscription-workspace-ux-6fb87b2cf4de/overview) (Stage One is complete history).

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

Those invariants still hold. Stage one **added** expected-date projections,
trial/auto-renewal facts, reminder preferences, and Inbox notifications
computed on read. It did not bring back jobs, dismissable stored cards, or
silent confirmation.

## Landed: stage one

[Stage One](https://linear.app/lets-play-match/project/stage-one-e9ded9c215f5/overview) is complete — every issue (SUB-42–SUB-53, epics SUB-39–SUB-41) is Done. The record lives in [stage-one-implementation-plan.md](stage-one-implementation-plan.md) (the approved D1–D6 register and issue sequence) and [stage-one-acceptance-scenarios.md](stage-one-acceptance-scenarios.md) (the human checks that were run). Approved wording is now simply the contract in [AGENTS.md](../AGENTS.md) and [product.md](product.md).

Bhavesh uses the existing login. He may clear records before a run. Production sign-in, external notifications, a scheduler, payment recording, and automatic trial conversion remain excluded.

## Current project: Subscription Workspace UX

[Subscription Workspace UX](https://linear.app/lets-play-match/project/subscription-workspace-ux-6fb87b2cf4de/overview) is the active queue. [SUB-57](https://linear.app/lets-play-match/issue/SUB-57/publish-the-agreed-subscription-workspace-ux-contract) published the agreed contract (docs only); implementation is SUB-52–SUB-63 across four milestones — reliable capture and correct identity; easy review and completion; one contextual workspace; real-use validation. The full contract, dependency map and agreed Active/Trial rules live in [subscription-workspace-ux-plan.md](subscription-workspace-ux-plan.md), and the human journeys in [subscription-workspace-ux-acceptance-journeys.md](subscription-workspace-ux-acceptance-journeys.md).

Agreed at a glance (each lands in its linked issue):

- New subscriptions default to **Active**; explicit current-trial input means **Trial**; missing price/date is never unknown status. Accepting a card establishes the displayed status only (SUB-60).
- Field confirmation is exact — one value at a time; first-fill is completion, not a terms change (SUB-58, SUB-59).
- Holding identity is the stable holding ID; provider/account are evidence, ambiguity asks, nothing silently overwrites or merges (SUB-52, SUB-56).
- A persistent conversation with an explicit target, all questions reachable, and one shared Work/Subscriptions shell (SUB-55, SUB-61, SUB-62).

## Out of scope

New Linear issues only: production magic-link auth, email ingest, bank CSV, PWA share-target, native camera, encryption extras, multi-currency FX, teams, external notification channels, schedulers.

Do not implement those as “while I’m here” work. One issue → one PR.
