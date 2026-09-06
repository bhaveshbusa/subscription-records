# Product

The app on `main` is a personal subscription inventory. It records what you **hold**, what it **costs**, and when the **next payment is due**. It does not record payments.

| You can | Surfaces |
|---|---|
| List, search, filter, open detail | `/ledger`, `/ledger/[id]`, `GET /api/subscriptions*` |
| Add or edit a stub without filling every field | `/ledger/new`, `/ledger/[id]/edit` |
| Capture text, lists, files, voice → pending proposals | `/chat` |
| Accept, reject, reminders, manual scans | `/inbox` |
| Nightly lapse and renewal nudges | Inngest, or `POST /api/jobs/*` |

How it is wired: [architecture.md](architecture.md). How to verify a change: [testing-and-signoff.md](testing-and-signoff.md).

## Scheduled: the Inbox workbench

SUB-30 rewrote the product contract (`AGENTS.md`, this file, and the other
`docs/*.md`) so the product is described as two places: `/ledger` (inventory)
and `/inbox` (the workbench — capture plus everything still open: pending
proposals, overdue holdings, unfinished rows, renewing soon). It changed no
code.

Child issues, filed and picked up one at a time per the usual loop in
[coordination.md](coordination.md), still need to:

- Add the two overdue actions (**still have it**, **cancelled**) to the Inbox
  section that now lists those rows
- Drop the `reminders` table, its dismiss endpoint, and the nightly scan
- Fold `/chat` into `/inbox` (capture stays, the still-holding chat greeting
  goes, `/chat` redirects)
- Drop the `lapsed` status

Landed so far: the nightly roll of `next_renewal` is gone, and Inbox is four
projected sections with the ledger back to plain inventory — no "Needs
attention" chip, filter, or count.

Until those land, the running app still behaves as described in the "code
still has" notes throughout `docs/`.

## Out of scope

New Linear issues only: production magic-link auth, email ingest, bank CSV, PWA share-target, native camera, encryption extras, multi-currency FX, teams.

Do not implement those as “while I’m here” work. One issue → one PR.
