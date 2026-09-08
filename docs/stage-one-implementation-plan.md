# Stage one: implementation plan

Planning baseline: 7 September 2026, local checkout at `8d81108`. Based on source inspection and the [product brief](subscription-product-brief-draft.md). Latest scope: **use the existing setup for Bhavesh's evaluation; deliver reminder notifications in Inbox, without dismissal, and expire them after the subscription due date**. This supersedes the earlier proposal for production sign-in and deferral of all notification delivery. This is a proposed implementation sequence, not a claim that work has shipped or that tests have just been rerun.

## Completion boundary

Stage one delivers an inventory that Bhavesh can populate from empty, understand, maintain without confirming every auto-renewal cycle, and reconcile after an absence using the existing setup. It records trial dates, auto-renewal facts and independent reminder preferences, and displays due reminder notifications in Inbox.

Stage-one trials are free. If the user continues, the paid subscription starts when the trial ends; there is no separate paid-trial period or gap to a later first-payment date. Any recorded amount/cadence on a trial describes the paid plan after trial, not a current trial charge. The system still does not infer that continuation actually happened merely because the date passed.

An enabled renewal reminder appears in Inbox from its reminder date through the subscription due date, inclusive. Once the due date is in the past, that occurrence disappears automatically. There is no dismiss, clear, mark-read-to-remove or snooze action. Expiring a notification does not cancel the subscription, acknowledge it, or change any stored money/date fact. External email, browser push and messaging notifications are out of scope.

Keep the existing web interface and capture channels. Screen switching and manual notes are acceptable. A written source checklist is enough for onboarding; no wizard, usage-rating feature, bank integration, email ingest, mobile app, or channel framework is required.

Production sign-in, new account provisioning and auth-provider setup are explicitly excluded. Bhavesh will use the existing login and may clear records before an onboarding cycle. That planned reset is valid test preparation, not a product failure or a request to build reset UI. No records are cleared as part of this planning task.

## What already exists, and what is missing

| Capability | Evidence in the checkout | Required work |
|---|---|---|
| Text/list, image, PDF and voice capture; proposals and acceptance | `lib/capture/`, `lib/proposals/`, `components/capture/`, `components/proposals/` | Extend the shared pipeline for the new concepts. Retain existing extraction and file handling. |
| List, detail, manual entry, notes, field trust and terms history | `app/ledger/`, `lib/subscriptions/` | Add new fields and qualified summaries; repair manual-write inconsistencies below. |
| Existing evaluator access | Existing development/preview login is available; production sign-in remains unfinished. | Use the existing login and user record. Production authentication is not a phase-one dependency. |
| Empty onboarding cycle | `scripts/build.sh` seeds every preview deployment; `lib/db/seed.ts` truncates first. | Bhavesh may clear records for a run. Document the start state and any reset/redeploy between visits; keep the same dataset during a return scenario. No new reset or deployment feature is required. |
| Trial and auto-renewal facts | `lib/db/schema.ts` has trial status, `next_renewal`, and `ends_on`, but no trial-end or auto-renewal fields. | Add explicit facts, trust states, manual controls and capture support. |
| Reminder preferences and Inbox notifications | No preference fields/table; migration `0012` removed old reminders. Inbox already supports projected sections. | Add independent preferences and project current notifications into Inbox. No persisted notification cards, dismissal state or scheduled scans are needed. |
| Routine renewal without repeated confirmation | `lib/inbox/query.ts` selects every holding with a past stored date; `lib/subscriptions/projection.ts` exposes only that date. | Adopt an explicit expected-schedule projection and revised Inbox rules after product-rule sign-off. |
| Trustworthy totals | `lib/subscriptions/query.ts` sums eligible GBP terms, including trial, without aggregate trust or omission information. | Make cost coverage and uncertainty explicit; separate trial terms from ongoing paid commitments. |
| Faithful manual updates | The edit form sends every field; `toUpdateValues` confirms supplied fields. `syncOpenAmendment` updates current terms in place; manual status edits do not use the proposal lifecycle writer. | A notes-only edit must not reconfirm untouched money/dates. Real terms and lifecycle changes must preserve history consistently. |
| Full onboarding and return validation | Component and API tests exist; `docs/testing-and-signoff.md` explicitly does not establish these whole user journeys. | Add representative journey fixtures and execute the human scenarios in the companion checklist. |

These are source findings, not an exhaustive bug audit. Additional repairs belong in stage one only when they block the agreed completion scenarios.

## Decisions required before dependent implementation

The concepts and the free-trial/payment-start rule are agreed. The table distinguishes those settled rules from detailed recommendations still requiring review. Resolve the remaining recommendations in the first contract issue before dependent money, date or lifecycle implementation.

| Ref | Recommended rule for review | Affects |
|---|---|---|
| D1 — expected dates | Preserve `next_renewal` as the recorded date with its original trust. Add a separate expected-next-renewal projection for an active subscription with confirmed auto-renewal = yes, a usable cadence and a usable recorded date. Label the result inferred/expected. Do not write it back. Agree which trust states make a date/cadence usable; conservative starting recommendation is confirmed inputs. | Plan-02, Plan-05 |
| D2 — recurrence and attention | Derive each occurrence from the original anchor, avoiding Jan 31 → Feb 28 → Mar 28 drift. A trial, paused, cancelled or cancellation-scheduled row must not be treated as an ordinary active recurring holding. For unknown/no auto-renewal, retain a passed-date reconciliation item; for confirmed yes with insufficient/conflicting schedule inputs, show the missing/conflicting schedule rather than invent a date. Trial end passing stays a question, not automatic paid conversion. | Plan-05 |
| D3 — reminder defaults and consent | Store separate fixed targets for renewal and trial end. Preferences distinguish unset, off, and enabled; only a user action adopts a suggestion. Suggest off for weekly/monthly renewal and one calendar month before yearly renewal. Do not apply defaults to migrated holdings or overwrite preferences when cadence changes. Recommend an editable trial suggestion of three days before trial end; this remains unapproved pending the user's answer. | Plan-03, Plan-04 |
| D4 — reminder date arithmetic | Recommend calendar-month subtraction with month-end clamping, storing lead value/unit rather than converting a month to 30 days. Visibility is agreed: reminder date <= today <= due date; remove the occurrence when today > due date. For a stage-one trial, trial end is also the expected start of payment, so its reminder expires after trial end. Use one explicit calendar-day convention consistently across Inbox and schedules. Trial reminder lead time remains open. Unknown targets do not generate dated notifications. | Plan-03, Plan-05, Plan-06 |
| D5 — free trials and paid-plan costs | Agreed: there is no charge during trial; payment starts at trial end if the subscription continues. Exclude trial rows from current paid-commitment totals. Recommended minimal representation: use existing amount/currency/cadence for the paid plan, labelled “after trial” while status is trial. No separate current-trial price or post-trial price fields are needed. Keep unknown paid-plan terms unknown; never store a confirmed zero price merely because the trial is free. Aggregate trust and omission presentation still require the detailed contract. | Plan-02, Plan-04, Plan-07 |
| D6 — manual changes and cancellation | Ordinary field corrections remain possible, but an actual price change uses a terms-change action with user-supplied effective timing. Actual ending uses the common lifecycle writer. Replace the unqualified overdue Cancelled shortcut with review of the proposed end date; never silently treat a stale renewal date as the actual cancellation date. If timing is unknown, leave the matter unresolved and allow notes rather than inventing a date. | Plan-01, Plan-05 |

The annual auto-renewal=false default is **not** part of this plan. Auto-renewal is yes/no/unknown, established from the user or evidence. A capture does not confirm it automatically.

The earlier proposal for separate trial-price and post-trial-price fields is removed. “Trial ends Friday, then £10/month” can use trial status, trial end and the existing paid-plan terms. A bare trial with no stated paid price remains valid. Preserve the same holding identity when the user confirms it became paid; date passage alone does not create a payment or mark the subscription active.

## Proposed technical shape

### Facts and preferences

Use additive Drizzle migrations. Extend `subscriptions` with nullable trial end and auto-renewal, plus field trust and provenance consistent with existing captured facts. Reuse existing amount/currency/cadence for paid-plan terms, with status-aware labels and totals under D5. Do not add separate trial-price or post-trial-price columns. Extend the existing audit/event payloads for changes to the new facts; a new event-sourcing framework is unnecessary.

Store reminder preferences in a small user-owned table linked to the subscription, unique by `(user_id, subscription_id, target)`, where target is renewal or trial end. Store preference state, lead value/unit and the user's selection. An absent row can represent unset, but unset must remain distinguishable from explicitly off. Notifications themselves are computed, not queued or stored. Migration leaves existing subscriptions unknown/unset.

Carry optional new fields through the shared extraction candidate, proposal payload, confirmation, apply and projection paths. Old pending proposals must still validate. Accept-as-proposed preserves uncertainty; explicit confirmation or manual entry establishes a fact. Reminder instructions extracted from a capture remain proposals until the user accepts the preference. Evidence of provider auto-renewal is not consent to a reminder.

### Expected schedules

Create one pure resolver shared by the list/detail projections, renewal filtering and sorting, summary's next-upcoming calculation, Inbox, and reminder-date previews. Return the recorded date and expected date as separate values with a clear basis. Never merely change the label on a confirmed past date to make it appear future.

The existing `rollNextRenewal` mutates its working date repeatedly and is documented as usable only after a user action. Do not reuse it blindly for the new projection. An anchor-based calculation needs explicit month-end and leap-year cases. Expected schedules and reminder previews must leave subscription, amendment and event rows unchanged on read.

A known recurring arrangement can support an expected schedule; it cannot establish payment history. Trials remain trials until the user reports what happened, even if auto-renewal is known to be enabled. A trial ending is a separate decision point, not a routine monthly renewal to suppress.

While trial status remains, trial end supplies the expected first-payment boundary under the agreed stage-one rule. This does not require a separate first-payment-date field or silently setting confirmed `next_renewal`. Following user-confirmed continuation, retain trial history and apply the approved paid-schedule rules on the same subscription identity. Inputs describing paid trials or a different payment-start boundary fall outside this stage-one model; surface that limitation rather than silently discarding or rewriting the stated terms.

### Inbox notification delivery

Extend `GET /api/inbox` with a reminder-notification projection using the user's preferences, the shared schedule resolver, and the current calendar date. Each result identifies the subscription, reminder target, due occurrence, reminder-start date and date trust/basis. Use a stable occurrence key such as subscription + target + due date to avoid duplicate rendering.

For a renewal due 15 October with a one-month reminder, the card appears from 15 September through 15 October and is absent from 16 October. Opening or refreshing Inbox never clears a card early. No dismissal or acknowledgement state exists. Refresh on relevant edits, focus and calendar-day changes so an open page reflects expiry without a background ledger-writing job.

After an auto-renewing occurrence expires, the next occurrence has its own reminder window. A new occurrence may already qualify if the chosen lead time spans a whole billing period; that is a new reminder, not the expired card surviving. Test occurrence identity explicitly. For a non-renewing/unknown holding, the notification can expire while the subscription remains in the reconciliation section.

The recommended integration is a distinct Reminders section in Inbox, replacing the existing generic Renewing soon glance so weekly/monthly no-reminder preferences do not still produce a second unsolicited reminder-like section. General upcoming dates remain accessible in the inventory. Confirm this layout in Plan-00. Normal preference edits and actual lifecycle changes recompute eligibility; they do not introduce a per-notification clear action. A trial reminder remains visible through trial end and disappears afterward, independently of whether the user has resolved the trial's outcome.

### Evaluation setup

Use the existing login. Bhavesh may clear the relevant records before a run while retaining the login/user needed by the current APIs. Log whether a run starts empty or from fixtures. Preview deployment reseeding is an environment reset; avoid it during a return scenario or explicitly restart that scenario afterward. No production auth, reset control, or persistence-across-preview-redeploy requirement is added.

## Implementation sequence: published Linear issues

The ten issues are published in the [Stage One project](https://linear.app/lets-play-match/project/stage-one-e9ded9c215f5/overview), grouped under three parent epics. See the [verified issue and dependency map](stage-one-linear-backlog.md). `Plan-00` through `Plan-09` remain local cross-references; the headings below link the allocated Linear IDs. Unresolved product decisions still gate implementation. Each implementation issue gets one branch and PR, stays In Progress after the PR opens, and reaches Done only after human sign-off. Do not bundle this entire plan into one PR.

### Plan-00 / [SUB-42](https://linear.app/lets-play-match/issue/SUB-42/publish-the-revised-stage-one-contract) — Publish the revised stage-one contract

**Depends on:** product decisions D1–D6. **Deliverable:** docs-only PR.

Update `AGENTS.md`, product/data/query/architecture docs, `docs/plan.md`, README and sign-off documentation consistently. Make the agreed direction and approved detailed rules authoritative before code depends on them. Distinguish existing behavior from forthcoming behavior and link each unimplemented change to its issue.

Acceptance:

- Stage one uses existing login and includes Inbox notification delivery. External channels and production sign-in are excluded.
- Confirmed facts, expected schedule projections, reminder preferences and actual lifecycle changes have distinct meanings.
- Date examples, trial costs, preference defaults, manual-change timing and unknown cases have unambiguous expected outcomes.
- Resolve the existing ban on projected future dates in favour of the approved separate expected-date contract. Document reminder-window expiry and no dismissal. Keep scheduled work absent: Inbox delivery is computed on read.
- No source file or migration implements a product decision hidden in this PR.

### Plan-01 / [SUB-43](https://linear.app/lets-play-match/issue/SUB-43/make-manual-edits-preserve-trust-and-history) — Make manual edits preserve trust and history

**Depends on:** Plan-00 / D6. **Scope:** existing fields first, to establish safe edit behavior before adding more fields.

Acceptance:

- Editing notes sends only intended changes; unchanged inferred/proposed amount, cadence and date retain their values and trust.
- An explicit confirmation can confirm an unchanged value; merely reopening and saving a form cannot.
- A stated price change preserves prior terms and records the user-specified effective timing. A correction and a terms change are distinguishable under D6.
- Cancellation and reactivation through manual controls use the same lifecycle effects as accepted proposals, retaining identity and correctly handling the open amendment and next due date.
- Cover these behaviors through API tests and a human detail/timeline check, including rejecting a change.

Primary files: `app/ledger/subscription-form.tsx`, `lib/subscriptions/form-values.ts`, `write.ts`, `lib/proposals/terms.ts`, `lifecycle.ts`, `reactivate.ts`. Reuse existing domain writers; do not create a second lifecycle implementation.

### Plan-02 / [SUB-44](https://linear.app/lets-play-match/issue/SUB-44/add-trial-and-auto-renewal-facts-to-manual-entry-and-reads) — Add trial and auto-renewal facts to manual entry and reads

**Depends on:** Plan-00 / D1, D5; Plan-01. **Scope:** additive schema, manual API and form, list/detail projection, seeds.

Acceptance:

- Trial end remains separate from subscription end. During trial it is the expected payment-start boundary; later recurring due dates belong to the paid subscription. Missing dates do not block saving a name-only row.
- Auto-renewal supports yes/no/unknown, with trust. Cadence never confirms auto-renewal.
- Trials have no current charge. A stated paid-plan price/cadence is retained and labelled “after trial”; unknown paid terms stay unknown. There are no separate trial-price or future-price fields.
- Manual entry/confirmation and clearing work; notes-only edits preserve these new fields' trust.
- Existing rows migrate with new facts unknown, not inferred from cadence. Existing history and pending proposals survive.
- New details remain user-scoped in both UI and JSON.

Primary files: `lib/db/schema.ts`, `drizzle/`, `lib/subscriptions/{write,projection,form-values}.ts`, `app/ledger/`, `lib/db/seed-data.ts`.

### Plan-03 / [SUB-47](https://linear.app/lets-play-match/issue/SUB-47/save-independent-reminder-preferences) — Save independent reminder preferences

**Depends on:** Plan-02; D3–D4. **Scope:** preference schema/API, manual controls, date preview using a supplied target date.

Acceptance:

- Renewal and trial-end preferences are independent of auto-renewal and of each other.
- Weekly/monthly renewal suggests no reminder; yearly suggests one calendar month before renewal. Trial behavior follows the resolved trial choice.
- The user can enable, change or turn off a preference. Unset is not confused with explicitly off; later edits do not reset a choice.
- Missing cadence/date does not block saving. Unknown target timing and past reminder dates are visibly represented.
- Settings identify Inbox as the delivery location. Disabling a preference is separate from dismissing an individual notification; no per-notification dismissal exists. There is no external send route, scheduler, outbox or provider call.
- Existing rows do not acquire reminder consent through a migration.

Primary files: `lib/db/schema.ts`, `drizzle/`, proposed `lib/reminders/preferences.ts` and `dates.ts`, subscription routes/forms/detail. A dedicated account-settings page is not required.

### Plan-04 / [SUB-45](https://linear.app/lets-play-match/issue/SUB-45/capture-the-new-facts-and-preferences-through-proposals) — Capture the new facts and preferences through proposals

**Depends on:** Plan-02, Plan-03. **Scope:** extend the existing shared capture/proposal path for all supported input types.

Acceptance:

- “Trial ends 14 September, then £10 monthly; auto-renew is on” retains trial end and paid-plan terms with evidence and no confirmed money/date/auto-renewal before user confirmation. The first expected payment boundary is trial end under the agreed rule.
- A trial without a paid price can be accepted. Unsupported paid-trial or different-payment-start input is surfaced rather than silently rewritten into the stage-one model.
- “Remind me one month before renewal” and “turn that reminder off” produce reviewable preference proposals, not immediate updates.
- Cards display the new fields and let the user confirm/correct or reject them. For mistakes beyond supported card editing, reject and recapture or manual entry is a documented working fallback.
- Conflicting evidence cannot overwrite confirmed facts. Acceptance is transactional and old proposal payloads remain valid.
- Repeating evidence, including before acceptance, does not create unintended duplicate subscriptions or pending operations. A preference-only update targets the existing subscription.
- One useful follow-up per capture turn remains the ceiling; missing answers do not block partial acceptance.

Primary files: `lib/capture/{candidates,anthropic,record,follow-up,fixture-extractor}.ts`, `lib/proposals/{payload,confirm,apply,projection}.ts`, `components/proposals/`, existing capture and proposal tests.

### Plan-05 / [SUB-48](https://linear.app/lets-play-match/issue/SUB-48/show-expected-renewals-and-remove-routine-confirmation-work) — Show expected renewals and remove routine confirmation work

**Depends on:** Plan-02, Plan-03; D1–D2, D4, D6. **Scope:** pure schedule resolver, all affected read surfaces, revised Inbox actions.

Acceptance:

- An active confirmed auto-renewing monthly/weekly holding remains useful after multiple cycles without another still-holding click. Its original recorded date and trust remain available.
- List, detail, sort/filter, next-upcoming summary, Inbox and reminder previews agree on the same expected schedule and disclose inference.
- Original-anchor month-end and leap-year examples pass. Reads write no subscription facts, amendments or events.
- Auto-renewal=no/unknown or unusable schedule inputs remain unresolved as defined in D2. Nothing silently cancels, confirms payment, or converts a trial to paid.
- A passed trial end still prompts reconciliation. Paused, cancelled and cancellation-scheduled cases cannot generate an unlimited active schedule; follow the explicitly approved cutoff rules.
- The overdue cancellation action reviews the actual stated end date rather than silently assigning the stale recorded renewal date.
- Auto-renewing subscriptions can still be reviewed for value; removing repeated holding confirmation does not hide user-selected reminder preferences.

Primary files: `lib/subscriptions/{dates,query,projection,params,cursor}.ts`, proposed `schedule.ts`, `lib/inbox/`, `components/inbox/`, `app/ledger/`, `lib/reminders/`.

### Plan-06 / [SUB-49](https://linear.app/lets-play-match/issue/SUB-49/deliver-expiring-reminder-notifications-in-inbox) — Deliver expiring reminder notifications in Inbox

**Depends on:** Plan-03, Plan-05; D4 and Plan-00's Inbox layout/eligibility contract. **Scope:** notification projection, Inbox API and section, boundary tests.

Acceptance:

- For a renewal due 15 October and a one-month reminder, the card is absent 14 September, visible 15 September through 15 October, and absent 16 October.
- Notifications have no dismiss, clear, snooze or mark-read-to-remove control or endpoint. Reopening Inbox does not clear them.
- A notification created from an expected date clearly retains that date's inferred basis. Unknown dates do not become invented notification deadlines.
- Preference/date edits recompute eligibility; repeated loads produce one card per occurrence. A later auto-renewal occurrence can generate its own card only when its window is active.
- Expiry changes no subscription, preference, amendment or event row. An unresolved holding can remain in Inbox after its reminder disappears.
- The open page refreshes around day changes and on return to focus; another user's notifications are never returned.
- A trial reminder remains visible on trial end and disappears the following day without converting the subscription to paid or hiding its unresolved outcome. There is no scheduler, notification store, delivery tracking or external provider call.

Primary files: `lib/inbox/query.ts`, `app/api/inbox/route.ts`, `app/inbox/ledger-sections.tsx`, proposed `lib/reminders/notifications.ts`, `components/inbox/`, focused date/API tests.

### Plan-07 / [SUB-46](https://linear.app/lets-play-match/issue/SUB-46/explain-spend-coverage-and-separate-trials-from-paid-commitments) — Explain spend coverage and separate trials from paid commitments

**Depends on:** Plan-02 / D5; Plan-05 for consistent next-upcoming summary. **Scope:** summary query/API and basic display.

Acceptance:

- Show a clearly named recorded GBP paid-commitment monthly equivalent, not a claim about actual payments or a complete budget forecast.
- Separate confirmed and unconfirmed calculable contributions. Explain what constitutes confirmed coverage, including both amount and cadence trust and unsettled holding status.
- Report missing-price/cadence rows and excluded currencies without treating them as zero; retain GBP scope without FX conversion.
- Trial rows are excluded from current paid-commitment totals. Their stated paid-plan prices appear separately as “after trial”; a missing paid-plan price stays unknown. Do not overwrite the amount with zero or mark the future price confirmed simply because the trial is free.
- Categories/counts reconcile with the included set, and a small independent calculation agrees with rounding rules.
- A user can identify the omitted/uncertain subscriptions from the summary or linked detail/list. Implement only a minimal link/filter/list needed for that visibility.

Primary files: `lib/subscriptions/query.ts`, summary route, `app/ledger/ledger-browser.tsx`, existing money/projection/API tests.

### Plan-08 / [SUB-50](https://linear.app/lets-play-match/issue/SUB-50/prove-onboarding-and-recovery-with-representative-scenarios) — Prove onboarding and recovery with representative scenarios

**Depends on:** Plan-01 through Plan-07. **Scope:** deterministic journey fixtures/tests, a short human onboarding checklist, and only demonstrated blocking fixes.

Acceptance:

- Start with a user but no holdings; capture a mixed list, accept partial rows, correct a wrong interpretation, and survive reload/retry.
- Exercise repeated providers, a repeated pending capture, and two legitimately different accounts. No silent dropping or merging of distinct holdings is accepted. If the existing matching rules cannot represent the distinction, record a concrete reproducer and resolve the identity rule before implementing a targeted fix.
- Cover a trial, annual auto-renewal with a reminder, monthly renewal without a reminder, unknown amount and unknown auto-renewal.
- Cover the Inbox notification before its window, within the window, on the subscription due date and after it. Confirm expiry leaves the holding and any genuine uncertainty intact.
- Simulate a six-month return containing a price change, actual past cancellation, reactivation and “I don't know.” Preserve history and unresolved work.
- The checklist records which source categories were checked and which were deferred, without introducing a mandatory onboarding state machine.
- Tests use synthetic data and injectable extraction; live extraction is separately exercised during human sign-off. Passing fixtures alone is not evidence of real extraction quality.

Primary files: existing integration suites, `lib/db/seed-data.ts`, `docs/testing-and-signoff.md`, [stage-one acceptance scenarios](stage-one-acceptance-scenarios.md). Split any substantial newly discovered implementation fix into its own real Linear issue and PR.

### Plan-09 / [SUB-51](https://linear.app/lets-play-match/issue/SUB-51/complete-real-onboarding-and-human-stage-one-sign-off) — Complete real onboarding and human stage-one sign-off

**Depends on:** Plan-01 through Plan-08 and human participation. **Scope:** evaluation using the existing setup and recorded completion evidence, not another feature bundle.

Acceptance:

- Bhavesh uses the existing login, clears records beforehand if needed, and accounts for every subscription identified from the chosen sources; remaining uncertainty is explicit.
- Supported text/list, file and voice paths are exercised using configured extraction/storage/transcription services in the chosen setup. Private inputs are not committed or added to reusable seed fixtures.
- A value review can identify subscriptions worth reconsidering using cost and optional notes; no usage-rating UI is required.
- Two return visits demonstrate that routine auto-renewal does not recreate avoidable holding-confirmation work.
- Reminder preferences round-trip; Inbox notifications appear at the configured point, cannot be dismissed and expire after the due date. External notification delivery is not required.
- No ordinary capture/edit/review requires SQL repair or code inspection. Bhavesh's deliberate reset before a new test cycle is allowed. Open core blockers prevent completion until fixed.
- The human signs off with a short outcome record. Automated checks alone cannot mark the stage complete.

## Order and dependencies

Recommended order is Plan-00 → Plan-01 → Plan-02 → Plan-03 → Plan-04 → Plan-05 → Plan-06 → Plan-07 → Plan-08 → Plan-09. Inbox delivery follows the preferences and schedule work. Plan-04 and Plan-05 can be worked in either order after their dependencies; Plan-06 and Plan-07 are independent after theirs. Nothing requires multiple implementation agents.

These ten issues are now published with native blocking relationships. Production sign-in is excluded and Inbox notification delivery is included. All remain in Backlog; unresolved decisions and dependencies gate implementation. The highest-uncertainty pieces are schedule semantics, trial reminder boundaries, manual history consistency and real capture/matching recovery.

## Verification and rollout

- Each implementation PR runs `npm run lint`, `npm run typecheck`, and `npm test`, with the repository's throwaway unseeded Postgres. Never run `db:seed` against the test database. Run `npm run build` for application/auth/deployment changes and include an executable human test plan.
- Add focused tests for trust preservation, transaction boundaries, identity, recurrence and summary calculations. Extend existing tests rather than duplicating them for each field.
- Migrate additively and leave old rows usable. Old clients/proposals omitting new fields must not clear them. A rollback can ignore new nullable fields/preferences without rewriting historical subscriptions; test restore/migration on synthetic copies, not real production data.
- Use the existing environment for evaluation. Keep a return scenario on the same dataset; if a preview redeploy resets it, record that and restart the scenario. Bhavesh may deliberately clear records between onboarding runs. This plan adds no reset UI or production-auth dependency.
- Implementers handle code, migrations and automated tests. Bhavesh prepares the evaluation dataset as agreed and performs product sign-off.
- Inbox notification delivery needs no scheduled worker: compute active windows on read and refresh the page when relevant. External channels, delivery history, provider setup and scheduler infrastructure remain later work.

## Ready-to-start boundary

The next deliverable is Plan-00's concrete contract revision, using the agreed principles and resolving D1–D6. Dependent money/date/lifecycle code must wait for those rules to be settled. The user has authorised creating this backlog in the Stage One Linear project. That does not approve unresolved product rules, start implementation, open a PR, or provision services.
