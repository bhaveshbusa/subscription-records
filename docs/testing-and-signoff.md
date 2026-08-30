# Testing and sign-off (your role)

You do not implement. You verify behavior on the **Vercel preview URL** in the PR, then comment on Linear.

## How to sign off a normal PR

1. Open the preview, log in with seed credentials from the PR body.
2. Run only the issue’s AC that are user-visible (skip if API-only and CI passed, unless you want curl).
3. If broken: Linear comment with steps, expected vs actual, screenshot. Status stays In Review.
4. If good: comment `SIGN-OFF` and merge (or tell Devin to wait and you merge).

## How to sign off a **gate**

Run the full script below. All bullets must pass. Then set the Linear epic (or last issue in the gate) to **Done** and move the next issue to **Ready for Devin**.

---

### Gate A — View and query (after SUB-6)

This is the first gate that matters. No AI.

- [ ] Login works on preview
- [ ] `/ledger` shows ~10 seed rows
- [ ] Summary: active count and monthly equivalent look consistent with the table (spot-check 2–3 rows)
- [ ] Search `net` shows Netflix, hides Spotify
- [ ] Chip **Active** hides the cancelled seed row
- [ ] Chip **Needs attention** is non-zero (seed includes one)
- [ ] Sort by next renewal; blank renewals at the end
- [ ] Refresh keeps `?q=` / status in the URL
- [ ] Open an **inferred** amount row; detail shows inferred, not confirmed
- [ ] Open the **cancelled** row; it loads
- [ ] Copy `GET /api/subscriptions?q=net` (from PR) — same provider list as UI

**Fail if:** empty table after seed, other-user data (you cannot see this easily — trust CI), search is client-only and disagrees with reload, money shown with floats like `6.9900001`.

---

### Gate B — Manual inventory (after SUB-7)

- [ ] Add provider `SignoffCo` with no price; it appears in the list
- [ ] Add amount £4.00 monthly on that row; detail shows **confirmed**
- [ ] Incomplete stub still allowed (no blocking validation on renewal)

**Fail if:** you must fill every field to save.

---

### Gate C — Propose, don’t decide (after SUB-10)

- [ ] Chat: “I subscribed to SignoffChat” → proposal card, ledger **unchanged** until Accept
- [ ] Accept identity only → row exists, amount empty or proposed, **not** confirmed unless you typed a price
- [ ] Paste four service names → four proposals
- [ ] Say “Netflix” again → does **not** create a second Netflix
- [ ] Type “I’ll tell you the price later” → next chat turn does not immediately re-ask the same question

**Fail if:** a price appears as confirmed without you setting it.

---

### Gate D — Lifecycle (after SUB-14)

- [ ] “Paid [existing] £X today” → timeline charge, still one row
- [ ] Same payment twice → still one charge
- [ ] Accept a price increase → old price remains on a closed amendment
- [ ] Reject a price increase → current confirmed price unchanged
- [ ] Cancel at period end vs now matches what you chose
- [ ] Resubscribe cancelled provider → **same** id, not a duplicate

**Fail if:** duplicates, history wiped, “I don’t use it” auto-cancels (must not).

---

### Gate E — Files (after SUB-17)

- [ ] Screenshot upload produces proposals, not silent ledger writes
- [ ] You can reject all proposals; ledger unchanged
- [ ] Direct object URL without signature does not list your file (spot-check)
- [ ] Recording “add Notion” produces a Notion proposal, headed with what was heard
- [ ] Recording stops on the second click, and the microphone light goes out
- [ ] Denying the microphone says so instead of failing silently

---

### Gate F — Jobs (after SUB-19)

- [ ] Lapse job creates a **proposal** or question, status still active until you accept
- [ ] Reminder does not rewrite renewal to confirmed

---

## What you can ignore

- Code style nits unless they break the test
- Which exact component library internals
- Model provider choice if behavior matches `AGENTS.md`

## What you should never sign off

- Confirmed money/dates without a user action
- Cross-user data leaks
- Public screenshots of receipts
- PRs that mix two Linear issues
