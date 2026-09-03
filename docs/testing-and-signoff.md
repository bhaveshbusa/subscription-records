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

### See what I pay for

I want a trustworthy list of **my** subscriptions, including incomplete ones.

- [ ] `/ledger` shows the seed rows (about 10)
- [ ] Summary active count and monthly equivalent match a spot-check of 2–3 rows
- [ ] Search `net` shows Netflix, hides Spotify
- [ ] **Active** hides the cancelled seed row; **Needs attention** is non-zero
- [ ] Sort by next renewal; blank renewals at the end
- [ ] Refresh keeps `?q=` / filters in the URL
- [ ] An **inferred** amount on detail is inferred, not confirmed
- [ ] The cancelled row still opens
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

- [ ] “I subscribed to SignoffChat” → proposal card; `/ledger` unchanged until Accept
- [ ] Accept identity only → row exists; amount empty or **proposed**, not confirmed unless you typed a price
- [ ] Paste four names → four proposals
- [ ] “Netflix” again → **update** (or match notice), not Netflix #2
- [ ] “I’ll tell you the price later” → the next turn does not immediately re-ask that question

**Fail if:** a price is **confirmed** without you setting it.

### Record that I paid

I want a payment on an existing subscription, not a duplicate identity.

- [ ] “Paid [seed sub] £X today” → charge on the detail timeline, still one row
- [ ] The same payment twice → still one charge

**Fail if:** a second subscription appears because someone paid again.

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

### Let the system watch dates without writing them

I want lapse and renewal nudges. Status and confirmed dates must not change until I act.

- [ ] Lapse scan → **proposal** or question; status still active until accept
- [ ] Reminder scan does not rewrite renewal to **confirmed**
- [ ] Inbox “Run reminder scan” can raise cards; a proposed renewal stays proposed
- [ ] `/ledger` after the scan shows the same prices and dates as before
- [ ] Dismiss a reminder → card gone, ledger unchanged; scanning again does not recreate that reminder

**Fail if:** the job auto-cancels or confirms a date.

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
