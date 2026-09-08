# Stage one: human acceptance scenarios

Companion to the [implementation plan](stage-one-implementation-plan.md). These are proposed checks for the completed stage, not assertions about today's build. Bhavesh uses the existing setup; production sign-in is excluded. Reminder notifications are delivered inside Inbox without dismissal and expire after the subscription due date. External notifications are deferred. Other date and lifecycle recommendations require resolution of the plan's decision register.

## Where to test

Use the existing development/preview setup for feature sign-off and Bhavesh's onboarding evaluation. Bhavesh may clear records before a cycle; no new sign-in or reset feature is required. Preview data resets on deployment, so retain the same dataset during a return scenario or explicitly restart it after a reset. Never place private subscription evidence in this repository or reusable seeded fixtures.

The implementer runs automated checks on the throwaway unseeded test database. After any deliberate setup/reset, the evaluator follows the steps below through the application; ordinary tasks should not require database repair.

## A. Establish a bounded, trustworthy starting picture

1. Use the existing login and clear records beforehand if needed. Confirm that the onboarding cycle starts without demonstration holdings, while retaining the user/login needed by the application.
2. Write down the source categories you intend to check: memory, provider accounts, app-store lists, and any statements/emails you inspect yourself. This is a checklist, not a request for integrations.
3. Capture a list containing a known paid subscription, a name without a price, an annual subscription, and a trial. Include one screenshot/PDF and one short voice capture during the evaluation.
4. Review proposals. Accept some facts without confirming them, explicitly confirm others, and reject one wrong interpretation.
5. Repeat an input before and after acceptance. Confirm that no unwanted duplicate appears. Where you actually have two subscriptions with the same provider, verify their account identities remain distinct.
6. Save an incomplete holding, correct a mistake, refresh, sign out and return. None of these should require starting over or filling every field.
7. Compare the resulting inventory against the sources you chose. Account for each identified subscription as represented, deliberately excluded, or still under investigation.

Pass: the inventory covers the chosen sources, partial information survives, wrong interpretations are recoverable, and remaining uncertainty can be named. An empty Inbox is not the success criterion.

## B. Understand the total and protect field trust

Use synthetic known inputs: £12/month and £120/year contribute £22/month in total under the existing monthly-equivalent arithmetic. Add one unconfirmed £6/month holding, one missing amount, and one non-GBP holding. Include a free trial with a stated £10/month paid plan separately: its future cost does not enter the current paid-commitment total.

Check that the summary identifies the known contribution, the unconfirmed contribution, and omissions without presenting them as a complete verified budget. Open the affected rows to explain the classifications.

Edit only a note on an unconfirmed row. Its amount and renewal date must remain unconfirmed. Explicitly confirm a value afterward and verify that the trust changes only then. Record an actual price change with its effective date and verify prior terms remain in history.

Pass: the evaluator can independently explain both the number and its limitations; ordinary edits do not manufacture trust or erase historical terms.

## C. Record a free trial and its paid-plan terms

Capture: “Trial ends 14 September, then £10/month; auto-renew is on.” Use a synthetic year appropriate to the test date. There is no charge during trial; the expected start of payment is trial end if the user continues.

Confirm that trial end is recorded, subscription end is unset, and £10/month is labelled as the paid-plan cost after trial. It contributes nothing to current paid-commitment totals. Confirmed and proposed facts remain distinguishable. Record a second trial with only the provider and trial end; its paid price stays unknown. Both can be saved without a current-trial price field or a separate first-payment date.

Set or inspect the trial reminder preference under the approved trial lead-time rule. It must not inherit no reminder merely because the paid plan is monthly. Verify that the Inbox notification appears within its window, remains visible through 14 September, and disappears on 15 September without a dismiss action.

Simulate the trial end passing with the implementer's deterministic fixture. The app must not claim the trial converted to paid or a payment occurred. Its actual outcome remains for the user to resolve.

Then report that the paid subscription actually began. Verify that the same subscription identity is retained, trial history remains available, and paid-plan terms retain their field trust unless explicitly confirmed. A paid-trial or delayed-first-payment example should be identified as outside the supported stage-one model rather than silently rewritten.

## D. Keep routine renewals useful without repeated confirmation

Use a weekly holding and a monthly holding with confirmed auto-renewal and the schedule inputs required by the approved rule. Simulate several cycles passing.

Check that an expected upcoming date is labelled as expected and that the original recorded date and trust can still be inspected. The user should not need to confirm holding every cycle to maintain a useful view. Compare list/detail, renewal sort/filter and any reminder preview for consistency.

Also inspect unknown auto-renewal, auto-renewal off, paused, cancelled and cancellation-scheduled fixtures. They must not receive an unlimited active recurring schedule. An uncertain case can remain outstanding, with a note if useful, until the user checks it.

Pass: ordinary recurrence creates no repetitive holding-confirmation work, while actual uncertainty and trial outcomes remain visible.

## E. Deliver Inbox reminders and expire them by date

1. Create an annual auto-renewing holding and adopt the suggested reminder one month before renewal.
2. Create a monthly holding and adopt no reminder. Create another and deliberately choose a reminder.
3. Change a preference, turn it off, save unrelated edits and return. Choices must persist independently of auto-renewal.
4. Record a preference whose target date is unknown. Saving is allowed; the app explains why it cannot calculate a reminder date.
5. For a renewal due 15 October with a one-month reminder, check the controlled date fixtures: absent on 14 September, visible on 15 September and 15 October, absent on 16 October. Test month-end arithmetic separately under the approved rule.
6. Verify that there is no dismiss, clear, snooze or mark-read-to-remove action. Open the subscription and return: its current reminder remains while eligible.
7. Refresh/reopen Inbox and simulate a calendar-day change while it is open. The expired occurrence disappears without changing the stored subscription date, status or reminder preference.
8. Inspect a non-auto-renewing or unknown holding after its notification expires. It may still need reconciliation; expiry must not hide or settle that work.
9. Inspect the next occurrence of an auto-renewing subscription. It generates a distinct card only within that occurrence's window, without duplicated cards from repeated loads. Preference/date edits recompute eligibility rather than leaving stale cards.

Pass: saved preferences produce the correct Inbox notifications, no per-notification clear action exists, and expiry follows the due-date boundary without altering ledger facts. No email, browser push or external messaging is required.

## F. Recover after an absence

Use a synthetic six-month-return fixture with an unchanged holding, a price increase, a subscription cancelled on an explicitly stated past date, a reactivation, and a subscription whose situation is unknown.

Update each through normal capture/manual paths. Repeated mentions must target the same identity. Verify old terms and cancellation history, the actual supplied cancellation date, and the ability to leave the unknown case unresolved. “I should cancel” and “I never use it” must not become actual cancellation.

Pass: the evaluator restores what they know without rebuilding the inventory, silently losing history, or asserting what they do not know.

## G. Demonstrate continuing usefulness

Using the real private inventory, choose a few subscriptions to keep or reconsider based on costs and personal value. Optional notes such as “occasional” or “weekly” use are sufficient. No actual cancellation is required to demonstrate a useful decision.

Return for two routine reviews, using a calendar reminder if desired. Confirm that the inventory persists, auto-renewal avoids routine bookkeeping, unresolved work remains findable, and updates need no developer intervention. These visits validate the first evaluator's experience, not general-market retention.

## Sign-off record

Record only a short, non-sensitive outcome in the relevant issue:

- Build/deployment reviewed and scenario letters completed.
- Onboarding time and the main points of friction.
- Whether identified subscriptions were accounted for and remaining uncertainty was understandable.
- Any deliberate reset used to prepare the run, and whether ordinary operations afterward needed code or database repair.
- Blockers, their issue links, and retest outcomes.
- Confirmation that Inbox reminders appear during their windows, cannot be dismissed, and expire after the due date; external delivery remains deferred.
- Human sign-off after all core blockers are resolved.

If any required scenario fails, stage one remains incomplete even when automated tests pass. The implementer fixes the recorded issue and the human retests; the agent does not mark human sign-off on the user's behalf.
