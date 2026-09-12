# User journeys and expectations

Captured from the product discussion, 11 September 2026. These are the motivations and decisions behind the subscription workspace, including the direction delivered by SUB-65. Bhavesh's experience is an example to validate, not evidence that everybody behaves the same way. Implementation rules remain in [product.md](product.md) and [AGENTS.md](../AGENTS.md); the practical evaluation is [testing-and-signoff.md](testing-and-signoff.md).

## Start with what the user knows

Bhavesh would first build an inventory, then add renewal dates and prices, then decide which services deserve attention. He can name some services from memory and also has an existing list. Names alone are a useful start. Saving must not require complete financial details or answering every question.

Information arrives over multiple visits. A person may investigate one subscription thoroughly, paste a long list, bring an invoice before creating anything, or return with just one missing fact. The product should support each entry point without forcing a prescribed onboarding sequence.

## Paths, triggers and timing

| Trigger | Possible action | Expected experience |
|---|---|---|
| Remembering several services | Type, speak or paste names | Review recognisable drafts; save incomplete subscriptions |
| Finding an existing list | Paste it in one batch | Account for the names, retain input on failure, allow partial review |
| Wanting to understand a subscription | Open it, then look through email or the provider's account/billing pages | See what is already known and what still needs checking |
| Finding a plan, invoice or renewal notice | Paste text, upload a screenshot/PDF, type or speak a fact | Propose the relevant changes with their evidence, in that subscription's context |
| Bringing information without first selecting a record | Use general capture | Match to the intended holding, or ask if identity is ambiguous |
| Finding only a price or date | Add that fact and leave | Make progress without completing unrelated fields |
| Being interrupted | Switch records, defer a question, leave the app | Recover the conversation and unsent text; keep unresolved questions reachable |
| Returning days or weeks later | Find the subscription or use a contextual filter | Resume without repeating the evidence or reconstructing the previous session |
| Learning of an actual change | Report changed terms, continuation or a completed cancellation | Review the meaning and effective timing, preserving the holding and its history |

Email and provider pages are sources the user consults; this does not promise automatic email ingestion or provider integrations. Other possible discovery sources, such as app-store subscriptions or statements, are hypotheses to explore. A receipt may describe an old period, not today's price or next renewal. Preserve that uncertainty instead of inventing current facts or payment records.

For evaluation, the user may keep a private checklist of source categories checked and deferred: remembered names, existing list, email, provider pages, other. An empty review queue does not prove the inventory is complete. This checklist is an evaluation aid, not a requested onboarding-progress feature.

## Review builds confidence

Capture proposes; the user reviews changes before they affect a saved subscription. Accepting a displayed status does not confirm every price or date. A user can confirm or correct one fact independently, reject a proposal, or leave something unresolved.

Repeated information about the same intended holding/draft consolidates into its pending proposal while retaining evidence. This supersedes the earlier discussion of leaving separate overlapping proposals for the user to order. Consolidation is not permission to merge distinct holdings that happen to share a provider: accounts and ambiguous matches still need attention.

Automatic application was discussed as a possible later option after confidence grows. It is not current behaviour or part of SUB-63.

## The subscription brings the work together

A proposal, question, reminder, capture and conversation are meaningful through the subscription or draft they concern. They should not feel like independent objects the user must assemble.

| Filter | What the user is looking for |
|---|---|
| All | Saved inventory, including incomplete subscriptions |
| Pending reviews | Drafts not yet added, proposed changes and unresolved reconciliation work |
| Open questions | Subscriptions or drafts with questions, including deferred questions |
| Reminders | Subscriptions with currently eligible, user-enabled reminders |

These overlap; they are not lifecycle statuses. Counts represent rows rather than individual messages. Selecting a filter highlights the relevant context on each subscription. Drafts remain visibly not added yet and do not enter All until accepted. Resolving the last reason for an open row to match a filter should leave its outcome visible until the user closes it or changes context.

Opening a subscription progressively reveals relevant work, details, evidence and history. Its local conversation targets that subscription automatically, beside it on desktop and below it on a narrow screen. General capture remains available for information that does not start from an open subscription. Targets must be visible and recoverable; a terse answer must not go to the wrong question.

The primary workspace has no separate Work destination and no aggregate totals/coverage panel. Individual prices still matter. A separate summary view could be considered later; SUB-65 retained the summary API without adding that view.

## Cancellation intentions: discussed, outside this validation

A user may decide a trial should not convert, that the price is poor value, or that they no longer use a service. Bhavesh would want to choose a reminder date, follow the provider's cancellation steps separately, and later confirm completion. A later visit could surface an intention still waiting for action. Wanting to cancel is not proof of cancellation.

This intention and follow-up journey belongs to **SUB-64**, which is explicitly outside SUB-63. Do not build it, require it for sign-off, or simulate it by marking a holding cancelled. Reporting an actual completed cancellation remains supported and its date/history behaviour is still tested.

## What we need to learn

Can Bhavesh build and improve a useful inventory with less effort than his existing list? Can he understand proposals and unknown facts, find unfinished work, and return twice without developer repair or repeating input? Record time to the first saved subscription, correction effort, assistance, and what sources remain unchecked. Observe where he naturally starts before offering navigation instructions. A scripted pass or a mock-up alone cannot establish usability or real extraction quality.
