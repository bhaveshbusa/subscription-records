# Product

Personal subscription-recording assistant. Web-cloud. One account, many devices.

## Objective

Convert messy, multi-modal, incomplete input into a ledger you would trust **over time**, including incomplete rows.

The job is to record, in this order:

1. What subscriptions the user is **holding**
2. What they **cost** (amount + cadence)
3. When the **next payment is due**

It does **not** record payments. A receipt or “I paid” is evidence of holding, cost, and next due — not a transaction to store.

Design for ambiguity: “I subscribed to Notion” and a pasted list of twelve services are both valid captures.

Users will not keep this updated regularly. They may come back after six months and say they cancelled a subscription three months ago. That is the normal path, not an edge case.

## Holdings, not payments

The ledger is inventory (holding + cost + next due), not a payment recorder.

- Match before create. A mention of a service already in the ledger updates that row. It is not a new subscription.
- A receipt or “I paid” updates holding, cost, and next due. It does not write a payment. (Code still writes `charges` / `charged` proposals until [SUB-23](https://linear.app/lets-play-match/issue/SUB-23/receipts-update-terms-not-charges).)
- Capture still writes **pending proposals** only. Nothing reaches the ledger until accept.
- Do not infer `cancelled` or `lapsed` from silence or from a date passing. A `next_renewal` that has passed is a **stale schedule**, not a lifecycle change. Later issues roll it and flag needs-attention.
- `lapsed` is only for when the **user** says it expired / the card failed / it was not renewed.
- A past date the user states is the event date. Do not snap cancel to today. Relative past dates (“three months ago”) are valid cancel timing.
- Incomplete rows are done enough. Do not block saving on complete money fields.
- Do not auto-confirm `amount`, `cadence`, or `next_renewal`. Do not overwrite confirmed money/date fields (write `terms_changed` or mark `conflicted`). Do not delete subscription identity on cancel.

## AI in three layers

1. **Input interpretation** — OCR, speech-to-text, LLM extraction of subscription candidates + evidence.
2. **Record reasoning** — normalize providers, duplicates, infer cadence, field-level confidence, lifecycle classification (`terms_changed`, `cancelled`, `reactivated`, …). A receipt is not a payment to classify.
3. **Conversational completion** — one useful follow-up, remember deferred answers, explain why a field is missing.

The AI proposes. The user is the final authority for **cost**, **billing schedule**, and **renewal dates**.

## Surfaces

| Route | Purpose |
|---|---|
| `/ledger` | List, filter, search, summary |
| `/ledger/[id]` | Detail: current terms, field status, timeline |
| `/ledger/new`, `/ledger/[id]/edit` | Manual add and edit (no AI) |
| `/chat` | Capture (text, list, screenshot, PDF, voice) + proposal cards |
| `/inbox` | Pending proposals, reminders, optional job triggers |
| `/login` | Seed credentials in development and Preview; magic-link stub in Production |

## Success metrics (personal)

- Time from “new sub” to a visible ledger row (even incomplete)
- Questions asked per capture (target: ≤1 in that session)
- Share of spend that is `confirmed` vs `inferred`
- You would rather use this than Notes/a spreadsheet

## Out of scope until a later Linear epic

Bank sync, Gmail ingest, teams/orgs, public pricing crawl, mobile native apps, growth/onboarding experiments, production magic-link email delivery.
