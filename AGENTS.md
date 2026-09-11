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
| User paths and expectations | [docs/user-journeys.md](docs/user-journeys.md) |
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

### Workspace and inventory

- The workspace attaches pending proposals, reconciliation, unfinished work, questions and preference-driven reminders to the relevant subscription or draft. The existing Inbox API supplies projected work; it is not a separate destination.
- After SUB-48, a confirmed auto-renewing active holding does **not** enter Overdue merely because its stored date has passed. Auto-renewal `no`/`unknown`, passed trial ends, and unusable schedules still do.
- All is saved inventory. Contextual filters expose work on the same rows; they do not change lifecycle status or introduce a generic “needs attention” chip.

## Subscription workspace contract

The rules below describe the shipped workspace through SUB-65. User motivations and paths are in [docs/user-journeys.md](docs/user-journeys.md); human validation is in [docs/testing-and-signoff.md](docs/testing-and-signoff.md). Implementation history remains in Git and Linear.

- **Reliable capture.** Read extraction termination before trusting its output. Explain truncated and malformed responses, preserve input for recovery, and report a candidate cap instead of silently dropping list entries. An empty extraction is a valid answer, distinct from failure (SUB-54).
- **Status interpretation (landed in [SUB-60](https://linear.app/lets-play-match/issue/SUB-60/interpret-new-subscriptions-as-active-and-current-trials-as-trial)).** A new subscription defaults to `active`; an ordinary pasted list is `active` per row; an explicit current-trial statement or trial-list context means `trial`. `unknown` is for genuinely ambiguous or contradictory input — a missing price or date is never unknown status, and a cancellation whose timing the message never settles stays a question rather than becoming a holding. The card displays an editable status, and accepting establishes that displayed status without a second status question. A stated trial end that has already passed is history, not a current trial. Rows that landed `unknown` before this are left alone; Inbox offers them a status-only answer that writes no date.
- **Independent confirmation scope.** Accepting a status confirms status only. Amount, cadence, `next_renewal`, trial end, and auto-renewal keep their own trust. A price-only update on an existing `trial` or `cancelled` row does not reset it to `active`. A stored trial-end date alone is weaker evidence than a fresh current-trial statement and never reclassifies a row; time passing never turns `trial` into `active`.
- **Precise field review (first-fill landed in [SUB-58](https://linear.app/lets-play-match/issue/SUB-58/add-missing-subscription-terms-without-a-terms-change-question); per-field controls landed in [SUB-59](https://linear.app/lets-play-match/issue/SUB-59/confirm-and-edit-individual-fields-directly-on-proposals-and-records)).** Confirming one value confirms exactly that value; an amount-only confirm must not touch unrelated field flags. Opening or saving an unchanged form is not confirmation. Filling an empty amount/cadence/plan is ordinary completion, not a terms change; replacing a known term still distinguishes correction from an actual change with the user's effective date. A mixed edit can complete one field and change another while preserving unrelated history and trust. Trial after-trial terms keep the ordinary-edit rule.
- **Holding identity (landed in [SUB-52](https://linear.app/lets-play-match/issue/SUB-52/decide-the-holding-identity-rule-for-capture); provider correction on a card landed in [SUB-56](https://linear.app/lets-play-match/issue/SUB-56/a-misread-provider-cannot-be-corrected-on-a-card-so-it-becomes-a-new)).** The stable holding ID is identity. Provider and account are matching evidence; plan is an editable property. No provider or provider+account uniqueness constraint. One compatible match may receive an update proposal; multiple matches, or a different or previously unseen account, must ask — never silently overwrite or pick a row. A repeated pending input reuses the same intended draft and preserves evidence; distinct holdings are never silently dropped or merged. Acceptance rechecks identity and revision transactionally. Question identity is scoped to the holding or draft, not only user+provider+reason. “Use existing” retargets a pending proposal; it never merges or deletes a created holding. Correcting a misread provider on a card re-runs matching; a `duplicate` question answered affirmatively retargets the pending draft at the named holding. Retargeting recomputes the delta and never confirms money, dates, auto-renewal, or reminder consent.
- **Workspace (shared shell landed in [SUB-62](https://linear.app/lets-play-match/issue/SUB-62/bring-work-and-subscriptions-into-one-responsive-workspace); subscriptions became the primary surface in [SUB-65](https://linear.app/lets-play-match/issue/SUB-65/make-subscriptions-the-primary-workspace-with-contextual-reviews)).** One `/workspace` list of subscriptions, with the drafts not yet added, under four overlapping filters — **All**, **Pending reviews**, **Open questions**, **Reminders**. There is no separate Work destination: a review, question or reminder is shown on the subscription or draft it is about, and opening a row gives the composer that explicit target. Filters are lenses, not lifecycle statuses; counts are rows, not cards. A persistent conversation with an explicit target (all subscriptions, a selected subscription or draft, or a specific question); draft recovery across navigation. Every open question stays reachable; deferral does not delete. Aggregate totals and coverage do not appear on the primary surface (the summary API remains for other readers). Reminders keep their no-dismiss, computed-on-read semantics.

### Evaluation setup

- Use the existing login. Production sign-in, new account provisioning, and auth-provider setup are out of scope.
- Bhavesh may clear records before an onboarding cycle. That is test preparation, not a request to build reset UI.
- External email, browser push, and messaging notifications are out of scope.

## Current validation

Stage One and the workspace implementation through SUB-65 have landed. [SUB-63](https://linear.app/lets-play-match/issue/SUB-63/validate-the-subscription-workspace-with-real-onboarding-and-return) validates real onboarding and two return visits; automated tests alone do not complete it. Use [docs/testing-and-signoff.md](docs/testing-and-signoff.md). SUB-64's cancellation-intention reminders and follow-up are outside this validation.

Implement only the assigned issue. Substantive defects found during validation need their own issue and PR; preserve the domain rules above.

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
