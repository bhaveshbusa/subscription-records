# Subscription assistant: essence, jobs, and stage-one completion

Status: discussion draft, 7 September 2026. The **implementation contract** is now [AGENTS.md](../AGENTS.md) and [product.md](product.md), published in SUB-42 with D1–D6 approved. Keep this brief as essence and jobs context; do not treat it as the source of money, date, or lifecycle rules.

Implementation breakdown: [stage-one plan](stage-one-implementation-plan.md). Human verification: [acceptance scenarios](stage-one-acceptance-scenarios.md). Latest user-selected boundary: **use the existing setup; deliver reminder notifications in Inbox, with no dismissal and automatic expiry after the subscription due date**. Production sign-in and external notification channels are out of scope. Bhavesh may clear records before an onboarding cycle.

## 1. Core essence

**Help people stay in control of their recurring subscriptions by making it easy to establish, trust, and revisit a picture of what they hold, what it costs, and what deserves a decision.**

The human outcome is confidence and deliberate choice: fewer subscriptions continuing simply because someone forgot about them, and less guilt when they discover an unwanted charge.

The foundation is a durable record of holdings, terms, dates, and uncertainty. The system helps people bring that record into line with reality using whatever information they have. It preserves the distinction between what the person knows, what the system inferred, and what remains unresolved.

This is a product for people with subscriptions. Bhavesh is its first evaluator. His use can establish whether the core works; it cannot yet establish that onboarding or retention works for a broader audience.

The job includes timely decisions through user-controlled reminders. Stage one delivers them inside Inbox, which the user visits on their own review schedule. External channels can follow later; this stage does not promise to reach the user while they are away from the application.

## 2. The main job

**When subscriptions accumulate and continue without much attention, I want to get a trustworthy picture of my commitments and revisit the ones that matter, so continuing to pay remains a choice I am comfortable with.**

Trials, an unexpected charge, a price increase, a tighter budget, and returning after a long absence are circumstances that bring this job into focus. They need not become separate product modules.

## 3. Supporting jobs

| Job | Circumstance and desired progress | Stage-one boundary |
|---|---|---|
| Establish the picture | When I have never tracked my subscriptions, help me gather what I have and identify what I still need to check, so I can trust the starting point. | Start from an empty account, use mixed and incomplete inputs, review the result against sources I choose. A simple checklist is enough; no onboarding wizard required. |
| Capture before I forget | When I sign up or learn something new, let me record what I know with little effort, so the subscription or change is not lost. | Existing capture and manual entry should preserve useful partial records. Finishing every field is optional. |
| Understand commitments and uncertainty | When I review my subscriptions, help me see the costs, dates, and limits of the information, so I know what conclusions I can draw. | Explain the coverage and trust of totals as well as individual fields. Unknown does not mean zero. |
| Reconcile after neglect | When my record is old, help me update what I know and retain what I still need to investigate, so I can recover without rebuilding everything. | Handle continued holdings, actual cancellations, changed terms, and unresolved cases without inventing facts. |
| Make a trial decision | When I start a trial I might forget, help me retain when it becomes a paid commitment and what I need to decide, so I do not drift into paying for something I will not use. | Stage-one trials are free; payment starts at trial end if the user continues. Trial reminders appear in Inbox through that date, with lead time still to be specified. They must not inherit no reminder from paid monthly/weekly cadence. |
| Remember a decision at the right time | When I want to revisit a subscription before it renews, bring it to my attention at the time I choose, so I can decide with the relevant facts. | Show an Inbox notification during its reminder window, with no dismissal. Remove the occurrence after the subscription due date passes. External channels are later. |
| Reconsider value | When a renewal, price increase, or budget concern makes me question a subscription, help me compare its cost with the value I get, so I can choose what to keep. | Costs and history support a human decision. Optional self-reported use can live in notes. Automated usage measurement or ranking is unnecessary. |
| Preserve the outcome | When I have changed or ended a subscription outside the system, let me record what actually happened, so future reviews reflect reality. | Preserve identity and history. Wanting to cancel does not mean cancellation happened. |

Across these jobs, the emotional requirement is consistent: discovery and correction should feel like regaining control. An incomplete record or a long absence should not feel like failure.

## 4. Distinctions that clarify scope

### Trial end is a separate fact from subscription end

Capture a **trial end date separately from the subscription end date**. Trial end describes when the free trial finishes and the paid subscription begins if the user continues. Subscription end describes when the holding actually stops. Keep the same record across the trial-to-paid transition.

**Agreed stage-one simplification: there is no price during trial; payment starts when the trial ends and the actual paid subscription begins.** A trial ending 14 September has its expected payment-start boundary on 14 September. A separate delayed first-payment date and paid-trial pricing are outside this stage's model. The later recurring next-payment date still belongs to the paid subscription's schedule.

Stage one should retain and expose a stated trial end even when the paid-plan price or cadence is unknown. Any amount/cadence captured for a trial describes the paid plan after trial and should be labelled accordingly. No current-trial price or separate post-trial-price fields are needed; exclude trials from current paid-commitment totals without overwriting their future paid price with zero. The user still establishes whether the paid subscription actually began; the clock does not automatically convert the row or confirm a payment.

### Auto-renewal is a fact; a reminder is a preference

**Agreed direction:** model both concepts on the subscription, independently.

Auto-renewal records whether the subscription is expected to renew automatically under the arrangement the user has with the provider. It can be yes, no, or unknown. Establish it from the user or supplied evidence, retaining the distinction between proposed and confirmed information. Do not set it as a confirmed fact from billing cadence. In particular, annual billing does not establish auto-renewal = false. Recording or editing this fact does not change the provider's settings.

A reminder records whether and when the user wants attention before a relevant date. An auto-renewing annual subscription can have a reminder; a monthly subscription can also have one if the user chooses.

| Billing cadence | Suggested reminder | Auto-renewal |
|---|---|---|
| Weekly | None | Establish from the user or evidence; otherwise unknown |
| Monthly | None | Establish from the user or evidence; otherwise unknown |
| Yearly | One month before renewal | Establish from the user or evidence; otherwise unknown |

Reminder defaults are visible, editable starting preferences. User choices take precedence; defaults must not silently replace an existing choice. If an interface offers an auto-renewal suggestion, it remains visibly unconfirmed until the user accepts it. Neither unknown auto-renewal nor incomplete reminder timing should block saving a subscription.

Trials need a reminder rule tied to trial end, independent of eventual paid cadence. **Approved:** suggest three calendar days before trial end. If the relevant date is unknown, the system must not imply that a dated notification is ready to be delivered.

### Routine auto-renewal should not create routine confirmation work

For a subscription the user has set to auto-renew, continued renewal is the expected arrangement. A weekly or monthly billing date passing is ordinary operation. Repeatedly asking “Do you still have it?” can make the user maintain the tracker on every billing cycle without helping them make a decision.

The current application does create this maintenance burden: every holding with a past stored renewal date enters Overdue, and Still have it advances that date only until the next cycle passes. Weekly subscriptions are excluded from Renewing soon, but remain eligible for Overdue. These are Inbox entries, not external notifications.

**Agreed product principle: record an explicitly known recurring arrangement without requiring the user to reconfirm it on every cycle.** Short cadence alone does not establish auto-renewal; the user or supplied evidence must establish the arrangement. Expected continuation does not prove a payment succeeded or that the terms remain unchanged.

This adds a more important stage-one question than merely allowing a row to remain unanswered: can the user maintain a useful record of routine auto-renewing subscriptions without repeated bookkeeping? A manually initiated review can still reconsider their value, on the user's review schedule rather than on every billing date.

There are two different circumstances to preserve:

- **“It is set to auto-renew; nothing has changed as far as I know.”** The recurring arrangement supplies an expectation of continuation. A passed date alone should not create a new request to confirm holding under the proposed principle.
- **“I am unsure whether this subscription is still continuing.”** This is investigation. The person may need to check a provider account, statement, or email outside the system, then bring back the result. Leave that uncertainty discoverable without forcing an answer.

Preserving an unanswered row may already work through the existing path; no dedicated Investigate action is required just to support that. It does not, by itself, solve the repeated auto-renewal bookkeeping problem.

Non-auto-renewing or uncertain subscriptions may need reconciliation after a relevant date passes; the date alone does not prove cancellation or payment failure. The published contract (SUB-42) keeps stored dates as recorded facts, projects a separate expected date for confirmed auto-renewing active holdings, and leaves auto-renewal no/unknown as reconciliation work. See [AGENTS.md](../AGENTS.md).

“Overdue” describes the stored schedule needing reconciliation; it does not establish an unpaid bill. Likewise, a historically confirmed date does not establish that the subscription's present situation has been checked recently.

Separately, the overdue Cancelled shortcut on `main` uses the stored renewal date as the cancellation date. A stored due date of 1 June does not establish that a subscription cancelled in August ended on 1 June. **Approved in D6:** review the actual stated end date; if timing is unknown, leave the matter unresolved and allow notes. Lands in SUB-43 / SUB-48.

### Attention and authority are separate decisions

**Agreed direction: reminders are enacted as notifications in Inbox for stage one, with delivery evolving later.** The core owns what the user wants to be reminded about and when. Inbox projects the currently eligible occurrences; the channel need not define the subscription model.

Sending a user-authorised notification does not confirm a price, change a renewal date, assert payment, or cancel a holding. User authority over those facts remains intact. The user can change or disable reminder preferences independently of auto-renewal.

An enabled renewal notification appears from the chosen reminder date through the subscription due date, inclusive, and disappears when that due date is past. For example, a renewal due 15 October with a one-month reminder appears from 15 September through 15 October and is absent from 16 October. It has no dismiss, clear, snooze or mark-read-to-remove action. Expiring a notification does not cancel the holding or resolve uncertainty about it.

Compute notification visibility from preferences and due occurrences on read, refreshing Inbox when relevant. Nothing needs to delete notification records or write ledger facts when the clock passes a date. The no-scheduled-work rule can remain for stage one. A manual calendar reminder to visit Inbox is still compatible with this evaluation setup; reaching the user outside the app is later work.

Trial reminders expire after trial end, which is also the stage-one expected payment-start boundary. **Approved:** three calendar days lead, calendar-month subtraction with month-end clamping, UTC `YYYY-MM-DD` dates. External channels, scheduled delivery and retry behavior belong to a later stage.

### The competing habit is memory plus occasional checking

The working hypothesis is that many intended users currently rely on memory, bank or provider apps, emails, and scattered notes. A spreadsheet is another alternative, but should not be the sole benchmark.

The system cannot beat doing nothing on immediate effort. It must make a small recording and review effort worthwhile through easier retrieval, less uncertainty, and better decisions. Measure that across onboarding and return visits rather than insisting every interaction be faster than doing nothing.

## 5. What “fully onboarded” should mean

**I have accounted for the subscriptions I can identify from the sources I chose to check, and I understand what remains uncertain.**

This is a bounded confidence claim. Without external access, the system cannot certify that no subscription is missing anywhere.

The initial review should establish:

- Which sources I checked and which I have deferred: for example, memory, provider accounts, app-store lists, or statements inspected outside the app.
- Which identified subscriptions are represented, including trials and incomplete holdings.
- Whether repeated mentions matched correctly and whether separate accounts need further checking.
- Which prices and dates I know, which were inferred, and which remain unknown.
- What the displayed total includes and excludes.
- Which subscriptions auto-renew, which do not, and which remain unknown.
- Which reminder preferences I have chosen and which dates or delivery capabilities are still missing.
- Which time-sensitive items need a decision before my next review.

A written checklist can establish source coverage in stage one. This does not require bank integration, statement parsing, or a stored onboarding-progress feature. Missing information may remain missing. An empty Inbox is not proof of complete onboarding.

## 6. Current implementation: foundation and remaining questions

These observations come from documentation and source inspection. They are not a new live usability test or a fresh test-suite result.

| Area | Current evidence | What remains to establish |
|---|---|---|
| Partial and mixed capture | Manual stubs, text/list capture, images, PDFs, and audio are implemented. Capture produces pending proposals. | Whether a real empty-account onboarding session is manageable, including correcting extraction and matching mistakes. |
| Authority and history | Field trust, acceptance, amendments, cancellation history, and reactivation are implemented. | Whether the first user can understand and repair the resulting record without inspecting code or the database. |
| Cost summary | The summary calculates a GBP monthly equivalent for selected statuses, including trial. Missing amount or cadence produces no contribution; field confirmation status does not qualify the aggregate. | Exclude free trials from current paid-commitment totals and label their recorded paid-plan price “after trial.” Make aggregate coverage and uncertainty understandable. |
| Trial decisions | Trial status exists. Renewing-soon uses monthly and yearly cadence windows; weekly and unknown cadence are excluded. The schema has next-renewal and subscription-end dates, but no separate trial-end date. | Add trial end as the expected payment-start boundary, separate from subscription end. Retain existing amount/cadence as the paid-plan terms, including when those are unknown. |
| Return and reconciliation | Overdue actions, conflict handling, and past-dated cancellation capture exist. All holding rows with past stored renewal dates enter Overdue, including weekly and monthly auto-renewal cases. | Resolve the product rule for routine auto-renewal so review does not become confirmation on every cycle. Also run the return-after-absence scenario, including “I don't know.” |
| Auto-renewal and reminders | The current subscription schema does not model auto-renewal or a subscription reminder preference. Inbox provides an on-open renewing-soon glance; the old reminders table and scheduled scans were removed. | Add facts, preferences and a projected Inbox notification section with automatic due-date expiry and no dismissal. No scheduler or external delivery infrastructure is required. |
| Deciding what to keep | Cost sorting, terms history, and manual notes exist. | Confirm these support a basic human review. There is no demonstrated need yet for a dedicated usage-rating feature. |

Source anchors: [product contract](product.md), [existing acceptance checks and their limits](testing-and-signoff.md), [summary calculation](../lib/subscriptions/query.ts), [Inbox selection rules](../lib/inbox/query.ts), [overdue actions](../lib/inbox/overdue.ts), [subscription fields](../lib/db/schema.ts), and [capture candidates](../lib/capture/candidates.ts).

## 7. Proposed stage-one completion gate

**Stage one is complete when the first evaluator can establish a trustworthy subscription picture from an empty account, use it for a deliberate review, and restore it after an absence, without hidden data repair or losing uncertainty.**

Use the following evidence, with existing technical checks remaining necessary for implementation changes:

1. **Complete one real onboarding session.** Bhavesh uses the existing login/setup and may clear records before the cycle. Check an agreed set of personal sources. Record all identified subscriptions, including partial ones, and account for duplicates, exclusions, and outstanding checks. Record the time and points of friction; a rigid five-second target is premature. Production sign-in and new reset UI are not required.
2. **Prove that messy input is recoverable.** Exercise a list, an incomplete signup, a repeated mention, and representative supported file or voice captures. Correct or reject a wrong interpretation. Verify that retries and repeat evidence do not create unintended holdings. The normal application must suffice.
3. **Explain the money without overclaiming.** Independently reconcile the displayed total for a small known set. Identify missing terms, unconfirmed values, trial assumptions, and excluded currencies. A monthly equivalent describes recorded recurring terms; it is not an actual bank-payment forecast.
4. **Complete a trial review.** Use a free trial with stated trial end and paid-plan price, and another with trial end but unknown paid terms. Verify that trial end is the expected payment-start boundary, subscription end stays separate, and neither trial contributes to current paid-commitment totals. Its Inbox reminder expires after trial end; actual continuation remains for the user to establish. No unwanted charge needs to occur to validate the scenario.
5. **Restore an old record.** In a controlled scenario, combine an unchanged holding, a price change, a cancellation with an explicitly stated past date, a reactivation, and an uncertain holding. Resolve what is known, leave the uncertain item discoverable, and preserve identity, history, and trust states. This can be simulated without waiting six months.
6. **Complete a value review.** Choose a few subscriptions and explain which to keep or reconsider using cost and personal value. If helpful, note “never,” “occasional,” or “weekly” use. Keep intended action separate from actual cancellation. The evaluator need not cancel a valued subscription to pass.
7. **Return for two routine reviews.** Use a manually arranged review habit and include weekly and monthly subscriptions explicitly known to auto-renew. Under the proposed principle, ordinary cycle passage should not require repeated holding confirmation. Confirm that actual uncertainty remains discoverable and that updates need no developer intervention. This part of the gate requires resolution of the auto-renewal contract question above. Two visits are a proposed local validation gate, not evidence of general-market retention.

8. **Verify the agreed renewal and reminder model.** Record an annual auto-renewing subscription with a reminder, a monthly one with no reminder, a monthly one with a user-requested reminder, and an unknown auto-renewal case. User choices survive later edits. Verify Inbox visibility before, during and after the window, including the due date. Notifications cannot be manually cleared; their automatic expiry does not change lifecycle facts or erase unresolved work. Inbox delivery is required; external delivery is not.

Screen switching, manual notes and Bhavesh's deliberate reset before a run are acceptable. Calendar reminders can prompt visits to Inbox. Silent omissions, misleading totals, lost trial dates, forced guesses, and ordinary operations requiring database repair are failures of the core rather than acceptable lack of polish.

## 8. What to build before declaring completion

First run the completion scenarios against the current system. Much of the needed capability already exists; do not commission a replacement onboarding flow before observing the gaps.

The source review identifies these priorities:

1. **Qualify the cost summary.** Show enough coverage and trust information that users can distinguish the recorded subtotal from a complete, verified commitment picture. Preserve the existing currency boundary or show exclusions clearly; currency conversion is not required.
2. **Capture free trials and their paid-plan terms.** Add trial end separately from subscription end; it is the expected start of payment in stage one. Retain existing amount/cadence as paid-plan terms with appropriate labels, and keep free trials outside current paid-commitment totals. Unknown paid terms must not hide a known trial end. Add no separate trial-price fields, delayed first-payment model or automatic lifecycle conversion.
3. **Model auto-renewal and resolve its schedule behavior.** Retain yes/no/unknown and the authority of the supplied information. An explicitly known recurring arrangement avoids repeated holding confirmation (SUB-48) while preserving uncertainty about actual payments and changed terms. A genuinely uncertain row can remain outstanding. Overdue Cancelled reviews the actual end date (D6).
4. **Model reminders and deliver them in Inbox.** Use the agreed editable cadence suggestions, preserve user overrides, and the approved trial three-day lead plus calendar-month arithmetic. Project active notifications from these preferences; provide no dismissal and expire renewal occurrences after their due dates. Add no scheduler, persisted notification cards, delivery tracking or channel framework.
5. **Fix blockers found during onboarding and return.** Prioritise missed subscriptions, incorrect merges, inability to correct proposals, and misleading projections over cosmetic friction.

Free trials ending at the expected start of payment, separate trial-end capture, independent auto-renewal facts and reminder preferences, Inbox delivery, and avoiding confirmation on every auto-renewal cycle are agreed direction. Recurrence arithmetic, trial reminder lead time, expected-date trust, and cancellation-date review are specified in [AGENTS.md](../AGENTS.md). Each resulting implementation change should use the repository's one-issue-per-PR process.

## 9. Later and excluded work

Future interfaces and integrations include WhatsApp, ChatGPT, a mobile app, and forwarded email. Additional notification channels can follow Inbox delivery. Production sign-in is deferred because Bhavesh uses the existing setup for stage one. A dedicated usage-rating control, structured reconsideration list, or user-facing export can be revisited when experience establishes the need. They are not default stage-one blockers.

Usage is optional context for a decision, not a monitoring product. Low frequency alone does not establish low value. A provider's price increase is a trigger for reconsideration; detecting vendor price changes is not a responsibility of the system.

Cancellation instructions, executing cancellation, dispute assistance, tax/expense workflows, and autonomous vendor-price monitoring are excluded. Recording an actual cancellation remains core.

## 10. Keep the core independent of its eventual interface

Future input channels should submit evidence and proposed changes to the same core. The core should retain identity, terms, dates, auto-renewal facts, reminder preferences, trust, provenance, and history, and apply changes under the same user-authority rules. Notification delivery should enact the user's preferences independently of the input interface.

Keep the conceptual distinction between a recorded fact, an unresolved question, a user's intention, and an action that happened outside the system. These distinctions can be preserved in today's simple experience without building an extensibility framework or a new table for every concept.

The interface and notification channels can evolve while retaining the same capture, trust, reconciliation, and user-authority principles.
