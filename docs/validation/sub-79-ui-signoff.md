# SUB-79 — compact UI comparison and sign-off

Status: **SIGN-OFF** — 15 September 2026.

Bhavesh accepted the compact UI (SUB-72–SUB-78) and concluded the
[Subscription UI & Interaction Design](https://linear.app/lets-play-match/project/subscription-ui-and-interaction-design-8eda300f9f49)
project. He also signed off
[SUB-80](https://linear.app/lets-play-match/issue/SUB-80/freeze-current-trial-capture-fixtures-so-they-do-not-expire-on)
(already merged as `43624b3`). Remaining observations, including
[SUB-81](https://linear.app/lets-play-match/issue/SUB-81/lead-the-compact-date-column-with-expected-renewal),
are for a later thread and do not reopen this sign-off.

This is a **design-phase sign-off** of SUB-72–SUB-78 against the SUB-71
prototype tasks. It does **not** reopen [SUB-63](https://linear.app/lets-play-match/issue/SUB-63/validate-the-subscription-workspace-with-real-onboarding-and-return).
[SUB-64](https://linear.app/lets-play-match/issue/SUB-64/remember-a-planned-cancellation-and-remind-the-user-to-act) stays excluded.

Unreported comparison-task outcomes are not claimed as passed. His explicit
SIGN-OFF is the closure decision.

## Ownership

| Role | Job |
|---|---|
| Orchestrator | Lead the short task session; record outcomes |
| Bhavesh | Perform the tasks, explain what you understood, sign off |
| Implementer | Working preview, deterministic tests, this sheet |

Core task **failures block closure**. Substantive domain bugs get their own
issue and PR. Do not mark Linear Done from a green CI run.

## Starting conditions

| Detail | Value |
|---|---|
| Evaluator | Bhavesh |
| App | http://localhost:3000/workspace and http://localhost:3000/ui-foundations |
| Login | `SEED_EMAIL` / `SEED_PASSWORD` (defaults `seed@example.com` / `subscription-preview`) |
| Branch start commit | `e81f6a1` (SUB-78 merged to `main`) |
| This PR commit | SUB-79 documentation branch (this record); product build `43624b3` |
| UTC calendar date of agent prep | 15 September 2026 |
| Compact-list fixture date | 14 September 2026 (synthetic; no private evidence) |
| Prototype baseline | [Integrated differences v6](https://www.magicpatterns.com/c/c43nasqwufyxo1rqzizqci), artifact `2ef1d750-8e1d-4627-8d77-4279b089b24a`, recorded in [subscription-ui-interaction-review.md](../subscription-ui-interaction-review.md) |
| Prototype timings | **Not recorded.** The SUB-71 table has Pass/Fail observations only. Do not invent elapsed times for the prototype. |
| Agent write policy | Read-only during prep. The human run may Confirm, Accept, Later, and set reminders |

### Prepare from seed

Reseed the **development** database before this run. That truncates it.

```bash
npm run db:migrate
npm run db:seed
```

`npm run db:seed` prints the SUB-79 fixture list and refuses the Vitest database
(port 5433 / `subscription_records_test`). Sign in with `SEED_EMAIL` /
`SEED_PASSWORD`. Record the reseed in the human notes. Never seed the throwaway
test Postgres.

After a successful seed you should see, among the rest of the demo inventory:

- All includes two **Northstar Notes** rows (Personal and Studio accounts)
- **Harbor Design Library…** Trial, after-trial £18
- **Atlas Learning** Recorded renewal in the past and a distinct Expected date
- **Juniper Cloud** amount Not recorded; **Open questions 1**
- Pending reviews includes **Cedar Audio** twice (Not added yet, personal and family) plus Substack and Northstar Personal’s pending cards

### Dataset note (15 September 2026 live preview, superseded)

A drifted local inventory was inspected before this reseed path existed. Do
**not** use those substitutions if you have just run `npm run db:seed`.

## How to record

Use **Pass**, **Friction**, **Fail**, or **Not run**, with a short observation.
Record elapsed time, clicks or disclosures, hesitation or wrong turns, and your
explanation of the outcome. A coached completion is not an unassisted pass.

Use **synthetic names only** in this file and in the PR: Northstar Notes, Cedar
Audio, Harbor Design Library…, Juniper Cloud, Atlas Learning, Cursor, Substack.
Do not paste live capture text, invoices, or private identifiers.

## Fixture map

After `npm run db:seed`, `/workspace` is the comparison surface. Compact-list
tests and `/ui-foundations` remain the data-free presentation check.

| Need | Seeded `/workspace` | Compact fixture / gallery |
|---|---|---|
| Same-provider accounts | Two Northstar Notes rows: `personal@example.test` and the long Studio email | Same |
| Trial after-trial price | Harbor Design Library…, **After trial**, Trial ends | Same |
| Recorded vs expected date | **Atlas Learning**: recorded 31 Jan (past year), expected next 31 Jan the following year, labelled inferred. Cursor still shows a monthly pair | Compact fixture Atlas used a frozen 31 Jan / 31 Oct pair for the demo; production projects from the recorded yearly date |
| Saved £12 vs proposed £15 | Northstar Personal: saved £12, pending update £15, pending cancellation | Same |
| Confirm amount alone | Northstar Studio: £24 **inferred**, monthly **inferred**, renewal confirmed | Studio was confirmed in the old seed; inferred is the SUB-71 task |
| Incomplete draft accept | Two Cedar Audio **Not added yet** drafts (personal and family). Personal has no proposed renewal | Same |
| Missing amount | Juniper Cloud, Not recorded | Same |
| Reminders Not set | Juniper and Northstar Personal: Not set; suggestion not applied | Same |
| Asked question to Later | Juniper amount question, Open questions **1** | Gallery still has deferred copy |
| Empty / mismatch / keyboard | Open a filter with no rows if needed; `/ui-foundations` | SUB-78 viewport table in [ui-foundations.md](../ui-foundations.md) |

## Comparison tasks

Reset is **not** required beyond the reseed above. Compare each task with the
prototype column from the SUB-71 review. Fill the human columns during the
session.

Legend for **Agent evidence**: tests and read-only inspection. Not human
sign-off. Not an accessibility audit. Not live extraction quality.

### Identity, trial, dates

| Task | Prototype (SUB-71) | Production expected | Agent evidence | Human | Time / clicks / notes |
|---|---|---|---|---|---|
| Identify Northstar Personal vs Studio | Pass: accounts visible before opening; identities stay separate | Same. Production enumerates **every** compatible holding and never picks the first (justified deviation from the prototype’s single-match shortcut) | `lib/workspace/row-presentation.test.ts`, `components/workspace/subscription-row.test.tsx`. Live 15 Sep: both accounts on collapsed rows; opening Personal keeps `personal@example.test` in the heading | | Prototype time: not recorded |
| Correct provider or account | Pass in v6 for Personal→Studio: explicit choice; saved identity unchanged | Explicit target and review; never silent merge. Same holding / Keep separate in the demo is **not** the production writer; matching/retarget remain authoritative | Contract in [subscription-ui-interaction-review.md](../subscription-ui-interaction-review.md). Agent did not run a live identity write | | |
| Recognise trial after-trial price | Covered in compact-row work; Harbor is the synthetic long name | Amount is the paid plan **after trial**, labelled that way. Missing paid terms stay unknown. No confirmed zero because the trial is free | `row-presentation.test.ts` (`afterTrial: true`). Live Harbor: Trial · Professional, £18 After trial · Monthly, Trial ends 28 Sep 2026 | | |
| Inspect recorded vs expected dates | Compact fixture Atlas | Stored date stays. Expected is a separate inferred label, not written back. Do not treat a past stored date as cancelled | `row-presentation.test.ts` (fixture 31 Jan vs 31 Oct). Seed Atlas: recorded last 31 Jan, expected the next 31 Jan (`projection.test.ts`). Cursor remains a monthly pair | | |

### Saved vs proposed, confirm, notes, terms, draft

| Task | Prototype (SUB-71) | Production expected | Agent evidence | Human | Time / clicks / notes |
|---|---|---|---|---|---|
| Explain saved vs proposed Personal price | Pass: £12 saved; £15 proposed and not applied. V2+ asks correction vs actual change; actual change needs an effective date | Same writers. Confirm on a **saved** field writes that field; confirm on a **proposal** stages until accept | `open-subscription.test.tsx` (pending update £15 + pending cancellation). Seed restores both cards on Northstar Personal | | |
| Confirm amount alone | Pass: Studio £24 Inferred→Confirmed; cadence stayed Inferred; date stayed Confirmed | Confirming amount confirms **exactly** amount | `form-values.test.ts`, `review.test.ts`. Seed Studio amount and cadence are **inferred** | | |
| Save only a note | Pass: note saved; trust unchanged | Notes-only patch must not send amount/cadence/date/reminders | `lib/subscriptions/api.integration.test.ts`, `form-values.test.ts` notes-only cases. Agent did not save notes | | |
| Fill missing terms | Ordinary completion, not a terms-change interrogation | Filling Juniper’s empty amount/cadence/plan is completion. Replacing a known term still asks correction vs actual dated change | `form-values.test.ts` blank-amount completion vs price-change intent | | |
| Correction vs actual dated terms change | V2+ blocks actual change without a user-entered effective date | Same. Trial after-trial terms keep the ordinary-edit rule | `form-values.test.ts` (`Say whether this is a correction…`, refuses terms change with no date) | | |
| Accept incomplete Cedar draft | Pass on v4: Proposed draft on the row; after accept, renewal missing, amount/cadence proposed, plan saved as supplied | Same coherent surface. No forced completion, no inferred zero. Completing work that drops Pending reviews **keeps the row open** until Close (SUB-65) | `open-subscription.test.tsx` Draft details / Proposed draft. Seed: two Cedar drafts; Personal has no proposed renewal. Family is a second account, not a substitute | | |

### Reminders, questions, recovery, viewport

| Task | Prototype (SUB-71) | Production expected | Agent evidence | Human | Time / clicks / notes |
|---|---|---|---|---|---|
| Find and set a reminder from an open row | Pass: Juniper Enabled 3 days; missing date yielded no reminder date; trial stayed Unset | **One intentional action**: **Reminders** jump on a saved row. Not set / Off / Enabled are distinct. Renewal and trial-end independent. Suggestions are not consent. No dismiss/snooze | `open-subscription.test.tsx` `href="#reminders-…"`. `reminder-preferences.test.tsx` Not set vs Off vs Enabled; no Dismiss/Snooze. Live Personal: Conversation and Reminders links before Saved terms; renewal Not set; **Use this suggestion** present and not applied. Agent did not click it | | |
| Later then resume a question | Pass: Deferred — still available here; Answer focuses the composer | Deferral does not delete. Open questions count is rows | `conversation-view.test.ts`, `capture-composer.test.tsx`. Seed: Juniper amount question is **asked** so you can Later, then resume | | |
| Navigate away and return with unsent text | Pass for typed text and target | Target-specific draft and selection preserved. Exact scroll/focus restoration was left to implementation | Agent did not type into the composer | | |
| Complete work under Pending reviews | Pass on v5: count changed; open row stayed until closed | Filter change still **closes** a non-matching row. Acceptance that drops membership keeps the row open with a mismatch notice | `open-subscription.test.tsx` mismatch notice. Seed Pending reviews includes Cedar drafts, Substack, and Northstar Personal | | |
| Simulate failure and retry | Pass for notes; staged-proposal failure left to implementation | Input retained; no false success; no duplicate submit | SUB-78 gallery recovery copy. Agent did not force a failed write | | |
| Keyboard and phone-width layout | 390px no overflow; visible focus; Close returns to the row | Same plus SUB-78: 320px wrap, Conversation jump on small viewports, skip link, empty/error copy. Chrome `resize_page` historically clamped ~500px; use device metrics | [ui-foundations.md](../ui-foundations.md) SUB-78 table: 320/390/768/1280 `scrollWidth` matched viewport. Not a full accessibility audit | Repeat the same core tasks at ~1280 and ~390 | |

### Extra acceptance (not in the 12-task table)

| Check | Expected | Agent | Human |
|---|---|---|---|
| Later session revisit | Same dataset; drafts and selection recoverable | Not run (human) | |
| Live text / file / voice | Representative only if configured. Mocks do not prove extraction quality. Do not quote private input | Not run. Channels available: record below | |
| Domain regressions | No hidden work, lost evidence, proposal duplication, inaccessible controls, expected date written back, auto-confirm of money/dates | See remaining issues. Capture still writes proposals only. Expected date labelled inferred on Cursor | |
| Conflicted / empty / multiple-proposal | Fixtures and gallery | Compact fixture: two Northstar proposals; `/ui-foundations` empty and recovery | |

## Live channels (human)

| Channel | Available? | Result (sanitised) |
|---|---|---|
| Text / list | | Not run |
| Screenshot / PDF | | Not run |
| Voice | | Not run |

## Agent automated evidence (15 September 2026)

Run on throwaway unseeded Postgres (`npm test` / `scripts/test-db.sh`). Never
seeded.

| Check | Result |
|---|---|
| `npm test` | **812 passed, 3 failed** on agent prep (15 Sep, expired `2026-09-14` trial fixtures). Product correctly inferred `active`. Fixed and signed off as [SUB-80](https://linear.app/lets-play-match/issue/SUB-80/freeze-current-trial-capture-fixtures-so-they-do-not-expire-on) (`43624b3`). Not a compact-UI regression |
| `npm run lint` | Pass (15 Sep 2026, this branch) |
| `npm run typecheck` | Pass |
| `npm run build` | Pass |

Presentation tests that passed and map to the tasks include
`row-presentation.test.ts`, `subscription-row.test.tsx`,
`open-subscription.test.tsx`, `reminder-preferences.test.tsx`,
`conversation-view.test.ts`, `capture-composer.test.tsx`,
`form-values.test.ts` (notes-only, amount-only confirm, correction vs terms
change).

## Justified production deviations (already approved in SUB-78)

Do not score these as SUB-79 failures:

- Live ledger vs the six-row prototype demo
- Enumerate all compatible holdings; never pick the first
- Composer after terms in the DOM; **Conversation** / **Reminders** jumps on viewports below `lg`
- Changing a filter still closes a non-matching row; completing work keeps it open until Close
- No SUB-64 planned-cancellation UI
- Tablet widths hide the collapsed-row date column; dates remain on the open row

## Remaining issues

| Item | Severity | Follow-up |
|---|---|---|
| Three capture tests expire when a hardcoded trial end passes | Test hygiene; product behaviour is correct | [SUB-80](https://linear.app/lets-play-match/issue/SUB-80/freeze-current-trial-capture-fixtures-so-they-do-not-expire-on) — **signed off and merged** (`43624b3`) |
| Compact date column leads with recorded rather than expected | Presentation hierarchy | [SUB-81](https://linear.app/lets-play-match/issue/SUB-81/lead-the-compact-date-column-with-expected-renewal) — follow-up; does not block this SIGN-OFF |
| Live inventory drifted from seed (Cedar accepted, Northstar £15 card absent, Open questions 0) | Prep (historical) | Reseed with `npm run db:seed` before the human run |
| Calm still displays **Trial** with trial end 10 Sep 2026 (already passed) | Domain: time passing does not convert trial→active. Inbox still asks “still holding it?” | Observe only unless a new issue is warranted |
| Prototype elapsed times | None recorded | Do not invent |

## Human SIGN-OFF gate

**SIGN-OFF** recorded 15 September 2026 against product build `43624b3`
(SUB-78 compact UI plus SUB-80 fixture freeze). Bhavesh also concluded the
Subscription UI & Interaction Design project. Unchecked items below were not
individually written up; they are not claimed as passed.

- [ ] The twelve comparison tasks have recorded human outcomes (or an explicit Not run with reason).
- [ ] Account identity, after-trial price, and recorded vs expected dates were inspected on production.
- [ ] Saved vs proposed, amount-only confirm, notes-only save, missing-term fill, correction vs dated terms change, and incomplete Cedar accept were attempted.
- [ ] Reminder editing opened with one intentional action; Not set / Off / Enabled and independent renewal vs trial-end were explained.
- [ ] Questions (Later then resume on Juniper), draft preservation, failure recovery, and desktop + phone-width were attempted.
- [ ] Live capture channels are recorded as run or unavailable; mocks are not treated as extraction quality.
- [x] Remaining issues above are accepted or have their own Linear issues. SUB-64 remains out of scope. SUB-80 signed off; SUB-81 is a follow-up.
- [x] Bhavesh records **SIGN-OFF**, identifying the build. Only then mark SUB-79 Done.
