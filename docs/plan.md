# Product

The app on `main` is a personal subscription inventory. It records what you **hold**, what it **costs**, and when the **next payment is due**. It does not record payments.

| You can | Surfaces |
|---|---|
| List, search, filter, open detail | `/ledger`, `/ledger/[id]`, `GET /api/subscriptions*` |
| Add or edit a stub without filling every field | `/ledger/new`, `/ledger/[id]/edit` |
| Capture text, lists, files, voice → pending proposals | `/inbox` |
| Accept, reject, overdue actions | `/inbox` |

How it is wired: [architecture.md](architecture.md). How to verify a change: [testing-and-signoff.md](testing-and-signoff.md).

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

## Out of scope

New Linear issues only: production magic-link auth, email ingest, bank CSV, PWA share-target, native camera, encryption extras, multi-currency FX, teams.

Do not implement those as “while I’m here” work. One issue → one PR.
