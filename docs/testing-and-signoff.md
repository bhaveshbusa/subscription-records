# Testing and sign-off

This is the working guide for [SUB-63: Validate the subscription workspace with real onboarding and return journeys](https://linear.app/lets-play-match/issue/SUB-63/validate-the-subscription-workspace-with-real-onboarding-and-return), following the merge of SUB-65. It describes checks to run, **not completed validation**. The current experience is one subscription workspace with All, Pending reviews, Open questions and Reminders filters.

Use [user-journeys.md](user-journeys.md) for the motivations and alternative paths, [product.md](product.md) for product expectations and [AGENTS.md](../AGENTS.md) for invariants. Completed implementation plans have been retired; Git and Linear retain their history. The [SUB-65 prototype](prototypes/sub-65/README.md) is design context, not evidence that the live app works.

## How we will work together

The guide gives Bhavesh one small task at a time, listens to what happened, and records the outcome before moving on. Start with the user's goal, allowing them to find their own path. If they get stuck, record the difficulty before giving navigation help. No coding, database repair or hidden setup should be required from the evaluator to complete a journey.

Use **Pass**, **Friction** (completed with confusion or avoidable effort), **Fail**, or **Not run**, with a short observation. Keep assistance visible in the result; a coached completion is not an unassisted pass. Record meaningful defects with reproduction steps. Substantial fixes belong in their own Linear issue and PR, followed by a retest here. Leave SUB-63 In Progress until the human sign-off gate is met.

SUB-64's cancellation-intention reminders and follow-up work are out of scope. Actual reported cancellation is covered. Production sign-in setup, new account provisioning, reset UI, external notifications and automatic trial conversion are also excluded. Use the existing login.

## Prepare the run

Fill this in before making changes:

| Detail | Value |
|---|---|
| Run label / evaluator / start time | Pending |
| App URL and deployed commit | Pending — verify it includes SUB-65 |
| Browser, device and viewport | Pending |
| Account's starting state | Pending — empty, demo or existing personal inventory; approximate counts |
| Reset or deployment during evaluation | None unless explicitly agreed; record any change |
| Live text/image/PDF extraction and voice availability | Pending — record availability, never keys |
| Today's UTC calendar date and dates chosen for scenarios | Pending |

Preserve existing records. An empty-account run needs an explicitly agreed empty dataset; if unavailable, label fresh onboarding Not run instead of calling an existing inventory empty. Use the same retained dataset for both return visits. Preview deployments may reseed their demo data: choose a stable evaluation environment and record any reset/redeployment that interrupts continuity.

Use real inputs only with the user's choice. Keep private invoices, account identifiers, audio, screenshots and pasted text out of committed fixtures, public issues and PRs. Record sanitised observations instead. Synthetic fixtures can cover risky edge cases in a separate test dataset. Distinguish live extraction from injected fixture extraction throughout.

A private source checklist can track which categories the user checked or deferred: memory, existing list, email, provider pages, other. Do not copy private source contents into the results.

## First visit: build and improve an inventory

### J1 — Start with remembered names, then try a longer list

User task: “Start your inventory with a few services you remember. Add only what you know.” Measure time from starting to the first saved subscription.

- [ ] Capture three to five names or part of the user's existing list. Recognisable drafts appear in Pending reviews as not added yet; they are absent from All until accepted.
- [ ] Accept at least two incomplete subscriptions. Ordinary new subscriptions display Active without demanding price, renewal date, auto-renewal or reminder choices. Acceptance establishes the displayed status without a second status question or silently confirming unrelated facts.
- [ ] Review and reject a draft if appropriate. Check that it did not create a saved subscription. Account for every supplied name, including anything deliberately rejected or still pending.
- [ ] Open a saved subscription and recognise it in the same workspace. There is no separate Work destination or aggregate totals panel; unknown prices are not displayed as zero.
- [ ] Exercise a live list of at least 25 names, with a few supplied prices/dates and other rows deliberately incomplete. Use a separate synthetic dataset if a real list is unavailable, and label that result. Check the beginning, middle and end for omissions or truncation. Retained input and an actionable explanation allow retry after failure; the deterministic failure checks are in J10.
- [ ] Capture a list explicitly described as current trials, with one future trial-end date and another missing paid terms. Review Trial status and after-trial price labels. Historical trial wording must not force a current Trial status.

For a synthetic long-list run, possible names are Netflix, Spotify, iCloud, Notion, Figma, Dropbox, Audible, Duolingo, Headspace, Calm, Canva, GitHub, Linear, Readwise, Todoist, Strava, YouTube Premium, Disney+, Apple TV+, Mubi, The Guardian, The Athletic, Adobe Creative Cloud, 1Password and Proton Mail. These are test names, not claims about Bhavesh's subscriptions. Use explicit years for supplied dates.

Outcome / first-save time / friction / evidence: **Not run**.

### J2 — Inspect first, then bring information from a source

User task: “Choose a subscription you want to understand better. Find a detail in your email or provider account and add it.” Let the user choose the source and input method.

- [ ] Open the subscription before bringing information. Its conversation clearly targets it. Text, a screenshot, a PDF and a voice input each get a live attempt during the run; record each separately, including unavailable channels.
- [ ] A single plan, price or date can advance the record. Capture produces reviewable changes; it does not immediately overwrite the saved subscription.
- [ ] Filling a missing amount, cadence or plan is ordinary completion without a terms-change interrogation. Unknown unrelated fields can stay unknown.
- [ ] Review evidence and accept only the intended changes. Proposed/inferred fields remain distinguishable from confirmed facts. An old invoice does not invent a current next renewal or create a payment record.
- [ ] Also start from general capture with information about an existing subscription. It reaches the intended holding or asks about ambiguity instead of creating an unwanted duplicate.

| Live channel | Input category, sanitised | Result / corrections / assistance |
|---|---|---|
| Text/list | Pending | Not run |
| Screenshot | Pending | Not run |
| PDF | Pending | Not run |
| Voice | Pending | Not run |

### J3 — Return to questions out of order

User task: “Leave some details for later, then come back and answer an older question.”

- [ ] Produce at least four open questions, then reload. All remain reachable under Open questions, attached to the correct subscription/draft.
- [ ] Select an older price question and answer tersely, for example “£12 monthly”. The answer belongs to that question's target, not the latest global capture.
- [ ] Defer a different question, switch context, and return. Deferral has not deleted it.
- [ ] Distinguish an answer that has produced a pending proposal from an accepted change. Rejecting or failing to apply that proposal must not silently erase unresolved work.
- [ ] Correct a misread provider on a draft with a question. Reopen it and check that the question and conversation follow the corrected identity without duplicated replies.

Outcome / target checked / deferred question / evidence: **Not run**.

### J4 — Review exactly what changed

Use a synthetic record where necessary to avoid altering real history just for testing.

- [ ] Correct a provider and separately confirm an amount. Each action affects only its intended fields; cadence, dates and auto-renewal keep their prior trust unless explicitly confirmed.
- [ ] Save an unchanged form and then a notes-only edit. Neither reconfirms unrelated facts. An explicit confirm can confirm an unchanged value.
- [ ] Edit several proposed fields and inspect the final values, currency and trust before accepting. Reject another update and verify saved facts are unchanged.
- [ ] Fill a missing term without a terms-change question. Replace a known term as a correction, then record an actual terms change with an explicit past effective date. The distinction and prior history remain visible.
- [ ] Exercise a mixed edit that completes one field and changes another while preserving unrelated history and trust.

Outcome / corrections required / history observed: **Not run**.

### J5 — Recognise one holding without merging different ones

Use synthetic cases for ambiguity and concurrent acceptance.

- [ ] Repeat information about the same pending subscription. It consolidates into the intended draft, retaining evidence; it does not become a row per capture.
- [ ] Exercise ChatPRD provider/plan ambiguity and a Mobbin voice misreading, then correct the provider on the card and choose an existing holding where appropriate. It becomes the intended update without deleting or merging saved holdings.
- [ ] Use two accounts with the same provider. Ambiguous input or a previously unseen account asks rather than silently choosing an existing account. Clearly distinct holdings stay distinct.
- [ ] Review in two browser tabs, change the target or proposal in one, then attempt the old acceptance in the other. A stale review produces a recoverable refusal/refresh, not an overwrite. Repeated acceptance does not create a second holding.

Outcome / identity and evidence checked: **Not run**.

### J6 — Switch context and keep your place

- [ ] Type unsent text for subscription A, open B, change filters and reload; return to A. The unsent text and conversation target recover correctly without being sent to B.
- [ ] Try All, Pending reviews, Open questions and Reminders. Counts are rows, not messages. Relevant context is highlighted on the subscription; filters do not change its lifecycle status.
- [ ] Resolve the last matching reason on an open row. The result stays visible until closing the row or changing context. Accepting a draft keeps the resulting subscription accessible.
- [ ] Search, sort and use a lifecycle-status filter. Open an old inbox/ledger/detail link and check that it reaches the corresponding workspace context.
- [ ] Repeat key review, question and draft-recovery interactions at a narrow/mobile width. Controls, focus and target remain understandable without clipped actions. Check keyboard navigation too.
- [ ] Give a selected subscription's composer information that clearly concerns another provider. The target mismatch is clarified rather than silently applied to the wrong holding.

Outcome / desktop and mobile evidence / assistance: **Not run**.

### J7 — Understand trials, schedules and reminder consent

- [ ] A current free trial can have unknown paid terms. Known amount/cadence are labelled after trial, not a current zero charge. Trial end and subscription end remain distinct.
- [ ] A price-only update preserves an existing Trial or Cancelled status. Date passage alone does not activate, cancel or confirm a trial.
- [ ] Cadence does not establish auto-renewal or reminder consent. Renewal and trial reminder preferences are independent; unset, off and enabled are distinguishable.
- [ ] Suggestions are only suggestions: weekly/monthly renewal off, yearly one calendar month before, trial three calendar days before. Explicit adoption is needed; later cadence edits do not replace an existing choice.
- [ ] A captured reminder instruction is pending until accepted. Unknown target dates produce no dated notification.
- [ ] An eligible reminder remains visible after opening it, with no dismiss/snooze/mark-read-to-remove. Its occurrence and date basis are understandable. Expiry boundaries are exercised by J10 without waiting for or altering real dates.

Outcome / consent and date basis checked: **Not run**.

## Two return visits

These must be two actual later sessions on the retained evaluation dataset, not two reloads or clock simulations. Agree practical times with the user, for example the next day and after another ordinary gap. No scheduled automation or external notification is required. Deterministic time tests complement these visits; they do not replace them.

### J8 — First return: resume unfinished work

Before leaving, retain one pending update, one deferred question and one unsent draft.

- [ ] Record the return date, deployed commit and whether the dataset changed or reset.
- [ ] Find and resume the outstanding work without repeating the original evidence. Record time to resume and any assistance.
- [ ] Bring one newly found fact, review it in the correct context, and leave another uncertainty unresolved if appropriate.
- [ ] Check that evidence, deferred questions, conversation and draft recovery survived the interruption. Record what felt natural and what was hard to locate.

Outcome / return time / reset / evidence: **Not run**.

### J9 — Second return: keep the inventory useful

- [ ] Record a separate later session and verify continuity of the same records and history.
- [ ] Inspect a confirmed auto-renewing active holding. If its stored date has passed, an eligible expected date is separately labelled; the recorded date/trust are unchanged and ordinary recurrence does not demand routine reconfirmation.
- [ ] Real uncertainty remains reachable in Pending reviews: unknown/off auto-renewal with a passed date, a passed trial end or an unusable schedule. Unknown timing can remain unresolved with notes.
- [ ] On synthetic data, report an actual cancellation with a past end date, then a reactivation with stated timing. Keep the holding identity and truthful history; do not silently use today or a stale renewal date as the cancellation date. If the end date is unknown, leave it unresolved.
- [ ] Report an actual trial continuation where applicable. Passing the trial end alone must never perform this action.
- [ ] Ask whether maintaining this inventory is easier than the previous method, what sources still need checking, and whether another visit would be useful. Record any developer intervention needed.

Cancellation intentions and reminders to perform a future cancellation belong to SUB-64 and are not a missing step here.

Outcome / return time / continuity / usefulness / evidence: **Not run**.

## J10 — Implementer verification

The implementer runs these checks; the human does not need to read code. Record the commit, command, result and any skipped suites. Passing automation is not a live extraction or usability pass.

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

Follow [README: Tests](../README.md#tests). `npm test` starts its throwaway Postgres when appropriate. It must remain **unseeded**; never point `npm run db:seed` at it. Do not use a personal/evaluation database for automated tests. A seeded test database can make integration suites report skipped while the overall command exits successfully: inspect the report. A preview deployment can migrate/reseed its demo database, so record its effect before calling a visit continuous.

| Check | Evidence to inspect |
|---|---|
| Bulk capture, missing terms, Active/Trial interpretation | Onboarding and status journey suites; every supplied item accounted for |
| Misreads, repeats, accounts, stale/double accept | Identity journey suite; evidence and transactional identity checks |
| Persistent target, older questions, deferral | Capture conversation/question integration suites plus real browser recovery |
| Contextual filters, counts, retained open outcome, legacy links | Workspace list/view tests plus desktop and mobile browser observations |
| Independent field trust, correction vs actual change | Field review and subscription/proposal API integration tests |
| Returns, original dates and lifecycle | Return journey and schedule/projection tests |
| Consent, independent preferences and expiry | Reminder integration, date and notification tests |
| Live extraction failure recovery | Extractor/API tests for truncation, malformed/empty replies and file/audio errors; live channel table remains separate |
| Paid-commitment coverage retained by API | Coverage and summary API tests: missing/non-GBP omitted, trials after-trial, confirmed/unconfirmed split; no primary totals panel is required |

Explicit time checks must establish:

- [ ] For a due date of 15 October and one-month lead, the occurrence is absent on 14 September, visible 15 September through 15 October, and expired on 16 October. Record the fixture year and UTC calendar dates.
- [ ] Trial reminders expire after trial end. A later recurring occurrence has its own identity/window; a long lead can make the next occurrence eligible without preserving an expired one.
- [ ] Month subtraction clamps 31 March to 28/29 February. Recurrence from a 31 January anchor reaches February's last day and then 31 March, avoiding cumulative drift.
- [ ] Schedule projection requires Active plus confirmed yes auto-renewal, confirmed cadence and confirmed recorded date. Trial, paused, cancelled and cancel-scheduled rows do not receive unlimited active schedules; unknown/off or unusable schedules do not invent expected dates.
- [ ] Reads and expiry write no money, dates, preferences, amendments or events. Expiring a reminder does not hide unrelated unresolved work or change lifecycle.

Also verify session isolation and rejection of another user's capture/proposal/holding target using synthetic accounts. Keep private files and vendor credentials out of browser output, committed fixtures and reports.

Automation / browser evidence / skipped or blocked checks: **Not run**.

## Result record

Copy one record per session into a sanitised SUB-63 evaluation note. Leave unobserved checks Not run; link defects and retests rather than overwriting their history.

```text
Run / visit / evaluator:
Date, app URL and deployed commit:
Browser / viewport:
Starting state and any reset/redeploy:
Live channels available (no keys):
Journey IDs and outcome (Pass / Friction / Fail / Not run):
Task attempted:
Expected / observed:
Time to first saved subscription or resumed task:
Correction effort (edits, retries, navigation help):
Sources checked / deferred (categories only):
Sanitised screenshot or API evidence:
Blocker issue / retest result:
Next visit or remaining checks:
```

## Human sign-off gate

- [ ] Initial onboarding, a 25-name list and current-trial list have recorded outcomes.
- [ ] Live text/list, screenshot/PDF and voice capture were observed; fixture-only evidence is clearly distinguished.
- [ ] Review, identity, question recovery and desktop/mobile journeys have evidence.
- [ ] Two separate return visits retained the same dataset and have recorded outcomes.
- [ ] Automated checks and deterministic boundaries passed on the recorded commit without unexplained skips.
- [ ] No unresolved blocker prevents the core journeys; fixes have linked issues/PRs and retests. Any accepted limitations are explicitly named by the human.
- [ ] Bhavesh records **SIGN-OFF**, identifying the build and results. Only then mark SUB-63 Done.

A documentation PR or green automated run does not complete this gate. Human validation results are still pending when this guide is first published.
