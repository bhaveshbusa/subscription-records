# Subscription UI interaction contract — SUB-71

Status: **approved interaction presentation**, amended by product decisions in
[SUB-82](https://linear.app/lets-play-match/issue/SUB-82/publish-accept-confirms-and-pending-terms-latest-wins-decisions)
(Accept confirms; pending terms latest-wins). Bhavesh approved **Integrated
differences** for SUB-71 on 14 September 2026, building on Compact Rows v2
(SUB-70). Writer and card UI changes remain in follow-on issues (SUB-87, SUB-88);
this document records the product rules those issues implement.

- [SUB-71](https://linear.app/lets-play-match/issue/SUB-71/prototype-one-subscription-detail-surface-with-precise-field-review)
- [Approved visual reference](https://www.magicpatterns.com/c/ni9pioqxgewnzfzrkbstpd), artifact `ef875056-8fdf-4e14-885e-9ab93cf5129f`.
- [Separate interaction prototype](https://www.magicpatterns.com/c/c43nasqwufyxo1rqzizqci). Version and evaluation outcomes are recorded in [the review record](subscription-ui-interaction-review.md).

The prototype uses synthetic data and local simulations. Generated code is a
design reference, not a replacement for production components or writers.
AGENTS.md and the existing product/workspace contracts govern money, dates,
trust, identity and lifecycle. Implementation remains one issue per PR.

## Component anatomy

1. Full-width inventory with four overlapping row filters: All, Pending reviews,
   Open questions, Reminders. Counts are subscriptions/drafts, not proposals.
2. One account-aware identity header per row: provider, plan, account and status.
   A draft says **Not added yet**. Trial price says **After trial**.
3. The open row and detail share a visible boundary: green edge, pale header,
   enclosing border and clear space before the next subscription. Close returns
   focus to the originating row. No second large provider heading.
4. Direct reminder and conversation shortcuts near the top, including on mobile.
   The main terms appear first; the reminder editor follows them and remains
   outside evidence/history disclosure.
5. Primary fields: amount/currency, cadence, recorded renewal, trial end where
   relevant, auto-renewal. Expected renewal is separately labelled and read-only.
   Identity correction is an explicit action, not a generic amount editor.
6. Proposed changes are composed into this shell with source disclosure and
   separate accept/reject controls. Pending terms on one holding coalesce under
   latest-wins (SUB-82 / SUB-88); lifecycle proposals stay separately addressable.
7. Notes, evidence and history are supporting details. Open questions remain
   reachable. Composer has one concise explicit target and preserves its draft.

Use **Integrated differences**: each pending difference sits next to its saved
field within the open row, with the saved value explicitly labelled and still
visible. A reminder proposal sits with its own reminder preference. A draft
has no saved side: label its values **Proposed draft** and its missing terms
**Not recorded**. The alternate **Pending changes panel** was compared in the
prototype but is not the selected implementation treatment. Integration is
visual composition into the open row while retaining source disclosure and
accept/reject controls. **Pending terms latest-wins** ([SUB-82](https://linear.app/lets-play-match/issue/SUB-82/publish-accept-confirms-and-pending-terms-latest-wins-decisions);
implement in [SUB-88](https://linear.app/lets-play-match/issue/SUB-88/supersede-pending-terms-on-one-holding-with-latest-wins-and-fix)):
on one holding, multiple pending terms proposals coalesce so the latest named
field value wins; prior evidence stays under Where this came from / history;
lifecycle cancel/reactivate stays a separate proposal; never merge holdings;
never silently overwrite saved confirmed ledger fields (terms-change / conflict
rules still apply). Until SUB-88 lands, shipped UI may still show stacked cards —
the product decision is authoritative for new writers.

## Field state and action matrix

Trust and interaction state are separate axes: saving or editing does not replace
the underlying proposed/inferred/confirmed/conflicted trust.

| State | Display | Action and consequence |
|---|---|---|
| Missing | Not recorded, never zero or an invented date | Add; saving incomplete remains allowed |
| Proposed | Proposed label beside value; distinguish saved unconfirmed fact from unaccepted proposal | Saved Confirm writes exactly this field; on a proposal card, Edit then Accept confirms (per-field stage is removed in SUB-87) |
| Inferred | Inferred label and accessible explanation of its basis | Confirm exact saved field, or Accept the proposal terms that include this value; Edit remains available |
| Confirmed | Confirmed label; keep value prominent | Edit; no redundant confirm action |
| Conflicted | Recorded value plus conflicting suggestion, never silent replacement | Explicit review/correction; retain both meanings until resolved |
| Editing | Labelled input, current value and Save/Cancel | Changes only intended fields; cancel preserves original; unchanged save is not confirmation |
| Staged | Legacy staging note only if a field was edited before Accept | Undo the edit; saved facts remain unchanged until Accept |
| Saving | Action-specific Saving feedback, disable duplicate submission | Keep values visible and preserve underlying trust until success |
| Failed | Inline cause and recoverable input | Retry or cancel; preserve edits/staging; no optimistic confirmed state |

Amount includes its currency as a unit, not cadence or dates. Plan and notes have
no independent trust-confirmation control. A saved missing field may already be
`deferred`; preserve that existing status rather than treating it as a new trust
state or clearing the deferral incidentally.

### Confirmation and acceptance copy

- Saved field: **Confirm amount** acts immediately, with field-specific success.
- **Accept confirms** ([SUB-82](https://linear.app/lets-play-match/issue/SUB-82/publish-accept-confirms-and-pending-terms-latest-wins-decisions), [SUB-87](https://linear.app/lets-play-match/issue/SUB-87/accept-confirms-proposal-terms-and-remove-per-field-confirm-on-cards)): accepting a terms proposal confirms exactly the money/date/auto-renewal values present on that proposal after any Edits. Prefer: disagree → Edit (or Reject); agree → Accept. Status-only and lifecycle accepts still do not confirm money. Cadence does not confirm auto-renewal unless auto-renewal is on the card. Per-field Confirm staging is removed from proposal cards; primary copy is **Accept**.
- **Reject** addresses one named proposal only. No bulk confirm-all across holdings, and no acceptance by merely opening the record.
- **Pending terms coalesce ([SUB-88](https://linear.app/lets-play-match/issue/SUB-88/supersede-pending-terms-on-one-holding-with-latest-wins-and-fix)):** multiple pending terms cards on one holding fold with latest field wins; evidence retained; lifecycle proposals stay separate.
- Notes-only saves send only notes. Existing inferred/proposed values and trust
  survive unchanged.
- First filling an empty amount/cadence/plan is completion. Replacing recorded
  terms distinguishes a correction from an actual change with a user-specified
  effective date. Do not default lifecycle timing.

## Reminders, questions and navigation

Renewal and trial-end preferences each show **Not set**, **Off**, or **Enabled**
with Set/Edit. Enabled preferences show the lead as value plus calendar unit.
Unknown targets say a date is unavailable. Suggestions are optional choices,
never saved consent: yearly one calendar month before; trial three calendar
days before; weekly/monthly off. Active notifications have no dismissal control.
Their eligibility and expiry continue to be computed on read.

**Later** uses the existing question deferral. Show **Deferred — still available
here** and keep Answer reachable. The current writer also defers an empty amount,
cadence or renewal field for seven days where applicable; this design neither
adds a scheduler nor replaces that rule. Avoid the misleading promise that the
question disappears forever or that a notification has been snoozed.

Filters change emphasis, not which attached content exists. A selected row stays
open after completing the work that matched the filter, until closed. Preserve
selection, unsent target-specific conversation drafts and return focus/scroll
when navigating. Mobile quick access to reminders and conversation must not
require traversing the full field list.

## Existing action-to-writer mapping

Verified against repository commit `c5fc699` before design work. Reuse existing
request builders; this table is not a new API specification.

| Proposed UI action | Existing production path | Constraint |
|---|---|---|
| Saved field confirm/edit; notes-only save | `components/subscriptions/record-terms.tsx` → existing form payload builder/save-subscription → `PATCH /api/subscriptions/[id]` → `updateSubscription` in `lib/subscriptions/write.ts` | Exact intended fields; explicit unchanged confirm allowed; omit untouched fields |
| Actual terms change | Same PATCH with `termsChange.effectiveFrom`; shared amendment writer | Require user timing; first-fill stays ordinary completion |
| Stage/undo proposal field | `lib/fields/review.ts`: `stageTerm`, `unstageTerm`, `toAcceptConfirm`, `confirmSummary` | Local staging; no saved-row write |
| Accept selected proposal | `POST /api/proposals/[id]/accept` → `respondToProposal` → `acceptProposal` in `lib/proposals/decide.ts` | SUB-82: confirm exactly applied proposal money/date/auto-renewal values; transactional identity recheck; preserve conflicts/errors. Status-only accept still does not confirm money |
| Reject selected proposal | `POST /api/proposals/[id]/reject` → `rejectProposal` | One proposal only |
| Correct draft identity/use existing | `POST /api/proposals/[id]/retarget` | Re-run matching; enumerate compatible holdings; do not merge holdings or confirm unrelated facts. The prototype's single-match choice is not a production retarget implementation |
| Save reminder preference | Same subscription PATCH with `reminderPreferences` → `saveReminderPreferences` | Only explicit chosen preference; renewal/trial independent |
| Accept captured reminder instruction | Existing proposal accept path | Consent occurs on acceptance, not capture or suggestion |
| Later/answer question | `POST /api/chat` with exact `questionId`; Later uses message `later` → `deferQuestion` | Keep persisted deferred question reachable; preserve existing seven-day field behavior |
| Capture and conversation | Existing `/api/chat` and `/api/conversation` with explicit target | Capture produces proposals, never immediate ledger writes |
| Pending terms latest-wins fold | Follow-on SUB-88 (writers + composition) | Per-field latest wins among pending terms on one holding; mark prior pending `superseded`; retain evidence; lifecycle separate |

Do not turn a stale-target/duplicate-holding response into an automatic overwrite.
Explain the conflict and retain user input for a deliberate resolution. Stored
renewal and projected expected renewal must remain distinct throughout review.

## Delivery history and standing workflow

The orchestrator / Magic Patterns / implementer roles used to deliver this
contract are now the standing process in [design-workflow.md](design-workflow.md).
Do not treat them as project-only.

A **small shared design system** remains appropriate: semantic colors, typography,
spacing, borders, focus, buttons, field anatomy and feedback. Do not create a
separate design platform or adopt a second component framework by default.
Production tokens live in [ui-foundations.md](ui-foundations.md).

SUB-72–SUB-79 implemented and validated this contract. The issue map below is
this project's delivery history, not a live queue.

| Issue | Bounded implementation responsibility |
|---|---|
| SUB-72 | Shared tokens and common controls after approved contract |
| SUB-73 | Compact account-aware list, hierarchy and expanded-row boundary |
| SUB-74 | Shared field anatomy, exact confirm/edit and feedback states |
| SUB-75 | Compose saved facts and independently addressable proposals in one shell |
| SUB-76 | Direct independent reminder preferences and supporting disclosure |
| SUB-77 | Concise targeted capture, reachable questions and draft recovery |
| SUB-78 | Cross-surface responsive, keyboard and feedback refinement; earlier PRs still require accessibility checks |
| SUB-79 | Task comparison and explicit human sign-off of implemented UI |

The selected treatment is the approved production presentation, not permission
to copy the synthetic prototype's local state or account-matching shortcut.
Later UI work reuses the standing design workflow and existing writers. No
SUB-64 planned-cancellation scope is added.
