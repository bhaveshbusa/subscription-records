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

## Out of scope

New Linear issues only: production magic-link auth, email ingest, bank CSV, PWA share-target, native camera, encryption extras, multi-currency FX, teams.

Do not implement those as “while I’m here” work. One issue → one PR.
