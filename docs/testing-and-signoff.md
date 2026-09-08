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

- [ ] `/ledger` defaults to **holding** rows (about 10); The Athletic is hidden until **All** or **Cancelled**
- [ ] Summary active count and monthly equivalent match a spot-check of 2–3 rows (terms, not a sum of charges)
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

The Inbox overdue **Cancelled** shortcut still uses the stored past due date until SUB-48. Do not treat that as a SUB-43 failure.

### Set independent reminder preferences by hand

Manual create/edit on `/ledger/new` and `/ledger/[id]`. Seed login. Existing seed rows start **unset**. Inbox still has Renewing soon, not preference cards.

- [ ] GitHub (yearly) detail shows renewal reminder **Unset** and a suggestion of one month before. Netflix (monthly) suggests **off**. Notion (trial) suggests three days before trial end
- [ ] On GitHub, enable a one-month renewal reminder, save. Detail shows **Enabled · 1 month before** and a dated Inbox preview. `GET /api/subscriptions/:id` has `reminderPreferences.renewal.state` `enabled`
- [ ] Change GitHub cadence to monthly (correction). The stored one-month reminder stays enabled; the suggestion updates to off
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

**Fail if:** a price is **confirmed** without you setting it.

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

- [ ] `/inbox` shows **Proposals**, **Overdue**, **Unfinished**, and **Renewing soon**, and hides any section with nothing in it
- [ ] Headspace is under **Overdue** with its stored past date; Disney+ is under **Unfinished**
- [ ] **Renewing soon** has The Guardian (yearly, ~3 weeks out) and Netflix (monthly, days out), and does **not** have Oddbox (weekly, days out), Spotify (monthly, ~3 weeks out), or GitHub (yearly, ~6 weeks out)
- [ ] No reminder cards, no dismiss buttons, and no scan buttons anywhere on `/inbox`
- [ ] Inbox copy does not say anything is "not in your ledger yet"

**Fail if:** a weekly row appears in Renewing soon, an overdue row is missing from Overdue, or opening `/inbox` changes a stored date.

### A passed due date stays put until the user acts

An overdue renewal is handled by the user in Inbox. There is no `lapsed` status — silence never cancels — and nothing rolls the date, because nothing runs unless asked.

- [ ] Nothing unattended raises any proposal for an active row whose renewal is overdue — there is no unattended anything
- [ ] That row's stored `next_renewal` stays exactly as stored (no roll, no substituted future date in the same field) on `/ledger`, `/ledger/[id]`, and `GET /api/subscriptions*`, and appears in `/inbox`'s **overdue** section. After SUB-48 an expected date may appear **beside** it; it must not replace it.
- [ ] From Inbox, **still have it** on that row rolls `next_renewal` forward by cadence as **inferred** (never confirmed) and the row leaves Overdue; **cancelled** ends it (on `main`, at the stored past date; after SUB-48, after reviewing the actual end date), keeping the row under Cancelled
- [ ] Capture “I cancelled Netflix three months ago” → accept → cancelled with a past `ends_on`, no next due

**Fail if:** anything auto-cancels, proposes or sets `lapsed` from silence, confirms a date without the user setting it, or rewrites a stored `next_renewal` without you asking.

Capture "my Spotify expired" or "the card failed" and it proposes **cancelled**, not a third status: accepting it ends the row, keeping its identity and its history.

---

## What these checks do not cover

Named so nobody mistakes a green run for a working product. None of these are
defects in the checks above; they are absences in what is being checked.

- **Nothing is verified about the user being warned in time.** A renewal can pass unnoticed and every check still passes, because nothing notifies outside an open `/inbox`.
- **Nothing is verified about starting from zero.** All checks run on `npm run db:seed`. The empty-ledger path — the one a real user meets first — is untested.
- **Nothing is verified about deciding.** No check asks whether the user could tell what to cut, or what a subscription costs against what they get from it.
- **Nothing is verified about following through.** A decision to cancel that never becomes an actual cancellation is recorded as faithfully as one that did.
- **Nothing is verified about getting the data out.**
- **Nothing is verified about the six-month return.** It is called the normal path in `product.md` and has no check of its own in this file. Stage-one recovery is [acceptance scenario F](stage-one-acceptance-scenarios.md) and lands with SUB-50 / SUB-51.

When signing off a stage-one implementation PR, run the issue's test plan plus
any group above that the change could have broken. After SUB-49, the Inbox
group must treat **Reminders** as the glance section and must fail if a
dismiss control appears or if a card remains after the due date. After SUB-43,
editing only a note must leave inferred/proposed money and dates untouched.
After SUB-44, trial end is separate from subscription end and next renewal;
auto-renewal is yes/no/unknown and is not inferred from cadence; amount on a
trial is labelled after trial.
After SUB-46, a free trial's paid-plan price must not sit in the current paid
total.

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
