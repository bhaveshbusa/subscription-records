# Shipped product

**Phase 1 is complete** (Linear SUB-1–20). The app on `main` is a personal subscription inventory: you can see and search your ledger, add incomplete stubs, capture from chat / screenshot / PDF / voice as **proposals**, accept lifecycle changes without duplicates, and run lapse and reminder scans that do not silently rewrite money or dates.

| You can | Surfaces |
|---|---|
| List, search, filter, open detail | `/ledger`, `/ledger/[id]`, `GET /api/subscriptions*` |
| Add or edit a stub without filling every field | `/ledger/new`, `/ledger/[id]/edit` |
| Capture text, lists, files, voice → pending proposals | `/chat` |
| Accept, reject, reminders, manual scans | `/inbox` |
| Nightly lapse and renewal nudges | Inngest, or `POST /api/jobs/*` |

How it is wired: [architecture.md](architecture.md). How to verify a change: [testing-and-signoff.md](testing-and-signoff.md).

## Not scheduled

New Linear issues only: production magic-link auth, email ingest, bank CSV, PWA share-target, native camera, encryption extras, multi-currency FX, teams.

Do not implement those as “while I’m here” work. One issue → one PR.
