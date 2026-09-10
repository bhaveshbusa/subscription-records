# Product

Personal subscription-recording assistant. Web-cloud. One account, many devices.

The contract in this file and [AGENTS.md](../AGENTS.md) is the definition of correct. Stage One has landed: the rules below marked with SUB-4x/SUB-5x links describe `main`. The **Subscription Workspace UX** phase is agreed but not yet shipped — its rules are marked *(agreed — SUB-nn)* and the full contract is [subscription-workspace-ux-plan.md](subscription-workspace-ux-plan.md) with journeys in [subscription-workspace-ux-acceptance-journeys.md](subscription-workspace-ux-acceptance-journeys.md). Do not implement forthcoming behavior in a different issue.

## Objective

Convert messy, multi-modal, incomplete input into a ledger you would trust **over time**, including incomplete rows.

The job is to record, in this order:

1. What subscriptions the user is **holding**
2. What they **cost** (amount + cadence)
3. When the **next payment is due**

It does **not** record payments. A receipt or “I paid” is evidence of holding, cost, and next due — not a transaction to store.

Design for ambiguity: “I subscribed to Notion” and a pasted list of twelve services are both valid captures.

Users will not keep this updated regularly. They may come back after six months and say they cancelled a subscription three months ago. That is the normal path, not an edge case.

Evaluation is for Bhavesh, using the **existing login**. He may clear records before an onboarding cycle. Production sign-in and external notification channels are out of scope.

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
- The stable holding ID is the identity *(agreed — [SUB-52](https://linear.app/lets-play-match/issue/SUB-52/decide-the-holding-identity-rule-for-capture))*. Provider and account are matching evidence; plan is an editable property. No provider or provider+account uniqueness constraint. Ambiguity asks; a different or previously unseen account never silently overwrites, and a repeated pending input reuses the same draft while preserving evidence. Acceptance rechecks identity and revision transactionally, and question identity is scoped to the holding or draft.
- Incomplete rows are done enough. Do not block saving on complete money fields.
- Do not auto-confirm `amount`, `cadence`, `next_renewal`, trial end, or auto-renewal. Do not overwrite confirmed money/date fields (write `terms_changed` or mark `conflicted`). Do not delete subscription identity on cancel.
- Cadence never confirms auto-renewal. Auto-renewal is yes, no, or unknown, established from the user or evidence.

## Stored date versus expected date

Keep the stored `next_renewal` and its original trust. List and detail must still expose that recorded value. A confirmed past date stays that past date, still confirmed.

**Do not substitute a projected future date for the stored one.** That is the revised form of the old ban: the stored fact is inviolable; a separate expected date may sit beside it.

An **active** subscription with **confirmed** auto-renewal = yes, **confirmed** cadence, and **confirmed** recorded date also exposes `expectedNextRenewal`, labelled inferred/expected. Example: stored `next_renewal` 31 January 2026 monthly, today 10 April 2026 → recorded date remains 2026-01-31 confirmed; expected next is 2026-04-30 inferred/expected. Occurrences come from the original anchor (31 January → 28 February → 31 March), not from stepping 31 January → 28 February → 28 March.

A confirmed auto-renewing active holding does not enter Overdue merely because that stored date has passed. Auto-renewal no/unknown, a passed trial end, and unusable schedules still need reconciliation. Nothing silently cancels, confirms a payment, or converts a trial to paid.

`rollNextRenewal` remains only for a user-asked still-holding roll. It must not power the expected-date projection.

## Status interpretation

*(Agreed — [SUB-60](https://linear.app/lets-play-match/issue/SUB-60/interpret-new-subscriptions-as-active-and-current-trials-as-trial). On `main` today, an accepted capture without status evidence lands `unknown`.)*

This is subscription record management, not a collection of services to explore: adding a subscription supplies holding context. New subscriptions default to **Active** unless the input indicates trial, pause, cancellation or another state. `unknown` is for genuinely ambiguous or contradictory input — a missing price or date is never unknown status.

| Input | Interpretation for acceptance |
|---|---|
| “ChatGPT subscription is £10 per month” | Active, with price/cadence independently reviewable |
| A pasted list of subscription names | Active for each new subscription |
| “These are my trial subscriptions…” | Trial, even when trial ends are unknown |
| “My ChatGPT subscription trial ends on 10 October; after that it is £12.99 per month”, stated before 10 October | Current Trial; the monthly price is after trial |

Interpret fresh current-trial statements using tense and date context — do not ask the user to repeat that they are on a trial. The proposal card displays an editable status; accepting establishes that displayed status without a second status question. Status acceptance confirms **status only**: amount, cadence, `next_renewal`, trial end, and auto-renewal keep their separate confirmation scope.

Existing records retain context. A price-only update does not reset a `trial` or `cancelled` record to `active`; a fresh statement supporting a change proposes it through the existing conflict/lifecycle rules. A trial-end field already stored on a record is weaker evidence than a fresh current-trial statement — never infer current status from it alone or bulk-reclassify legacy rows. A direct **Set active** action on a genuinely unresolved record changes status only; do not reuse **Still have it**, which can also roll the recorded renewal date.

## Trials

Trials are free. Paid service starts at trial end **if the user continues**. There is no separate paid-trial period and no delayed first-payment date.

- Trial end ≠ subscription end. Capture and store trial end even when the paid price is unknown.
- Amount/currency/cadence on a trial row are the paid plan after trial, labelled “after trial”. No separate trial-price or future-price fields. Entering or changing those fields on a trial is an ordinary write — not a correction versus an actual terms change.
- Exclude trial rows from current paid-commitment totals. A missing paid-plan price stays unknown. Never store a confirmed £0 because the trial is free.
- Trial end passing is a question, not automatic conversion. Time passing never turns `trial` into `active`. Keep the same identity when the user reports the paid subscription began — a lifecycle change goes through the shared writers with user-specified timing.
- The agreed first-fill rule (below, under Manual changes) applies to a trial's after-trial terms as well.
- Inputs that describe a paid trial or a first payment later than trial end are outside this model: surface that limitation rather than rewriting the terms.

Landed in [SUB-44](https://linear.app/lets-play-match/issue/SUB-44/add-trial-and-auto-renewal-facts-to-manual-entry-and-reads) (manual entry and reads) and [SUB-46](https://linear.app/lets-play-match/issue/SUB-46/explain-spend-coverage-and-separate-trials-from-paid-commitments) (totals). Capture of these facts landed in [SUB-45](https://linear.app/lets-play-match/issue/SUB-45/capture-the-new-facts-and-preferences-through-proposals): extraction writes pending proposals only; accepting is the user action.

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

On `main`, Inbox **Reminders** is a projection of enabled preferences. There is no Renewing soon glance.

## Manual changes

Ordinary corrections remain possible. An actual price change is a terms-change action with user-specified effective timing; prior terms stay in history.

Notes-only edits must not reconfirm untouched money or dates. Reopening a form is not confirmation. An explicit confirm action can confirm an unchanged value. An actual price change is a terms-change action with user-specified effective timing; prior terms stay in history. Corrections and terms changes are distinguishable.

### Precise field review *(agreed — [SUB-58](https://linear.app/lets-play-match/issue/SUB-58/add-missing-subscription-terms-without-a-terms-change-question), [SUB-59](https://linear.app/lets-play-match/issue/SUB-59/confirm-and-edit-individual-fields-directly-on-proposals-and-records))*

- Confirming one value means exactly that value. An amount-only control must not fill confirmation flags for unrelated dates, cadence or auto-renewal.
- Editing controls are prefilled with current values; opening or saving an unchanged form is not confirmation.
- Multi-field confirmation shows a reviewable field selection. **Accept** stays distinct from confirming extracted terms; labels keep the status/terms difference clear.
- Provider/plan/account correction, or choosing an existing holding, retargets or recomputes the draft without confirming money or dates.
- **First-fill versus change.** Filling an empty amount/cadence/plan is ordinary completion — no correction-versus-terms-change interrogation. Replacing a known term shows old → new and asks whether it is a correction or an actual change; an actual change needs the user's effective date. The explicit change action remains available even when old terms were never recorded.
- A mixed edit can complete one field and change another; unrelated history and trust are preserved. Trial after-trial terms keep the ordinary-edit rule.

Manual cancel and reactivate use the same lifecycle effects as accepted proposals. The overdue **Cancelled** shortcut must review the actual end date rather than silently assigning the stored renewal date. If the user does not know when it ended, leave it unresolved and allow notes. [SUB-48](https://linear.app/lets-play-match/issue/SUB-48/show-expected-renewals-and-remove-routine-confirmation-work)

The edit form sends only intended fields. Overdue Inbox cancel reviews the actual end date; if timing is unknown, leave it unresolved and allow notes.

## Spend coverage

The summary names a **recorded GBP paid-commitment monthly equivalent**. That is not actual payments and not a complete budget. [SUB-46](https://linear.app/lets-play-match/issue/SUB-46/explain-spend-coverage-and-separate-trials-from-paid-commitments)

- Separate confirmed vs unconfirmed calculable contributions. Confirmed coverage needs confirmed amount **and** confirmed cadence, on a settled holding (not `unknown`, not conflicted money/schedule).
- Missing price or cadence, and non-GBP rows, are omissions — not zero. No FX conversion.
- Trial rows are excluded from the current paid total. Their stated paid-plan prices appear separately as “after trial”.

## The workspace *(agreed — [SUB-55](https://linear.app/lets-play-match/issue/SUB-55/open-capture-questions-are-recorded-but-never-surfaced-again), [SUB-61](https://linear.app/lets-play-match/issue/SUB-61/keep-a-persistent-conversation-linked-to-the-selected-subscription-or), [SUB-62](https://linear.app/lets-play-match/issue/SUB-62/bring-work-and-subscriptions-into-one-responsive-workspace))*

The agreed destination is one shared shell with two views. **Work** covers what Inbox covers today — pending proposals, open and deferred questions, reconciliation, and preference-driven reminders. **Subscriptions** remains browsable inventory without attention chips and opens on All; status filters remain.

- One composer for text, lists, screenshots/PDFs and voice, with a visible explicit target: **All subscriptions**, **About a selected subscription**, or **Replying to a particular question**.
- The conversation is persistent with explicit target IDs: “£12 monthly” belongs to the selected price question, not the most recently asked question globally. Every open question stays reachable — one useful next question is prominent, deferral never deletes — and a record or draft panel sits beside the conversation on desktop while a full-width record view on mobile preserves the conversation and unsent draft.
- The same review and field controls are reused across the current pages and the future shell; the current interactions are improved before the shell lands.
- Reminders keep their no-dismiss, computed-on-read semantics.

## AI in three layers

1. **Input interpretation** — OCR, speech-to-text, LLM extraction of subscription candidates + evidence.
2. **Record reasoning** — normalize providers, duplicates, infer cadence, field-level confidence, lifecycle classification (`terms_changed`, `cancelled`, `reactivated`, …). A receipt is not a payment to classify.
3. **Conversational completion** — one useful next question shown prominently while every open question stays reachable; remember deferred answers, explain why a field is missing. *(The “one follow-up per capture turn” ceiling describes `main`; the persistent workspace conversation is agreed — SUB-61.)*

The AI proposes. The user is the final authority for **cost**, **billing schedule**, **renewal dates**, **auto-renewal**, and **reminder consent**.

## Surfaces

| Route | Purpose |
|---|---|
| `/ledger` | List, filter, search, summary |
| `/ledger/[id]` | Detail: current terms, field status, timeline |
| `/ledger/new`, `/ledger/[id]/edit` | Manual add and edit (no AI) |
| `/inbox` | The workbench: capture (text, list, screenshot, PDF, voice) plus everything still open — pending proposals (accept/reject), overdue holdings that still need reconciliation, unfinished rows, and preference-driven Reminders |
| `/chat` | Redirects to `/inbox`. Capture lives beside the proposals it raises; there is no second door to the same cards |
| `/login` | Seed credentials in development and Preview; magic-link stub in Production |

The agreed workspace ([SUB-62](https://linear.app/lets-play-match/issue/SUB-62/bring-work-and-subscriptions-into-one-responsive-workspace)) folds these routes into one shell: **Work** is what `/inbox` is today, **Subscriptions** is what `/ledger` is today. Until it ships, the routes above are the product.

## Success metrics (personal)

- Time from “new sub” to a visible ledger row (even incomplete)
- Questions asked per capture (target: ≤1 in that session)
- Share of spend that is `confirmed` vs `inferred`
- You would rather use this than Notes/a spreadsheet

## Out of scope

Bank sync, Gmail ingest, teams/orgs, public pricing crawl, mobile native apps, growth/onboarding experiments, production magic-link email delivery, external notification channels, schedulers, payment recording, automatic trial-to-paid conversion, paid-trial / delayed-first-payment models.
