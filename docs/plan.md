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

## Scheduled: holdings ledger ([SUB-21](https://linear.app/lets-play-match/issue/SUB-21/holdings-ledger-not-a-payment-recorder))

Phase 1 also recorded **payments**. The job is now a recording job: messy input becomes a ledger you would trust over time, including incomplete rows. Record what the user **holds**, what it **costs**, then when the **next payment is due**. Do not record payments.

**Cursor** implements this epic (Agent in the IDE → PR → human sign-off). Do not assign or run Devin on these issues.

| Issue | What |
|---|---|
| [SUB-22](https://linear.app/lets-play-match/issue/SUB-22/rewrite-product-contract-holdings-not-payments) | Rewrite product/docs/`AGENTS.md`. No app code. |
| [SUB-23](https://linear.app/lets-play-match/issue/SUB-23/receipts-update-terms-not-charges) | Stop `charged` proposals. Receipts update holding/cost/schedule. |
| [SUB-24](https://linear.app/lets-play-match/issue/SUB-24/late-news-backdated-cancel-and-stale-is-not-lapsed) | Backdated cancel. Stale due date is not a lapse. Roll `next_renewal`. |
| [SUB-25](https://linear.app/lets-play-match/issue/SUB-25/ledger-surfaces-and-catch-up) | Ledger shows inventory, not charges. Catch-up question on return. |
| [SUB-26](https://linear.app/lets-play-match/issue/SUB-26/drop-the-charges-table) | Drop the `charges` table. Keep `charged` enum values. |

Do not start a child until its blockers are **Done**.

## Not scheduled

New Linear issues only: production magic-link auth, email ingest, bank CSV, PWA share-target, native camera, encryption extras, multi-currency FX, teams.

Do not implement those as “while I’m here” work. One issue → one PR.
