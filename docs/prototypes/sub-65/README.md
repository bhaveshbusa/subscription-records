# SUB-65: subscription-centred workspace — interactive concept v1

Status: **design approved for implementation by Bhavesh on 11 September 2026**: “Looks good. I will hand it over to implementor to work on this task.” The default v1 presentation is the implementation baseline. This approval is not final acceptance of the production implementation.

Issue: https://linear.app/lets-play-match/issue/SUB-65/make-subscriptions-the-primary-workspace-with-contextual-reviews

## Open and share

Open `subscription-workspace-v1.html` in a modern browser. It contains its own styles, synthetic fixtures and interactions; it needs no account, server, dependencies or network requests. The same source is embedded in the design conversation. A standalone `index.html` adds the document title and mobile viewport; open that when reviewing outside the conversation.

Use the **Approved v1 implementation reference** ZIP attached to SUB-65. It contains this specification, the unchanged approved mockup source and the standalone preview. Its source SHA-256 is recorded on the issue to identify the exact reference. Files also exist locally under `docs/prototypes/sub-65/`, but are not committed or published in a repository branch. The implementor should include this approved reference in their SUB-65 branch and link the resulting commit from the issue. Earlier “awaiting review” attachments are retained as history; this handoff supersedes their review-status wording.

## Purpose

Explore whether one recognisable subscription can carry its details, pending review, questions, reminders and conversation, with filters bringing the relevant interaction forward. There is no Work destination or totals panel. Keep the merged SUB-62 foundations and the existing backend rules.

## Walkthroughs

1. **Inspect, then enrich.** Open Notion in All. Its saved information is still incomplete. Review the billing-page proposal in the same expanded subscription. Confirm only Price, then Accept changes. Saved values update; only Price becomes confirmed. Inspect Evidence & field trust to see the distinction.
2. **Answer later.** Choose Open questions and open Spotify. Choose Later; the question stays reachable. Answer with `£12 monthly`. The answer becomes a proposal beside the saved details. The question remains pending until acceptance; rejection leaves it unresolved. Accept to complete the question. The row stays open with an outcome even though it no longer matches the filter; close it or change filters to leave.
3. **Interrupt and return.** Type an unsent message in Spotify, open another subscription or change filters, then reopen Spotify. Its unsent text remains. This prototype only preserves drafts during the current loaded page. Preserve the application's existing durable conversation and browser draft recovery, including reload; do not copy this prototype's reload reset into production.
4. **Review a new subscription.** Choose Pending reviews and open Readwise. It is visibly Not added yet and defaults to Active. Accept without filling prices or dates. It becomes a saved subscription under All.
5. **Add a list.** Use Add subscriptions and enter names separated by commas or newlines. They appear as drafts in Pending reviews. This is a names-only simulator. Existing exact names are reported rather than duplicated; account-sensitive identity and ambiguity flows must reuse the real application's matcher.
6. **Bring more information.** Within a subscription, choose Try sample invoice or Try sample voice note. These deliberately use synthetic evidence. There is no upload, transcription or LLM call. Information accumulates in one pending review for the intended subscription; it is not applied immediately. Repeated identical saved information produces no new change.
7. **Inspect a reminder.** Choose Reminders and open Figma. The trial reminder remains attached to the same subscription and does not clear when opened. The simulation date is 11 September 2026; date passage is not simulated.
8. **Responsive layout.** Resize the standalone browser for desktop/mobile. Implement the default: conversation alongside details on desktop, below on narrow screens; new drafts belong in Pending reviews, not All. Optional design controls in the conversation are exploration aids, not production controls or a requirement to build every alternative.

## Approved presentation baseline

| Concern | v1 baseline |
|---|---|
| Primary surface | A compact subscription list, with one expanded subscription at a time |
| All | Saved inventory, without generic attention chips; new drafts omitted by default |
| Filters | All, Pending reviews, Open questions, Reminders; one selected at a time |
| Counts | Number of matching subscriptions/drafts, not number of fields or messages |
| Relevant interaction | Filter-specific preview on a collapsed row, and relevant review/question/reminder first when expanded |
| Expansion | Inline inside the subscription row; conversation alongside on desktop and below on mobile |
| Conversation context | Opening a subscription gives its composer that explicit target; no additional Talk about this action |
| Acceptance | Saved details and proposed additions remain separate until acceptance; confirmation is field-specific |
| Action completion | The open row remains visible until closed even if filter membership drops; counts update immediately |
| History and evidence | Available inside the subscription through progressive disclosure |
| Summary totals | Absent from the primary surface; individual recorded prices remain |

## Boundaries and implementation coverage

This is deliberately an interaction sample. Do not copy its state model or parsing into the app.

- The prototype has no backend, real persistence, extraction, authentication, lifecycle writers or vendor integrations. Reload returns to the fixtures. Source and message dates are synthetic.
- The browser-sized responsive CSS is included; no live browser QA or production end-to-end tests have been run for this concept.
- Supported typed details are GBP prices, monthly/yearly cadence and explicitly labelled ISO renewal dates. Other messages remain conversation text. Replacing known terms is deferred to a later prototype so the existing correction/terms-change requirements are not guessed.
- Prototype edits of proposed fields demonstrate review and exact confirmation scope; production validation, currency handling, conflicts and date interpretation must use the existing domain code.
- General input currently demonstrates adding names. Preserve real general evidence capture, unresolved identity/account questions, current status correction, existing field edits and reconciliation. Their absence from this sample does not authorise removing them. Integrate them consistently with this approved subscription-centred design and cover them in the human test plan.
- Apply the default presentation above. Resolve routine layout details consistently with it; ask only where a substantive product ambiguity remains, particularly money, dates, lifecycle or unresolved holding identity.
- Cancellation intentions/reminders belong to SUB-64. The reminder shown here is the existing trial-end reminder, with its current no-dismiss and expiry semantics.
- Consolidation is for the same intended holding/draft. Never introduce provider uniqueness or collapse distinct accounts.
- Keep recorded dates distinct from expected dates; no time passage writes a lifecycle change or a new recorded date. Keep unknown money unknown and trial paid terms labelled after trial.

## Implementor handoff

1. Use the approved attachment identified on SUB-65; preserve this reference in the implementation branch.
2. Update the repository's UX contract to explicitly supersede the relevant Work/Subscriptions presentation rules. Keep money/date/trust/identity/lifecycle rules intact.
3. Reuse real conversation, proposal, question, reminder and field-review paths from main. This mockup's local actions are illustrative only.
4. Cover the additional real-app journeys above and align SUB-63 with the approved experience.
5. Implement one Linear issue per PR, run the repository's required checks and provide desktop/mobile journey evidence for human sign-off.
