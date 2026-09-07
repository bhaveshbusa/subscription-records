# Testing and sign-off

You do not implement. You verify behavior (Vercel **preview** per PR, or local `npm run dev` with seed login), then comment on Linear and merge.

## How to sign off a PR

1. Log in with seed credentials from the PR body (`SEED_EMAIL` / `SEED_PASSWORD` on local and Preview).
2. Run the **jobs** below that the issue could have broken — not every job every time.
3. If broken: Linear comment with steps, expected vs actual, screenshot. Leave the issue In Review.
4. If good: comment `SIGN-OFF` and squash-merge (or merge yourself).

Seed login is off in Production. Production is your real inventory; do not seed it.

---

## Jobs to be done

Use a seeded database (`npm run db:seed`) unless the job says otherwise.

One part of the Inbox-workbench contract has not landed yet: dropping the
`lapsed` status. Where a gate below depends on it, it says so — skip it until
the issue that implements it lands, rather than failing an unrelated PR for
it.

### See what I pay for

I want a trustworthy list of **my** subscriptions, including incomplete ones.

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

### Add something I don’t know the price of

I want to save a stub without filling every field; when I set money myself it should be **confirmed**.

- [ ] Add provider `SignoffCo` with no price; it appears in the list
- [ ] Set £4.00 monthly on that row; detail shows **confirmed**
- [ ] Saving is not blocked on renewal or other empty fields

**Fail if:** you must complete every field to save.

### Tell the app in chat without it deciding money

I want messy text to become proposals. The ledger must not change until I accept. A second mention of the same service is not a second row.

- [ ] Opening `/inbox` does not greet you with a still-holding question about Headspace; Headspace's overdue date is a row in Inbox's overdue section instead. One follow-up per capture turn, about that turn, is fine
- [ ] “I subscribed to SignoffChat” → proposal card; `/ledger` unchanged until Accept
- [ ] Accept identity only → row exists; amount empty or **proposed**, not confirmed unless you typed a price
- [ ] Paste four names → four proposals
- [ ] “Netflix” again → **update** (or match notice), not Netflix #2
- [ ] “I’ll tell you the price later” → the next turn does not immediately re-ask that question

**Fail if:** a price is **confirmed** without you setting it.

### Record a receipt without storing a payment

I want a receipt to update holding, cost, and next due on the matched row, not a charge.

- [ ] “Paid [seed Spotify] £10.99 today” → terms/schedule card (not Charge); `/ledger` unchanged until Accept
- [ ] Accept → Spotify detail has no new charge on the timeline; amount is not auto-confirmed
- [ ] The same message again → still one Spotify, no second terms card while the first is pending
- [ ] “Paid [seed Spotify amount] today” → match notice, no new row, no new charge

**Fail if:** a second subscription appears, or a new charge is written from chat.

### Change a price without losing the old one

I want a hike to wait for accept; history must keep the previous terms.

- [ ] Accept a Netflix (or similar) price increase → detail shows the new price; the old amendment still has dates
- [ ] Reject a hike → confirmed price unchanged

**Fail if:** history is wiped or the confirmed price changes on reject.

### Stop paying without deleting the record

I want cancel to keep identity. Vague language must not auto-cancel.

- [ ] Cancelled row still in **All**, gone from **Active**
- [ ] Cancel at period end vs now matches what you chose (`cancel_scheduled` still has `ends_on`)
- [ ] “I don’t use it” does **not** mark cancelled

**Fail if:** the row is deleted, or “I don’t use it” cancels.

### Come back to a cancelled service

I want resubscribe to reuse the same id.

- [ ] Cancel then resubscribe the same provider → **one** id (`reactivated`), not #2

**Fail if:** a second identity is created.

### Capture from a file or voice as proposals

I want a screenshot, PDF, or recording to become cards I can reject. Files stay private.

- [ ] Screenshot → proposals, not a silent ledger write
- [ ] Reject all → ledger unchanged
- [ ] The object is not publicly listed (no unsigned GET of the file)
- [ ] Short selectable-text PDF → candidates
- [ ] Record “add Notion” → Notion proposal (needs `GROQ_API_KEY`)
- [ ] Second click stops recording; denying the microphone is visible, not silent

**Fail if:** the ledger updates before accept, or a receipt URL is public.

### Inbox tells me what is waiting

I want one work list, not a ledger I have to scan for problems.

- [ ] `/inbox` shows **Proposals**, **Overdue**, **Unfinished**, and **Renewing soon**, and hides any section with nothing in it
- [ ] Headspace is under **Overdue** with its stored past date; Disney+ is under **Unfinished**
- [ ] **Renewing soon** has The Guardian (yearly, ~3 weeks out) and Netflix (monthly, days out), and does **not** have Oddbox (weekly, days out), Spotify (monthly, ~3 weeks out), or GitHub (yearly, ~6 weeks out)
- [ ] No reminder cards, no dismiss buttons, and no scan buttons anywhere on `/inbox`
- [ ] Inbox copy does not say anything is "not in your ledger yet"

**Fail if:** a weekly row appears in Renewing soon, an overdue row is missing from Overdue, or opening `/inbox` changes a stored date.

### A passed due date stays put until I act

I want an overdue renewal handled by me in Inbox, not silently rewritten by a job. There is no `lapsed` status — silence never cancels, and a job never rolls the date for me.

- [ ] No unattended job raises a `lapsed` proposal, or any proposal, for an active row whose renewal is overdue with no charges
- [ ] That row's `next_renewal` stays exactly as stored (no roll, no substituted future date) on `/ledger`, `/ledger/[id]`, and `GET /api/subscriptions*`, and appears in `/inbox`'s **overdue** section
- [ ] From Inbox, **still have it** on that row rolls `next_renewal` forward by cadence as **inferred** (never confirmed) and the row leaves Overdue; **cancelled** ends it at the stored past date, keeping the row under Cancelled
- [ ] Chat “I cancelled Netflix three months ago” → accept → cancelled with a past `ends_on`, no next due

**Fail if:** anything auto-cancels, proposes or sets `lapsed` from silence, confirms a date without the user setting it, or a job rewrites a stored `next_renewal` on its own.

Legacy behavior still in code, pending the Inbox rewrite (do not fail a PR that isn't that issue for it): `lapsed` is still a status a user-raised proposal can set.

---

## What you can ignore

- Code style nits unless they break the job
- Which component library internals
- Model provider choice if behavior matches `AGENTS.md`

## Never sign off

- Confirmed money or dates without a user action
- Another user’s rows
- Public screenshots of receipts
- A PR that mixes two Linear issues
