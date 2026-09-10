# Agent instructions (for any implementation agent)

This file is the contract for any coding agent. Product and architecture details live in `docs/`. Do not re-litigate them in a PR.

## Where "correct" is defined

| Question | File |
|---|---|
| How to code, what never to violate | this file |
| What the product is | [docs/product.md](docs/product.md) |
| Data model | [docs/data-model.md](docs/data-model.md) |
| List, detail, query API | [docs/query-and-ledger.md](docs/query-and-ledger.md) |
| How it is wired | [docs/architecture.md](docs/architecture.md) |
| Who does what, and when | [docs/coordination.md](docs/coordination.md) |
| The agreed next UX phase | [docs/subscription-workspace-ux-plan.md](docs/subscription-workspace-ux-plan.md) + [journeys](docs/subscription-workspace-ux-acceptance-journeys.md) |
| How to run and verify it | [README.md](README.md) |

A Linear issue says *what to build this week*. These files say *what correct
means*. When an issue and these files disagree, stop and ask — do not guess
money, date, or lifecycle behavior.

## Your job

Implement **exactly one Linear issue per PR**, linked in the PR body. Stop when that issue’s acceptance criteria are met. Do not start the next issue in the same PR.

The human’s job is testing and sign-off, not writing code. Open the PR and leave the Linear issue **In Progress** — this team has no `In Review` state, and `Done` is the human's after sign-off. Do not merge to `main` yourself.

If a requirement is ambiguous, open a PR comment or Linear comment and wait. Do not guess product behavior for money, dates, or lifecycle.

## Stack (locked)

| Layer | Choice |
|---|---|
| App | Next.js (App Router) + TypeScript |
| UI | React + Tailwind CSS |
| DB | Postgres + Drizzle ORM |
| Validation | Zod |
| Auth | Auth.js (Auth.js v5) with magic-link email in production; seeded credentials in development |
| Hosting | Vercel (app) + Neon (Postgres) |
| Files | Cloudflare R2 or S3-compatible (local disk `.captures` when keys are unset) |
| Jobs | **None.** Nothing runs on a schedule; a job that writes money or dates is a second author of the ledger. Inbox reminder delivery is computed on read. |
| LLM | Anthropic Claude via **server-only** SDK; Groq Whisper for voice |

Do not add a second ORM, a second auth library, Redux, or a multi-agent framework.

## Repo conventions

- Feature branches: `sub-<linear-id>-<short-slug>` e.g. `sub-4-ledger-list`
- One issue → one PR → squash merge after **human sign-off**
- PR title: `SUB-N: <issue title>`
- PR body must include: Linear id, summary, test plan, screenshots or curl for UI/API
- Migrations are Drizzle SQL in `drizzle/` and must be reversible in spirit (additive preferred)
- `user_id` on every business table; every query filters by session user
- No LLM API keys in the client. No public object storage.

## Domain rules (never violate)

The ledger records **what the user holds, what it costs, and when the next payment is due**. It does not record payments.

Four things have distinct meanings. Do not collapse them:

1. **Recorded facts** — stored fields with trust (`proposed` / `inferred` / `confirmed`). Includes amount, cadence, `next_renewal`, trial end, and auto-renewal.
2. **Expected schedule projections** — computed on read. Labelled inferred/expected. Never written back to the ledger.
3. **Reminder preferences** — user consent to be notified. Independent of auto-renewal. Unset is not off.
4. **Actual lifecycle changes** — cancel, reactivate, and terms changes with user-specified timing. Use the shared writers.

### Money, dates, and trust

- Do not auto-confirm `amount`, `cadence`, `next_renewal`, trial end, or auto-renewal. Status for those fields is `proposed` or `inferred` until a user action sets `confirmed`. Cadence never confirms auto-renewal.
- Do not overwrite confirmed money/date fields. Write a `terms_changed` proposal or a `conflicted` field. No exception for a passed `next_renewal`.
- Incomplete rows are done enough. Do not block saving on complete money fields, missing trial end, unknown auto-renewal, or unset reminders.
- A notes-only edit must send only intended changes. Unchanged inferred/proposed amount, cadence, and date keep their values and trust. Reopening and saving a form is not confirmation. An explicit confirm action can confirm an unchanged value. [SUB-43](https://linear.app/lets-play-match/issue/SUB-43/make-manual-edits-preserve-trust-and-history)

### Stored dates versus expected dates

- Keep the **stored** `next_renewal` and its original trust. Never replace it with a projected future date in list, detail, or JSON.
- Do not roll a stored date forward in an unattended job.
- A holding whose stored `next_renewal` is in the past is not cancelled and not `lapsed`. Whether it is Inbox work depends on auto-renewal (below).
- **Expected next renewal** is a separate labelled value. Project an expected date only when status is `active`, auto-renewal is **confirmed yes**, cadence is **confirmed**, and the recorded date is **confirmed**. Label the result inferred/expected. Do not write it back.
- Derive each occurrence from the **original recorded date** as the anchor. Monthly from 31 January is 28/29 February, then 31 March — not 28 March. Do not reuse `rollNextRenewal` for this projection: that helper steps from each previous result and is only for a user-asked still-holding roll.
- Auto-renewal `no` or `unknown`: a passed stored date stays a reconciliation item. Do not invent an expected date.
- Confirmed auto-renewal `yes` with missing or conflicting cadence/date: show the missing/conflicting schedule. Do not invent a date.
- `trial`, `paused`, `cancelled`, and `cancel_scheduled` are not ordinary active recurring holdings. They do not get an unlimited expected schedule.

### Trials

- Stage-one trials are free. There is no current trial charge. Amount, currency, and cadence on a trial row are the **paid plan after trial**, labelled that way. Unknown paid terms stay unknown. Never store a confirmed zero price because the trial is free. Do not add separate trial-price or post-trial-price columns.
- Trial end is a separate fact from subscription end (`ends_on`). During trial it is the expected payment-start boundary if the user continues. Later recurring due dates belong to the paid subscription.
- Date passage does not convert a trial to paid, write a payment, or confirm continuation. Keep the same holding identity when the user reports it became paid. [SUB-44](https://linear.app/lets-play-match/issue/SUB-44/add-trial-and-auto-renewal-facts-to-manual-entry-and-reads), [SUB-46](https://linear.app/lets-play-match/issue/SUB-46/explain-spend-coverage-and-separate-trials-from-paid-commitments)

### Reminders

- Renewal and trial-end preferences are independent of auto-renewal and of each other. States are unset, off, and enabled. An absent row is unset; an explicit off row is off.
- Suggestions are not consent. Only a user action adopts a suggestion. Do not backfill existing rows. Do not overwrite a stored choice when cadence later changes.
- Suggested renewal: weekly/monthly **off**; yearly **one calendar month** before renewal. Suggested trial: **three calendar days** before trial end. The user can enable, change, or turn off any of these.
- Store lead as value + unit (`days` or `months`), not as “30 days” and not as a persisted reminder date.
- Subtract calendar months with month-end clamping (31 March minus one month is 28 or 29 February). Compare **UTC calendar dates** (`YYYY-MM-DD` from `now.toISOString().slice(0, 10)`), the same convention as existing `today()` / `calendarToday()`.
- An enabled notification is visible when `reminderDate <= today <= dueDate`. It is gone when `today > dueDate`. A trial reminder expires after trial end. Unknown targets produce no dated card.
- No dismiss, clear, snooze, or mark-read-to-remove. Opening Inbox does not clear a card. Expiry writes nothing to subscriptions, preferences, amendments, or events.
- Notifications are computed on read. There is no scheduler, notification store, outbox, or external send. Inbox **Reminders** replaces the generic **Renewing soon** glance. There is no dismiss, snooze, or mark-read.

### Lifecycle and identity

- Do not delete subscription identity on cancel. Append a `cancelled` event and close the open amendment.
- Match before create. A mention of a service already in the ledger updates that row. It is not a new subscription. The reason is holding identity, not “a payment is not a new sub”.
- A receipt or “I paid” updates **holding, cost, and next due**. It does not write a payment.
- Do not infer `cancelled` from silence or from a date passing. There is no `lapsed` status. User-stated expiry, a failed card, or “not renewed” is `cancelled`.
- A past date the user states is the event date. Do not snap cancel to today. Relative past dates (“three months ago”) are valid cancel timing.
- Ordinary field corrections remain possible. An actual price change is a terms-change action with user-specified effective timing. Corrections and terms changes must be distinguishable. [SUB-43](https://linear.app/lets-play-match/issue/SUB-43/make-manual-edits-preserve-trust-and-history)
- Actual ending uses the same lifecycle writer as an accepted cancel proposal. The overdue **Cancelled** action must review the actual end date; do not silently use a stale stored `next_renewal`. If timing is unknown, leave the matter unresolved and allow notes. [SUB-48](https://linear.app/lets-play-match/issue/SUB-48/show-expected-renewals-and-remove-routine-confirmation-work)
- Capture (chat, files, voice) writes **pending proposals** only. It does not write ledger rows until accept. Reminder instructions extracted from a capture remain proposals until accept. Evidence of provider auto-renewal is not reminder consent.

### Inbox and ledger

- Inbox is the workbench: pending proposals, holdings that still need reconciliation, unfinished rows, and preference-driven Reminders.
- After SUB-48, a confirmed auto-renewing active holding does **not** enter Overdue merely because its stored date has passed. Auto-renewal `no`/`unknown`, passed trial ends, and unusable schedules still do.
- The ledger stays inventory — no “needs attention” chip there.

## Subscription Workspace UX — agreed contract

[SUB-57](https://linear.app/lets-play-match/issue/SUB-57/publish-the-agreed-subscription-workspace-ux-contract) published this phase. The full text is [docs/subscription-workspace-ux-plan.md](docs/subscription-workspace-ux-plan.md); human journeys are [docs/subscription-workspace-ux-acceptance-journeys.md](docs/subscription-workspace-ux-acceptance-journeys.md). **Until each linked issue ships, `main` keeps its current behaviour** — see the forthcoming table below. Do not implement one of these rules inside a different issue's PR.

- **Status interpretation (landed in [SUB-60](https://linear.app/lets-play-match/issue/SUB-60/interpret-new-subscriptions-as-active-and-current-trials-as-trial)).** A new subscription defaults to `active`; an ordinary pasted list is `active` per row; an explicit current-trial statement or trial-list context means `trial`. `unknown` is for genuinely ambiguous or contradictory input — a missing price or date is never unknown status, and a cancellation whose timing the message never settles stays a question rather than becoming a holding. The card displays an editable status, and accepting establishes that displayed status without a second status question. A stated trial end that has already passed is history, not a current trial. Rows that landed `unknown` before this are left alone; Inbox offers them a status-only answer that writes no date.
- **Independent confirmation scope.** Accepting a status confirms status only. Amount, cadence, `next_renewal`, trial end, and auto-renewal keep their own trust. A price-only update on an existing `trial` or `cancelled` row does not reset it to `active`. A stored trial-end date alone is weaker evidence than a fresh current-trial statement and never reclassifies a row; time passing never turns `trial` into `active`.
- **Precise field review (lands in [SUB-58](https://linear.app/lets-play-match/issue/SUB-58/add-missing-subscription-terms-without-a-terms-change-question), [SUB-59](https://linear.app/lets-play-match/issue/SUB-59/confirm-and-edit-individual-fields-directly-on-proposals-and-records)).** Confirming one value confirms exactly that value; an amount-only confirm must not touch unrelated field flags. Opening or saving an unchanged form is not confirmation. Filling an empty amount/cadence/plan is ordinary completion, not a terms change; replacing a known term still distinguishes correction from an actual change with the user's effective date. A mixed edit can complete one field and change another while preserving unrelated history and trust. Trial after-trial terms keep the ordinary-edit rule.
- **Holding identity (landed in [SUB-52](https://linear.app/lets-play-match/issue/SUB-52/decide-the-holding-identity-rule-for-capture); provider correction on a card lands in [SUB-56](https://linear.app/lets-play-match/issue/SUB-56/a-misread-provider-cannot-be-corrected-on-a-card-so-it-becomes-a-new)).** The stable holding ID is identity. Provider and account are matching evidence; plan is an editable property. No provider or provider+account uniqueness constraint. One compatible match may receive an update proposal; multiple matches, or a different or previously unseen account, must ask — never silently overwrite or pick a row. A repeated pending input reuses the same intended draft and preserves evidence; distinct holdings are never silently dropped or merged. Acceptance rechecks identity and revision transactionally. Question identity is scoped to the holding or draft, not only user+provider+reason. “Use existing” retargets a pending proposal; it never merges or deletes a created holding.
- **Workspace (lands in [SUB-55](https://linear.app/lets-play-match/issue/SUB-55/open-capture-questions-are-recorded-but-never-surfaced-again), [SUB-61](https://linear.app/lets-play-match/issue/SUB-61/keep-a-persistent-conversation-linked-to-the-selected-subscription-or), [SUB-62](https://linear.app/lets-play-match/issue/SUB-62/bring-work-and-subscriptions-into-one-responsive-workspace)).** One shared shell with **Work** and **Subscriptions** views; a persistent conversation with an explicit target (all subscriptions, a selected subscription, or a specific question); draft recovery across navigation and view switches. Every open question stays reachable; deferral does not delete. Subscriptions stays inventory with no attention chips, and reminders keep their no-dismiss, computed-on-read semantics.

### Evaluation setup

- Use the existing login. Production sign-in, new account provisioning, and auth-provider setup are out of scope.
- Bhavesh may clear records before an onboarding cycle. That is test preparation, not a request to build reset UI.
- External email, browser push, and messaging notifications are out of scope.

## Shipped versus forthcoming

Stage One has landed — SUB-42–SUB-53 are Done and the rules above are what `main` implements. The first table is retained as history: it records which issue each behaviour shipped in. The active queue is the [Subscription Workspace UX](https://linear.app/lets-play-match/project/subscription-workspace-ux-6fb87b2cf4de/overview) project; the tables below it record what that project has already changed and what it still will. Implement only the issue you were given; link each change to that issue.

### Landed: stage one

| Behavior | On `main` today | Landed in |
|---|---|---|
| Notes-only edit must not reconfirm money/dates; terms change vs correction; cancel via shared lifecycle writer | Notes-only `PATCH` omits untouched money/dates; explicit confirm can confirm an unchanged value; a `termsChange` versions history; manual cancel/reactivate reuse the proposal writers. Overdue Inbox cancel reviews the actual end date. | [SUB-43](https://linear.app/lets-play-match/issue/SUB-43/make-manual-edits-preserve-trust-and-history) |
| Trial end and auto-renewal facts | `trial_ends_on` and `auto_renewal` with trust; amount/cadence on a trial are the paid plan, labelled after trial. Capture proposes these through SUB-45. | [SUB-44](https://linear.app/lets-play-match/issue/SUB-44/add-trial-and-auto-renewal-facts-to-manual-entry-and-reads) |
| Independent reminder preferences | Preference table, manual controls, date preview; unset ≠ off; cadence does not overwrite a stored choice. Capture proposes reminder instructions through SUB-45. Inbox Reminders land in SUB-49. | [SUB-47](https://linear.app/lets-play-match/issue/SUB-47/save-independent-reminder-preferences) |
| Capture/proposals for the new facts | Capture proposes trial end, auto-renewal, and reminder preferences as pending cards. Accepting is the user action. Money/date/auto-renewal stay proposed until confirmed on the card. | [SUB-45](https://linear.app/lets-play-match/issue/SUB-45/capture-the-new-facts-and-preferences-through-proposals) |
| Expected next renewal; routine auto-renewal leaves Overdue | List/detail keep stored `next_renewal` and add `expectedNextRenewal` (inferred/expected) for active confirmed auto-renewing rows. Sort, filter, summary, Inbox, and reminder previews use that expected date. Those rows do not enter Overdue merely because the stored date has passed. Auto-renewal no/unknown, passed trial ends, and unusable schedules still do. Overdue **Cancelled** reviews the actual end date. | [SUB-48](https://linear.app/lets-play-match/issue/SUB-48/show-expected-renewals-and-remove-routine-confirmation-work) |
| Inbox Reminders; expire after due date; no dismiss | Preference-driven Inbox **Reminders** replace Renewing soon. Cards are computed on read from enabled preferences + the shared schedule due date. Visible `reminderDate <= today <= dueDate`; gone the next calendar day. No dismiss, snooze, or scheduler. Expected dates keep their inferred basis. | [SUB-49](https://linear.app/lets-play-match/issue/SUB-49/deliver-expiring-reminder-notifications-in-inbox) |
| Paid-commitment totals exclude trials; coverage/omission | Named recorded GBP paid-commitment monthly equivalent. Confirmed vs unconfirmed split. Trials after trial, not in the current paid total. Missing price/cadence and non-GBP are omissions, not zero. Ledger links list those rows. | [SUB-46](https://linear.app/lets-play-match/issue/SUB-46/explain-spend-coverage-and-separate-trials-from-paid-commitments) |

### Landed: Subscription Workspace UX

| Behavior | On `main` today | Landed in |
|---|---|---|
| Contract published; no behaviour change | These docs. | [SUB-57](https://linear.app/lets-play-match/issue/SUB-57/publish-the-agreed-subscription-workspace-ux-contract) |
| Reliable list capture | `stop_reason` is read before the reply is: a truncated reply says the list was too long and asks for smaller batches, a malformed one says so in its own words, and an empty list is an answer. `MAX_TOKENS` is derived from `MAX_CANDIDATES`; a reading at the cap carries a notice naming it | [SUB-54](https://linear.app/lets-play-match/issue/SUB-54/capturing-an-ordinary-onboarding-list-fails-with-an-unactionable-error) |
| Active default; current-trial interpretation | A new holding is `active` unless the message says otherwise; a trial list and a current-trial statement are `trial`; an existing row keeps its status when only a price arrives. Accepting a card establishes the status it displayed and confirms nothing else. An `unknown` row can be answered from Inbox without rolling a date | [SUB-60](https://linear.app/lets-play-match/issue/SUB-60/interpret-new-subscriptions-as-active-and-current-trials-as-trial) |

### Forthcoming: Subscription Workspace UX

| Behavior | On `main` today | Lands in |
|---|---|---|
| Open questions resurface | `capture_questions` rows persist but are never reloaded into the UI after their turn | [SUB-55](https://linear.app/lets-play-match/issue/SUB-55/open-capture-questions-are-recorded-but-never-surfaced-again) |
| Holding identity rule | Landed: `resolveCandidate` matches on provider **and** account (`matched` / `ambiguous` / `unseen_account` / `none`); several compatible holdings or an unseen account raise an `account_identity` question naming the holdings instead of picking one; a repeated pending `create` for the same provider+account folds onto the existing draft; `capture_questions` are keyed by `(user_id, scope_key, reason)` with `holding:<id>` / `draft:<provider>\|<account>` scopes; accept rechecks under the user lock and returns `409 duplicate_holding` (an equivalent draft already became a holding) or `409 stale_target` (the holding's provider/account changed since the card was raised). Journeys in `lib/journeys/identity.integration.test.ts` | [SUB-52](https://linear.app/lets-play-match/issue/SUB-52/decide-the-holding-identity-rule-for-capture) |
| Provider correction on a card | A misread provider cannot be retargeted; it becomes a new holding | [SUB-56](https://linear.app/lets-play-match/issue/SUB-56/a-misread-provider-cannot-be-corrected-on-a-card-so-it-becomes-a-new) |
| First-fill without a terms-change question | Filling an empty amount/cadence/plan on a paid row triggers the correction-vs-terms-change prompt meant for replacing known terms | [SUB-58](https://linear.app/lets-play-match/issue/SUB-58/add-missing-subscription-terms-without-a-terms-change-question) |
| Per-field confirm and edit on proposals and records | Accept-time `confirm` covers the fields the caller names; a card has no per-field confirm or edit affordance | [SUB-59](https://linear.app/lets-play-match/issue/SUB-59/confirm-and-edit-individual-fields-directly-on-proposals-and-records) |
| Persistent conversation with an explicit target | Follow-up is composer-scoped to its capture turn; there is no durable conversation or target | [SUB-61](https://linear.app/lets-play-match/issue/SUB-61/keep-a-persistent-conversation-linked-to-the-selected-subscription-or) |
| Shared Work/Subscriptions responsive shell | `/inbox` (workbench) and `/ledger` (inventory) are separate pages | [SUB-62](https://linear.app/lets-play-match/issue/SUB-62/bring-work-and-subscriptions-into-one-responsive-workspace) |
| Real-use validation | — | [SUB-63](https://linear.app/lets-play-match/issue/SUB-63/validate-the-subscription-workspace-with-real-onboarding-and-return) |

These are **known limitations of the shipped stage**, agreed for repair in their linked issues — not regressions and not license to fix them in an unrelated PR.

## Definition of done (every issue)

- [ ] Acceptance criteria in the Linear issue are checked off
- [ ] `npm test` / `npm run lint` / `npm run typecheck` pass. `npm test` brings up its own throwaway Postgres; **never** point `npm run db:seed` at it — seed rows make every integration suite die in `beforeAll`, which Vitest reports as *skipped* while the run still exits 0. See [README.md](README.md#tests)
- [ ] Seed or fixture data exists if the UI would otherwise be empty
- [ ] No secrets committed
- [ ] PR links the Linear issue
- [ ] Human has a written test plan they can execute without reading the code

## What not to do

- Do not implement “while I’m here” extras (email ingest, mobile apps, pricing scrapers, share links, teams, production sign-in, external notifications, schedulers, payment recording, automatic trial conversion)
- Do not block saving a subscription on complete money fields
- Do not show fake precision confidence like `0.87`; use high / medium / low if you show it at all
- Do not call live vendor pricing APIs as source of truth
- Do not persist notification cards or add a dismiss/snooze control
- Do not write expected dates back onto `next_renewal`
