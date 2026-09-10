# Stage one: onboarding source checklist

Stage One is complete; this sheet stays usable for the workspace phase's
onboarding journeys
([subscription-workspace-ux-acceptance-journeys.md](subscription-workspace-ux-acceptance-journeys.md)).

Companion to the [acceptance scenarios](stage-one-acceptance-scenarios.md).
Scenario A step 2 asks you to write down the sources you intend to check before
you start capturing. This is that sheet.

It is paper, not product. Nothing here is a wizard, a required order, or a state
the application stores. You can stop after two rows, do them out of order, or
defer half of them for a later sitting — an onboarding that covers three sources
and says so is finished; one that covers eight and cannot say which is not.
[SUB-50](https://linear.app/lets-play-match/issue/SUB-50/prove-onboarding-and-recovery-with-representative-scenarios)
introduced it; the automated half of that issue lives in `lib/journeys/`.

## How to use it

Copy the table into your notes and fill the last two columns as you go. The
point is the third column: at the end you should be able to say of every
subscription you own that it is **in the ledger**, **deliberately excluded**, or
**still unchecked** — and of every source, whether you actually looked.

"Deferred" is a real answer. An unchecked source you have named beats a checked
one you have forgotten.

## Sources

| # | Source | What it usually catches | Checked | Notes / deferred because |
|---|---|---|---|---|
| 1 | Memory — what you know you pay for | The obvious ones, and the ones you resent | | |
| 2 | Phone app-store subscriptions | Apple / Google billing, easy to forget | | |
| 3 | Browser or password manager entries | Things you signed up for once and never opened | | |
| 4 | Bank or card statement, one month | Anything the first three missed | | |
| 5 | Bank or card statement, one year | Annual renewals — the ones a month never shows | | |
| 6 | Email search for "receipt", "renewal", "invoice" | Trials that converted, price changes | | |
| 7 | Provider accounts you can log into directly | Exact prices, exact next dates, auto-renewal state | | |
| 8 | Household or shared accounts someone else pays | Things you hold but are not billed for | | |

Rows 4 and 5 are the ones people skip and then discover they needed. Row 5 in
particular: a yearly subscription is invisible in eleven months out of twelve.

## Capture paths to exercise at least once

Stage one supports three, and sign-off
([SUB-51](https://linear.app/lets-play-match/issue/SUB-51/complete-real-onboarding-and-human-stage-one-sign-off))
asks that each is used with the real services rather than the fixture extractor.

| Path | Try it with | Done |
|---|---|---|
| Text or a pasted list | A handful of names, some with prices, some without | |
| File — screenshot or PDF | One statement page or an app-store subscriptions screenshot | |
| Voice | One short spoken list | |

## Fact types worth having at least one of

Not a quota. If your real subscriptions contain none of a row, write "none" —
that is a finding about your life, not a gap in the check.

| Fact | Why it is worth having one | Present |
|---|---|---|
| A free trial with a stated paid price | Proves the price sits outside the current total, labelled after trial | |
| A free trial with no stated price | Proves unknown paid terms stay unknown | |
| An annual renewal with a reminder | The reminder window is a month wide, so it is the one you can actually watch expire | |
| A monthly renewal with no reminder | Proves unset is not the same as off, and that nothing nags you by default | |
| A holding with an unknown amount | Proves an omission is named rather than counted as zero | |
| A holding with unknown auto-renewal | Proves a passed date stays a question instead of being rolled | |

## Closing the cycle

Answer these in writing when you stop. They are the outcome record
[SUB-51](https://linear.app/lets-play-match/issue/SUB-51/complete-real-onboarding-and-human-stage-one-sign-off)
asks for, and they are short on purpose.

1. Which sources did you check, and which did you defer?
2. How many subscriptions did you end up with, and how many are still uncertain
   in some way you can name?
3. Did anything need SQL, a redeploy, or reading the code? If yes, that is a
   blocker, and it needs its own Linear issue before stage one closes.
4. Did the total match roughly what you expected? If not, is the difference
   something the summary explains — omissions, unconfirmed rows, non-GBP — or
   something it does not?

A run that ends "I checked five of eight sources, I have nineteen holdings, four
are uncertain, and here is why" is a good run. One that ends "the Inbox is
empty" is not — an empty Inbox is a state, not evidence.

## What this checklist is not

- Not a required order, and not stored anywhere by the application
- Not a completeness guarantee: it lists where subscriptions hide, not all of them
- Not a place for private evidence. Statement screenshots, account emails and
  receipts stay out of this repository and out of `lib/db/seed-data.ts`, per
  [the acceptance scenarios](stage-one-acceptance-scenarios.md#where-to-test)
