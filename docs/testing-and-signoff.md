# Testing and sign-off

You do not implement. You verify behavior (Vercel **preview** per PR, or local `npm run dev` with seed login), then comment on Linear and merge.

## What this document is

A list of **acceptance checks**: proof that the system does what it claims,
grouped by the scenario each group protects.

It is not a list of jobs to be done. A job is the progress a person is trying
to make; a check is a fact about the software. Every check below could pass
while the product still fails its user — nothing here confirms that anyone
avoided a charge they did not want, decided what to cut, or got started from
an empty ledger. Read this document as a regression net, not as evidence the
product is worth using. See [What these checks do not cover](#what-these-checks-do-not-cover).

## How to sign off a PR

1. Log in with seed credentials from the PR body (`SEED_EMAIL` / `SEED_PASSWORD` on local and Preview).
2. Run the **checks** below that the issue could have broken — not every group every time.
3. If broken: Linear comment with steps, expected vs actual, screenshot. Leave the issue In Progress.
4. If good: comment `SIGN-OFF` and squash-merge (or merge yourself).

Seed login is off in Production. Production is your real inventory; do not seed it.

---

## Acceptance checks

Use a seeded database (`npm run db:seed`) unless the check says otherwise.

The Inbox-workbench contract has landed in full. Every gate below is live on
`main` — none of them are waiting on an unshipped Inbox-workbench issue.

The **stage-one contract** is published (SUB-42) in [AGENTS.md](../AGENTS.md)
and [product.md](product.md). Its behaviors land in SUB-43–SUB-51. Until those
issues ship, the checks below still describe `main`. Stage-one human journeys
live in [stage-one-acceptance-scenarios.md](stage-one-acceptance-scenarios.md)
and are added to sign-off as each issue lands — do not treat them as live
gates for a PR that did not implement them.

### See what I pay for

The list is trustworthy and includes incomplete rows.

- [ ] `/ledger` defaults to **holding** rows (The Athletic is hidden until **All** or **Cancelled**)
- [ ] Summary active count and paid-commitment monthly equivalent match a spot-check of 2–3 rows (terms, not a sum of charges)
- [ ] Search `net` shows Netflix, hides Spotify
- [ ] **Holding** hides the cancelled seed row
- [ ] The ledger has no **Needs attention** chip; Headspace's overdue date and Disney+'s unknown stub show up in `/inbox`'s overdue and unfinished sections instead
- [ ] Sort by next renewal; blank renewals at the end
- [ ] Refresh keeps `?q=` / filters in the URL
- [ ] An **inferred** amount on detail is inferred, not confirmed
- [ ] The cancelled row still opens from All or Cancelled
- [ ] Netflix or Spotify detail **Activity** has no “Charged” line
- [ ] `GET /api/subscriptions/:id` has no `charges` field
- [ ] `GET /api/subscriptions?q=net` lists the same providers as the UI

**Fail if:** empty table after seed, money shown as floats (`6.9900001`), search disagrees after reload.

### Explain spend coverage and keep trials out of the paid total

The `/ledger` summary names a recorded GBP paid-commitment monthly equivalent. Seed login.

- [ ] The paid-commitment figure is labelled as recorded GBP, not as actual payments or a complete budget
- [ ] Adobe's inferred £59.99 is in **Unconfirmed**, not Confirmed. Confirming it on the card/detail moves it only after an explicit confirm — a notes-only edit does not
- [ ] Canva's £10.00 after trial and Calm's stated paid plan are **After trial**, not in the current paid total. Notion's missing paid-plan price stays unknown, not £0.00
- [ ] The Economist (missing amount) and The Washington Post (USD) are omitted, not treated as £0.00. There is no converted USD figure in the GBP total
- [ ] Confirmed + unconfirmed equals the paid-commitment total. After-trial does not
- [ ] The Unconfirmed, After trial, and Omitted links list Adobe, the trial rows, and The Economist + The Washington Post respectively. Opening a row explains the classification
- [ ] `GET /api/subscriptions/summary` has `label`, `coverage.confirmed`, `coverage.unconfirmed`, `coverage.afterTrial`, and `coverage.omitted`, and `monthlyEquivalentMinor` excludes Canva and Calm

**Fail if:** a trial's paid-plan price sits in the current paid total; missing price or USD is shown as £0.00; the total is described as spend or payments.

### Add something without a known price

A stub saves without every field; money the user sets is **confirmed**.

- [ ] Add provider `SignoffCo` with no price; it appears in the list
- [ ] Set £4.00 monthly on that row; detail shows **confirmed**
- [ ] Saving is not blocked on renewal or other empty fields

**Fail if:** you must complete every field to save.

### Record a free trial and auto-renewal by hand

Manual create/edit on `/ledger/new` and `/ledger/[id]`. Seed login. Notion is a trial with trial end and unknown paid terms; Canva is a trial with a stated paid plan; Netflix auto-renews; GitHub yearly does not.

- [ ] Add provider `TrialSignoffCo` with status **Trial**, trial end a future date, no amount. It saves. Detail shows **Trial ends on** with that date **confirmed**, **Ends on** empty, **Amount after trial** missing, **Auto-renewal** unknown
- [ ] Edit that row: set amount £10.00 monthly. Saving does **not** ask whether this is a correction or an actual terms change. Detail labels amount and cadence **after trial**. Auto-renewal stays unknown
- [ ] Set auto-renewal to **Yes**, save. It is **confirmed**. Change cadence to yearly: auto-renewal stays **Yes**
- [ ] Open Notion, edit only notes, save. Trial end stays **proposed** with the same date; auto-renewal stays unknown; amount stays empty
- [ ] Canva detail shows **Amount after trial** £10.00 and a trial end, with next renewal empty
- [ ] Netflix auto-renewal is **Yes**; The Athletic is **No**; GitHub (yearly) is **Unknown**
- [ ] `GET /api/subscriptions/:id` for Notion includes `trialEndsOn` and `autoRenewal`, and does not put the trial end on `nextRenewal` or `endsOn`

**Fail if:** saving a name-only row requires trial end or auto-renewal; cadence sets auto-renewal; a notes-only save confirms trial end; amount on a trial is labelled as a current charge; trial end is stored as `ends_on` or `next_renewal`; filling trial amount or cadence asks correction versus terms change.

### Edit without manufacturing trust or erasing history

Manual edits on `/ledger/[id]/edit`. Use Adobe (inferred amount/cadence/date) and a confirmed row such as Netflix. Seed login.

- [ ] Open Adobe, edit only the notes, save. Amount, cadence and next renewal stay **inferred** with the same values
- [ ] Reopen Adobe and save without changing anything: the form refuses “No changes to save” (or sends nothing that confirms money/dates)
- [ ] On Adobe, tick **Confirm this amount** and save. Amount becomes **confirmed**; cadence and date stay inferred
- [ ] On Netflix (or another confirmed price), change the amount, choose **Correction**, save. Detail shows the new confirmed price; there is still one open amendment and no “Terms changed” activity line
- [ ] Change the amount again, choose **The price or plan actually changed**, set an effective date in the past, save. Detail shows the new price; Amendments lists the prior terms closed the day before; Activity has **Terms changed**
- [ ] Start that terms change, then **Cancel** out of the form (do not save). Price and amendments are unchanged — that is rejecting the change
- [ ] Set a holding row’s status to **Cancelled**, set Ends on to a past date, save. The same id remains, next renewal is empty, Activity has **Cancelled**, the open amendment is closed
- [ ] On that cancelled row, set status back to **Active** and save. Same id, Activity has **Reactivated**, a new open amendment, Ends on is empty

**Fail if:** a notes-only save confirms money or dates; a correction wipes prior terms; a terms change has no effective date; cancel deletes the row or skips the cancelled event.

The Inbox overdue **Cancelled** shortcut reviews the actual end date. If you do not know when it ended, leave it unresolved and add a note.

### Set independent reminder preferences by hand

Manual create/edit on `/ledger/new` and `/ledger/[id]`. Seed login. Netflix starts **unset**. GitHub, Cursor, The Guardian, Oddbox, Notion, and Calm have enabled seed preferences so Inbox **Reminders** is not empty.

- [ ] GitHub detail shows renewal reminder **Enabled · 1 month before**. Netflix (monthly, unset) suggests **off**. Notion shows an enabled trial-end reminder
- [ ] On Netflix, enable a one-month renewal reminder, save. Detail shows **Enabled · 1 month before** and a dated Inbox preview. `GET /api/subscriptions/:id` has `reminderPreferences.renewal.state` `enabled`
- [ ] Change Netflix cadence to yearly (correction). The stored reminder stays enabled; the suggestion updates to one month
- [ ] Turn that reminder **Off**, save. Detail shows Off, distinct from Unset. Then set Unset: the row is gone and the suggestion is shown again
- [ ] On a trial, enable the three-day trial-end reminder without a paid price. It saves. Auto-renewal stays unknown
- [ ] A provider-only row can enable a reminder with no date: preview says Inbox cannot show a reminder yet
- [ ] Notes-only save does not write a reminder row. There is no dismiss control on Inbox

**Fail if:** migration or seed backfills consent; cadence overwrites a stored choice; unset and off look the same; saving requires a reminder; Inbox grows a dismiss button.

### Capture from Inbox without it deciding money

Messy text becomes proposals. The ledger does not change until accept. A second mention of the same service is not a second row.

- [ ] Opening `/inbox` does not greet you with a still-holding question about Headspace; Headspace's overdue date is a row in Inbox's overdue section instead. One follow-up per capture turn, about that turn, is fine
- [ ] “I subscribed to SignoffChat” → proposal card; `/ledger` unchanged until Accept
- [ ] Accept identity only → row exists; amount empty or **proposed**, not confirmed unless you typed a price
- [ ] Paste four names → four proposals
- [ ] “Netflix” again → **update** (or match notice), not Netflix #2
- [ ] “I’ll tell you the price later” → the next turn does not immediately re-ask that question
- [ ] Capture three name-only services in separate sends. Reload `/inbox`. **Questions** lists all three. Answer an older price question with “£12 monthly” → a pending proposal for that service, not a guess at the latest one. Later on another leaves the first’s proposal in place. There is no dismiss on a question.

**Fail if:** a price is **confirmed** without you setting it; a question vanishes on reload; a bare “later” with several open questions silently targets the newest.

### Capture trial, auto-renewal, and reminder preferences

Capture writes pending proposals only. Seed login. Use the Inbox composer. Name the service.

- [ ] “Canva trial ends 14 September, then £10 monthly; auto-renew is on” (use a year that makes 14 September a future date, or ISO `2026-09-14`) → card shows **Trial**, **Trial ends on**, amount/cadence **after trial**, auto-renewal **Yes**, all **proposed**. Ledger unchanged until Accept. Accept without confirming → detail keeps those fields proposed; next renewal and Ends on stay empty
- [ ] Confirm trial end or auto-renewal on the card while accepting → those fields become **confirmed**; untouched money stays proposed
- [ ] “BareTrialCo trial ends 2026-09-20” with no price → Accept works. Amount after trial stays missing
- [ ] “Remind me one month before GitHub renewal” → **Update** on GitHub, not a new row. Ledger reminder still Unset until Accept. Accept → Enabled · 1 month before
- [ ] Same reminder message again while the first card is pending → no second card
- [ ] “Turn the GitHub reminder off” → Accept → Off, not Unset
- [ ] “Remind me one month before UnknownReminderCo renewal” → no new holding; a notice says to add it first
- [ ] A paid-trial sentence is labelled as outside the model on the card rather than rewritten. Reject and recapture, or edit by hand, still works
- [ ] Reject a trial card → no ledger row. Inbox still has no dismiss control

**Fail if:** capture writes the ledger before accept; trial end lands on `next_renewal` or `ends_on`; auto-renewal is confirmed without a card confirm; a reminder is stored before Accept; a reminder-only capture creates a new holding.

### Record a receipt without storing a payment

A receipt updates holding, cost, and next due on the matched row, not a charge.

- [ ] “Paid [seed Spotify] £10.99 today” → terms/schedule card (not Charge); `/ledger` unchanged until Accept
- [ ] Accept → Spotify detail has no new charge on the timeline; amount is not auto-confirmed
- [ ] The same message again → still one Spotify, no second terms card while the first is pending
- [ ] “Paid [seed Spotify amount] today” → match notice, no new row, no new charge

**Fail if:** a second subscription appears, or a new charge is written from a capture.

### Change a price without losing the old one

A hike waits for accept; history keeps the previous terms.

- [ ] Accept a Netflix (or similar) price increase → detail shows the new price; the old amendment still has dates
- [ ] Reject a hike → confirmed price unchanged

**Fail if:** history is wiped or the confirmed price changes on reject.

### Stop paying without deleting the record

Cancel keeps identity. Vague language does not auto-cancel.

- [ ] Cancelled row still in **All**, gone from **Active**
- [ ] Cancel at period end vs now matches what you chose (`cancel_scheduled` still has `ends_on`)
- [ ] “I don’t use it” does **not** mark cancelled

**Fail if:** the row is deleted, or “I don’t use it” cancels.

### Come back to a cancelled service

Resubscribe reuses the same id.

- [ ] Cancel then resubscribe the same provider → **one** id (`reactivated`), not #2

**Fail if:** a second identity is created.

### Capture from a file or voice as proposals

A screenshot, PDF, or recording becomes cards that can be rejected. Files stay private.

- [ ] Screenshot → proposals, not a silent ledger write
- [ ] Reject all → ledger unchanged
- [ ] The object is not publicly listed (no unsigned GET of the file)
- [ ] Short selectable-text PDF → candidates
- [ ] Record “add Notion” → Notion proposal (needs `GROQ_API_KEY`)
- [ ] Second click stops recording; denying the microphone is visible, not silent

**Fail if:** the ledger updates before accept, or a receipt URL is public.

### Inbox shows what is waiting

One work list, not a ledger to scan for problems.

- [ ] `/inbox` shows **Proposals**, **Overdue**, **Unfinished**, and **Reminders**, and hides any section with nothing in it. There is no **Renewing soon**
- [ ] Headspace is under **Overdue** with its stored past date; Disney+ is under **Unfinished**; **Calm** (passed trial end) is under Overdue; **Cursor** is **not** under Overdue
- [ ] **Reminders** has The Guardian (yearly, one-month lead), Cursor (expected date, inferred), Oddbox (weekly, you asked), and Notion (trial end). It does **not** have Netflix (no consent), Spotify, or GitHub (enabled but still upcoming)
- [ ] No dismiss, snooze, or scan buttons anywhere on `/inbox`. Reopening Inbox does not clear a card
- [ ] Inbox copy does not say anything is "not in your ledger yet"

**Fail if:** a row appears in Reminders without an enabled preference, an overdue row is missing from Overdue, a dismiss control appears, or opening `/inbox` changes a stored date.

### Inbox Reminders expire after the due date

Enabled preferences become Inbox cards. There is no dismiss. Expected dates stay labelled inferred.

- [ ] Cursor (expected next renewal) is under **Reminders** with **Inferred / expected**. `GET /api/inbox` has `reminders[].basis` `expected` and does not include `renewingSoon`
- [ ] GitHub is **not** under Reminders (enabled, but the window has not started). Enable a 2-month lead on GitHub, save, return to Inbox: GitHub appears. Opening Inbox does not clear it
- [ ] Calm's trial-end reminder is gone; Calm stays **Overdue** and still `trial`
- [ ] There is no dismiss, snooze, clear, or mark-read control. Reopen Inbox: the same cards are still there
- [ ] On Cursor detail, the reminder preview agrees with the Inbox due date

**Fail if:** Netflix appears without an enabled preference, Cursor's stored June date is used as the reminder due date, Calm converts to paid, or a dismiss control exists.

### A passed due date stays put until the user acts

An overdue renewal is handled by the user in Inbox. There is no `lapsed` status — silence never cancels — and nothing rolls the date, because nothing runs unless asked.

- [ ] Nothing unattended raises any proposal for an active row whose renewal is overdue — there is no unattended anything
- [ ] That row's stored `next_renewal` stays exactly as stored (no roll, no substituted future date in the same field) on `/ledger`, `/ledger/[id]`, and `GET /api/subscriptions*`, and appears in `/inbox`'s **overdue** section. An expected date may appear **beside** it on a qualifying auto-renewing row; it must not replace the stored field.
- [ ] From Inbox, **still have it** on Headspace rolls `next_renewal` forward by cadence as **inferred** (never confirmed) and the row leaves Overdue; **cancelled** asks for the actual end date (or “I don't know”) and does not silently use the stored renewal
- [ ] Capture “I cancelled Netflix three months ago” → accept → cancelled with a past `ends_on`, no next due

**Fail if:** anything auto-cancels, proposes or sets `lapsed` from silence, confirms a date without the user setting it, or rewrites a stored `next_renewal` without you asking.

Capture "my Spotify expired" or "the card failed" and it proposes **cancelled**, not a third status: accepting it ends the row, keeping its identity and its history.

### Expected renewals without routine confirmation

Confirmed auto-renewing holdings stay useful after the stored date passes. Inbox still asks about unknown auto-renewal, unusable schedules, and passed trial ends.

- [ ] Cursor (confirmed auto-renew yes, recorded date several cycles ago) is on `/ledger` with the **stored** past date still visible and an **expected** date labelled inferred. `/ledger/[id]` shows both. `GET /api/subscriptions/:id` has `expectedNextRenewal.basis` `expected` and the stored `nextRenewal` unchanged
- [ ] Opening `/inbox` does not put Cursor in Overdue. Headspace (auto-renewal unknown) stays Overdue. Calm (trial end in the past) is Overdue and is still `trial` — it did not become paid
- [ ] Sort by next renewal and a 30-day renewing-within filter agree with the expected date on Cursor, not the stale stored date
- [ ] Summary “next renewal” can use an expected date and says so
- [ ] On Cursor detail, enabling a renewal reminder previews against the **expected** date, not the past stored date
- [ ] Inbox **Cancelled** on Headspace: leave the date blank and choose **I don't know when** with a note → still Overdue, note saved, not cancelled. Then Cancelled with a stated past date → cancelled on **that** date, not the stored renewal
- [ ] Opening `/inbox` and `/ledger` does not change stored dates, amendments, or events

**Fail if:** the stored date is replaced by the projection, Cursor appears in Overdue, a trial converts to paid because the end passed, or Cancelled writes `ends_on` without you stating a date.

---

## What these checks do not cover

Named so nobody mistakes a green run for a working product. None of these are
defects in the checks above; they are absences in what is being checked.

- **Nothing is verified about the user being warned in time.** A renewal can pass unnoticed and every check still passes, because nothing notifies outside an open `/inbox`.
- **Nothing is verified about deciding.** No check asks whether the user could tell what to cut, or what a subscription costs against what they get from it.
- **Nothing is verified about following through.** A decision to cancel that never becomes an actual cancellation is recorded as faithfully as one that did.
- **Nothing is verified about getting the data out.**
- **Nothing is verified about real extraction.** The journey suites below inject the labelled fixture extractor. Passing them says the pipeline is wired correctly; it says nothing about whether Claude or Whisper reads a real statement well. That is [SUB-51](https://linear.app/lets-play-match/issue/SUB-51/complete-real-onboarding-and-human-stage-one-sign-off), by hand, with real services.

Two entries left this list in SUB-50, and are now covered by `lib/journeys/`:

- ~~Nothing is verified about starting from zero.~~ `lib/journeys/onboarding.integration.test.ts` runs the whole capture → review → accept path against a user with no holdings at all.
- ~~Nothing is verified about the six-month return.~~ `lib/journeys/return.integration.test.ts` freezes the clock, moves it six months, and covers a price change, a backdated cancellation, a reactivation and an "I don't know".

### Journey suites

`lib/journeys/` holds the cross-module suites SUB-50 added. They differ from the
per-module integration tests in starting from an empty ledger and in driving
whole user journeys through the real routes.

| File | Scenario | What it pins |
|---|---|---|
| `onboarding.integration.test.ts` | [A](stage-one-acceptance-scenarios.md), [B](stage-one-acceptance-scenarios.md), [C](stage-one-acceptance-scenarios.md) | Empty start; capture proposes and never records; accept-as-proposed keeps uncertainty; a captured row is `unknown`, not a live paid commitment; £12.99 monthly + £120 yearly = £22.99; a missing price is an omission, not a zero |
| `identity.integration.test.ts` | [A](stage-one-acceptance-scenarios.md) step 5 | Match before create; two hand-entered accounts stay distinct; **two open reproducers**, below |
| `reminders.integration.test.ts` | [E](stage-one-acceptance-scenarios.md) | One occurrence across all four boundary days; expiry writes nothing; a trial reminder expires without converting the trial |
| `return.integration.test.ts` | [F](stage-one-acceptance-scenarios.md) | Six months of absence writing nothing; terms history; a cancel dated when it happened; reactivation onto the same row |

**Two reproducers are pinned, not fixed.** `identity.integration.test.ts`
records both, and both need an identity rule decided before any code changes:

1. Sending the same capture twice before accepting either card, then accepting
   both, produces two identical holdings. This contradicts a criterion SUB-45
   shipped against.
2. Capture cannot target the account a message names: `matchCandidate` keys on
   `provider_canonical` and never reads `account_hint`.

They pull in opposite directions — matching harder worsens (2), matching on the
account worsens (1) — so one rule has to settle both. Until then, treat a
duplicated capture and a second account at a known provider as known-bad on the
capture path, and enter the second account by hand.

When signing off a stage-one implementation PR, run the issue's test plan plus
any group above that the change could have broken. After SUB-49, the Inbox
group must treat **Reminders** as the glance section and must fail if a
dismiss control appears or if a card remains after the due date. After SUB-43,
editing only a note must leave inferred/proposed money and dates untouched.
After SUB-44, trial end is separate from subscription end and next renewal;
auto-renewal is yes/no/unknown and is not inferred from cadence; amount on a
trial is labelled after trial.
After SUB-45, capture of those facts and of reminder instructions raises pending
proposals; accepting is the user action; old payloads that omit the new fields
must not clear stored trial, auto-renewal, or reminder rows.
After SUB-46, a free trial's paid-plan price must not sit in the current paid
total, and the summary must name a recorded GBP paid-commitment monthly
equivalent with confirmed vs unconfirmed coverage and omissions.

---

## What you can ignore

- Code style nits unless they break the check
- Which component library internals
- Model provider choice if behavior matches `AGENTS.md`

## Never sign off

- Confirmed money or dates without a user action
- Another user’s rows
- Public screenshots of receipts
- A PR that mixes two Linear issues
