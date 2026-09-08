# Product

Personal subscription-recording assistant. Web-cloud. One account, many devices.

The **stage-one contract** in this file and [AGENTS.md](../AGENTS.md) is the definition of correct. Code on `main` still matches the earlier Inbox-workbench product until the linked Linear issues ship. Do not implement forthcoming behavior in a different issue.

## Objective

Convert messy, multi-modal, incomplete input into a ledger you would trust **over time**, including incomplete rows.

The job is to record, in this order:

1. What subscriptions the user is **holding**
2. What they **cost** (amount + cadence)
3. When the **next payment is due**

It does **not** record payments. A receipt or “I paid” is evidence of holding, cost, and next due — not a transaction to store.

Design for ambiguity: “I subscribed to Notion” and a pasted list of twelve services are both valid captures.

Users will not keep this updated regularly. They may come back after six months and say they cancelled a subscription three months ago. That is the normal path, not an edge case.

Stage one is for Bhavesh, using the **existing login**. He may clear records before an onboarding cycle. Production sign-in and external notification channels are out of scope.

## Four distinct meanings

Do not collapse these into one field or one Inbox action:

| Kind | What it is | Written to the ledger? |
|---|---|---|
| Recorded fact | Stored amount, cadence, `next_renewal`, trial end, auto-renewal, with trust | Yes, with `proposed` / `inferred` / `confirmed` |
| Expected schedule | Next occurrence computed on read from confirmed auto-renewal and confirmed schedule inputs | **Never.** Label inferred/expected |
| Reminder preference | Whether and when the user wants Inbox attention before renewal or trial end | Preference row only. Not a notification card |
| Actual lifecycle change | Cancel, reactivate, terms change with user-specified timing | Yes, through the shared writers |

## Holdings, not payments

The ledger is inventory (holding + cost + next due), not a payment recorder.

- Match before create. A mention of a service already in the ledger updates that row. It is not a new subscription.
- A receipt or “I paid” updates holding, cost, and next due. It does not write a payment.
- Capture still writes **pending proposals** only. Nothing reaches the ledger until accept.
- Do not infer `cancelled` from silence or from a date passing. There is no `lapsed` status. User-stated expiry, a failed card, or “not renewed” is `cancelled`.
- A past date the user states is the event date. Do not snap cancel to today. Relative past dates (“three months ago”) are valid cancel timing.
- Incomplete rows are done enough. Do not block saving on complete money fields.
- Do not auto-confirm `amount`, `cadence`, `next_renewal`, trial end, or auto-renewal. Do not overwrite confirmed money/date fields (write `terms_changed` or mark `conflicted`). Do not delete subscription identity on cancel.
- Cadence never confirms auto-renewal. Auto-renewal is yes, no, or unknown, established from the user or evidence.

## Stored date versus expected date

Keep the stored `next_renewal` and its original trust. List and detail must still expose that recorded value. A confirmed past date stays that past date, still confirmed.

**Do not substitute a projected future date for the stored one.** That is the revised form of the old ban: the stored fact is inviolable; a separate expected date may sit beside it.

After [SUB-48](https://linear.app/lets-play-match/issue/SUB-48/show-expected-renewals-and-remove-routine-confirmation-work), an **active** subscription with **confirmed** auto-renewal = yes, **confirmed** cadence, and **confirmed** recorded date also exposes `expectedNextRenewal`, labelled inferred/expected. Example: stored `next_renewal` 31 January 2026 monthly, today 10 April 2026 → recorded date remains 2026-01-31 confirmed; expected next is 2026-04-30 inferred/expected. Occurrences come from the original anchor (31 January → 28 February → 31 March), not from stepping 31 January → 28 February → 28 March.

Until SUB-48 ships, `main` shows only the stored date. A holding with a past stored date is **overdue** in Inbox. After SUB-48, a confirmed auto-renewing active holding does not enter Overdue merely because that stored date has passed. Auto-renewal no/unknown, a passed trial end, and unusable schedules still need reconciliation. Nothing silently cancels, confirms a payment, or converts a trial to paid.

`rollNextRenewal` remains only for a user-asked still-holding roll. It must not power the expected-date projection.

## Trials

Stage-one trials are free. Paid service starts at trial end **if the user continues**. There is no separate paid-trial period and no delayed first-payment date.

- Trial end ≠ subscription end. Capture and store trial end even when the paid price is unknown.
- Amount/currency/cadence on a trial row are the paid plan after trial, labelled “after trial”. No separate trial-price or future-price fields.
- Exclude trial rows from current paid-commitment totals. A missing paid-plan price stays unknown. Never store a confirmed £0 because the trial is free.
- Trial end passing is a question, not automatic conversion. Keep the same identity when the user reports the paid subscription began.
- Inputs that describe a paid trial or a first payment later than trial end are outside this model: surface that limitation rather than rewriting the terms.

Lands in [SUB-44](https://linear.app/lets-play-match/issue/SUB-44/add-trial-and-auto-renewal-facts-to-manual-entry-and-reads) (manual entry and reads) and [SUB-46](https://linear.app/lets-play-match/issue/SUB-46/explain-spend-coverage-and-separate-trials-from-paid-commitments) (totals). Capture of these facts is [SUB-45](https://linear.app/lets-play-match/issue/SUB-45/capture-the-new-facts-and-preferences-through-proposals). The summary still includes trial GBP amounts until SUB-46.

## Reminders

A reminder is a preference, not a fact about the provider. Auto-renewal does not imply a reminder, and a reminder does not confirm auto-renewal.

| Cadence | Suggested renewal reminder | Auto-renewal |
|---|---|---|
| Weekly | Off | From the user or evidence; otherwise unknown |
| Monthly | Off | From the user or evidence; otherwise unknown |
| Yearly | One calendar month before renewal | From the user or evidence; otherwise unknown |

Trial reminders target trial end and suggest **three calendar days** before. They do not inherit “off” from a monthly paid plan.

Suggestions need a user action. Unset ≠ off. Do not backfill migrated rows. Do not overwrite a choice when cadence changes. Missing cadence or date does not block saving; unknown targets produce no dated Inbox card.

After [SUB-47](https://linear.app/lets-play-match/issue/SUB-47/save-independent-reminder-preferences) and [SUB-49](https://linear.app/lets-play-match/issue/SUB-49/deliver-expiring-reminder-notifications-in-inbox):

- An enabled card is visible from its reminder date through the due date, inclusive. Example: due 15 October, one-month lead → absent 14 September, visible 15 September through 15 October, absent 16 October.
- Calendar-month subtraction with month-end clamping (due 31 March minus one month → 28 or 29 February). Store lead value and unit, not 30 days.
- UTC calendar dates: `YYYY-MM-DD` from `now.toISOString().slice(0, 10)`.
- No dismiss, clear, snooze, or mark-read. Opening Inbox does not clear a card. Expiry writes no ledger row.
- Inbox **Reminders** replaces **Renewing soon**. General upcoming dates remain on the ledger.
- No scheduler, notification store, or external send.

On `main`, Inbox still has the cadence-window Renewing soon glance and no preference table.

## Manual changes

Ordinary corrections remain possible. An actual price change is a terms-change action with user-specified effective timing; prior terms stay in history.

Notes-only edits must not reconfirm untouched money or dates. Reopening a form is not confirmation. An explicit confirm action can confirm an unchanged value. An actual price change is a terms-change action with user-specified effective timing; prior terms stay in history. Corrections and terms changes are distinguishable.

Manual cancel and reactivate use the same lifecycle effects as accepted proposals. The overdue **Cancelled** shortcut must review the actual end date rather than silently assigning the stored renewal date. If the user does not know when it ended, leave it unresolved and allow notes. [SUB-48](https://linear.app/lets-play-match/issue/SUB-48/show-expected-renewals-and-remove-routine-confirmation-work)

The edit form sends only intended fields. Overdue Inbox cancel still dates `ends_on` at the stored past `next_renewal` until SUB-48.

## Spend coverage

After [SUB-46](https://linear.app/lets-play-match/issue/SUB-46/explain-spend-coverage-and-separate-trials-from-paid-commitments) the summary names a **recorded GBP paid-commitment monthly equivalent**. That is not actual payments and not a complete budget.

- Separate confirmed vs unconfirmed calculable contributions. Confirmed coverage needs confirmed amount **and** confirmed cadence, on a settled holding (not `unknown`, not conflicted money/schedule).
- Missing price or cadence, and non-GBP rows, are omissions — not zero. No FX conversion.
- Trial rows are excluded from the current paid total. Their stated paid-plan prices appear separately as “after trial”.

On `main`, the summary sums GBP `active`, `trial`, and `cancel_scheduled` without trust or omission reporting.

## AI in three layers

1. **Input interpretation** — OCR, speech-to-text, LLM extraction of subscription candidates + evidence.
2. **Record reasoning** — normalize providers, duplicates, infer cadence, field-level confidence, lifecycle classification (`terms_changed`, `cancelled`, `reactivated`, …). A receipt is not a payment to classify.
3. **Conversational completion** — one useful follow-up, remember deferred answers, explain why a field is missing.

The AI proposes. The user is the final authority for **cost**, **billing schedule**, **renewal dates**, **auto-renewal**, and **reminder consent**.

## Surfaces

| Route | Purpose |
|---|---|
| `/ledger` | List, filter, search, summary |
| `/ledger/[id]` | Detail: current terms, field status, timeline |
| `/ledger/new`, `/ledger/[id]/edit` | Manual add and edit (no AI) |
| `/inbox` | The workbench: capture (text, list, screenshot, PDF, voice) plus everything still open — pending proposals (accept/reject), overdue holdings that still need reconciliation, unfinished rows, and (on `main`) a renewing-soon glance, replaced by preference-driven Reminders in SUB-49 |
| `/chat` | Redirects to `/inbox`. Capture lives beside the proposals it raises; there is no second door to the same cards |
| `/login` | Seed credentials in development and Preview; magic-link stub in Production |

## Success metrics (personal)

- Time from “new sub” to a visible ledger row (even incomplete)
- Questions asked per capture (target: ≤1 in that session)
- Share of spend that is `confirmed` vs `inferred`
- You would rather use this than Notes/a spreadsheet

## Out of scope

Bank sync, Gmail ingest, teams/orgs, public pricing crawl, mobile native apps, growth/onboarding experiments, production magic-link email delivery, external notification channels, schedulers, payment recording, automatic trial-to-paid conversion, paid-trial / delayed-first-payment models.
