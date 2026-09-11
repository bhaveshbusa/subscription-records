# Subscription Workspace UX: human acceptance journeys

Companion to the [agreed contract](subscription-workspace-ux-plan.md),
published in
[SUB-57](https://linear.app/lets-play-match/issue/SUB-57/publish-the-agreed-subscription-workspace-ux-contract).
These are checks for the completed phase — **none of them are gates for `main`
today**, and a PR only adds the journeys for the issues it ships. Use the
existing login and synthetic inputs; never commit private subscription
evidence or add it to reusable seed fixtures.

Each journey names the issues whose boundary it exercises. Run a journey when
the last issue it depends on has merged — and again, whole, in the real-use
validation
([SUB-63](https://linear.app/lets-play-match/issue/SUB-63/validate-the-subscription-workspace-with-real-onboarding-and-return)).

The implementer runs `npm test`, `npm run lint` and `npm run typecheck` on the
throwaway unseeded Postgres, and adds browser coverage where reload,
navigation, focus and drafts are the behaviour under test. Deterministic
fixtures prove the pipeline is wired; they do not prove live extraction or
transcription quality — that is evaluated separately, by hand. Human sign-off
requires ordinary tasks to succeed without code inspection or coaching about
where to go.

## 1. Onboard a list and get Active or Trial rows

Issues: [SUB-54](https://linear.app/lets-play-match/issue/SUB-54/capturing-an-ordinary-onboarding-list-fails-with-an-unactionable-error),
[SUB-60](https://linear.app/lets-play-match/issue/SUB-60/interpret-new-subscriptions-as-active-and-current-trials-as-trial)

Paste a synthetic list of about twenty-five subscriptions, mixing names only,
names with prices, and different cadences. Accept some incomplete records.

- [ ] Every accepted new subscription lands as **Active** in the
  All/Holding views — including the rows with no price or date
- [ ] A list explicitly introduced as trials (“these are my trial
  subscriptions…”) yields **Trial** rows, even when trial ends are unknown
- [ ] Accepting a card establishes the status shown on it; there is no
  second status-confirmation question
- [ ] If extraction fails, the input is retained and the failure explains
  how to recover — not an unactionable error

## 2. Answer questions later, on the question they belong to

Issues: [SUB-55](https://linear.app/lets-play-match/issue/SUB-55/open-capture-questions-are-recorded-but-never-surfaced-again),
[SUB-61](https://linear.app/lets-play-match/issue/SUB-61/keep-a-persistent-conversation-linked-to-the-selected-subscription-or)

Produce four open questions across captures, then reload the page.

- [ ] All four questions are reachable after reload; none were deleted
- [ ] Answer an older price question with “£12 monthly”: it lands on **that
  question's** draft, not whichever question was asked most recently
- [ ] Defer another question; it stays open and the first answer is
  unaffected
- [ ] If an answer proposal is rejected or fails, the underlying question is
  not silently erased — the unresolved work remains visible

## 3. Confirm exactly what you meant to confirm

Issues: [SUB-59](https://linear.app/lets-play-match/issue/SUB-59/confirm-and-edit-individual-fields-directly-on-proposals-and-records)

- [ ] Confirm only the provider, then only the amount: unrelated field trust
  (dates, cadence, auto-renewal) is unchanged both times
- [ ] Open an editor and save only notes: no money or date field is
  confirmed, values are untouched
- [ ] Accepting a card establishes the displayed status but does not
  confirm the amount, cadence, trial end, next renewal or auto-renewal it
  quotes

## 4. Fill gaps, then record a real change

Issues: [SUB-58](https://linear.app/lets-play-match/issue/SUB-58/add-missing-subscription-terms-without-a-terms-change-question),
[SUB-59](https://linear.app/lets-play-match/issue/SUB-59/confirm-and-edit-individual-fields-directly-on-proposals-and-records)

- [ ] Fill a missing amount/cadence/plan on an existing paid holding: it
  saves as ordinary completion, with no correction-versus-terms-change
  interrogation
- [ ] Replace a known price: the form shows old → new and asks whether this
  is a correction or an actual change
- [ ] Record an actual past price change with the user's effective date:
  prior terms stay in history
- [ ] A mixed edit can fill one empty field and correct another in the same
  save; unrelated history and trust are preserved
- [ ] The same first-fill rule applies to a trial's after-trial terms

## 5. Repair what capture misread

Issues: [SUB-56](https://linear.app/lets-play-match/issue/SUB-56/a-misread-provider-cannot-be-corrected-on-a-card-so-it-becomes-a-new),
[SUB-52](https://linear.app/lets-play-match/issue/SUB-52/decide-the-holding-identity-rule-for-capture)

- [ ] A “ChatPRD” tier-name confusion can be corrected on the card to the
  intended existing holding ID — it does not become a new holding
- [ ] A “Mobbin” voice misspelling offers the likely match and an explicit
  separate-subscription option
- [ ] Correcting a provider/plan/account retargets the draft without
  confirming money or dates, and preserves the evidence trail

## 6. Keep two accounts of one provider separate

Issues: [SUB-52](https://linear.app/lets-play-match/issue/SUB-52/decide-the-holding-identity-rule-for-capture)

- [ ] A named account reaches its unique compatible holding; a different or
  previously unseen account asks rather than silently overwriting
- [ ] Repeat the same pending capture before accepting: it links or reuses
  the intended draft instead of queuing a twin
- [ ] Accept from two tabs or after a stale review: the accept rechecks
  identity and revision, so the result is neither a duplicate nor a silent
  retarget
- [ ] A pending-repeat that carries conflicting evidence stays reviewable;
  nothing merges or drops a distinct holding
- [ ] “Use existing” retargets the pending proposal; it does not merge or
  delete a holding that already exists

## 7. Trials and statuses behave as agreed

Issues: [SUB-60](https://linear.app/lets-play-match/issue/SUB-60/interpret-new-subscriptions-as-active-and-current-trials-as-trial)

Verify the agreed interpretation examples from the contract:

- [ ] “ChatGPT subscription is £10 per month” → Active proposal; price and
  cadence are independently reviewable
- [ ] “My ChatGPT subscription trial ends on 10 October; after that it is
  £12.99 per month”, stated before 10 October → current **Trial**; the
  £12.99 monthly is labelled after trial
- [ ] A price-only update on an existing `trial` or `cancelled` record keeps
  its status — it does not flip to Active
- [ ] An old stored trial-end date on a record does not reclassify it, and
  time passing never converts a trial to paid
- [ ] Reporting that a paid subscription began keeps the same holding
  identity, through the shared lifecycle writer with the user's timing

## 8. Leave and come back mid-draft

Issues: [SUB-61](https://linear.app/lets-play-match/issue/SUB-61/keep-a-persistent-conversation-linked-to-the-selected-subscription-or),
[SUB-62](https://linear.app/lets-play-match/issue/SUB-62/bring-work-and-subscriptions-into-one-responsive-workspace)

- [ ] Switch between filters and between open subscriptions ([SUB-65](https://linear.app/lets-play-match/issue/SUB-65/make-subscriptions-the-primary-workspace-with-contextual-reviews)
  replaced the Work/Subscriptions switch with filters); the conversation
  position, the explicit target and the unsent draft are all preserved on
  return
- [ ] On a narrow screen the open subscription's conversation sits below its
  details, and returning preserves the conversation and draft
- [ ] Keyboard and focus behaviour survive the round trip
- [ ] All is saved inventory only, without totals or coverage; reminders keep
  their no-dismiss, computed-on-read behaviour

## 9. Return after a simulated gap

Issues: [SUB-62](https://linear.app/lets-play-match/issue/SUB-62/bring-work-and-subscriptions-into-one-responsive-workspace),
[SUB-63](https://linear.app/lets-play-match/issue/SUB-63/validate-the-subscription-workspace-with-real-onboarding-and-return)

Revisit after time has passed.

- [ ] Confirmed auto-renewing holdings avoid routine confirmation work; the
  stored date and its trust are still inspectable
- [ ] Genuine reconciliation — unknown auto-renewal, unusable schedules,
  passed trial ends — is still present and findable
- [ ] Reminders expire after the due date and write nothing on the way out;
  there is still no dismiss
- [ ] Nothing about the return requires SQL, a redeploy, or reading the
  code

## Sign-off record

As for stage one: record a short, non-sensitive outcome on the issue —
journeys completed, friction found, blockers linked, retest outcomes. If a
required journey fails, the phase stays incomplete even when the automated
suite is green; the implementer fixes the recorded issue and the human
retests.
