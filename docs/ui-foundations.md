# Workspace UI foundations — SUB-72

Production source of truth: [`app/globals.css`](../app/globals.css) and
[`components/ui/foundations.tsx`](../components/ui/foundations.tsx). This is a
small vocabulary for the approved [Compact Rows v2 visual direction](https://www.magicpatterns.com/c/ni9pioqxgewnzfzrkbstpd)
(artifact `ef875056-8fdf-4e14-885e-9ab93cf5129f`) and the
[Integrated differences interaction](https://www.magicpatterns.com/c/c43nasqwufyxo1rqzizqci)
(v6 artifact `2ef1d750-8e1d-4627-8d77-4279b089b24a`). The Magic Patterns
`index.css` rules for paper/ink/green, a restrained line, compact controls and a
visible 3px focus outline are references; the tokens and components here are
authoritative for implementation. Later prototype drift requires an explicit
comparison, not a copy-paste theme replacement. New presentation work uses the
standing [design workflow](design-workflow.md).

| Prototype rule or component | Production token or component | Use |
|---|---|---|
| `--paper`, `--ink`, `--surface`, `--muted`, `--line` | `--ui-paper`, `--ui-ink`, `--ui-surface`, `--ui-muted`, `--ui-line` | Page, content, secondary text and dividers |
| `--green`, `--pale`, `.primary`, `.quiet` | `--ui-green`, `--ui-green-pale`, `Button` variants | One primary action; quieter supporting actions |
| `.label`, `.value`, `.field-line` | `FieldFrame`, `.ui-label`, `.ui-field-value`, `.ui-field-actions` | Field anatomy without changing confirmation scope |
| `.block`, `.secondary-disclosure` | `Surface`, `.ui-section`, `Disclosure` | Section boundaries and supporting evidence |
| `.trust`, `.status-*`, `.error` | `FieldStatusBadge`, `Feedback` | Text plus colour for state; recoverable errors |
| 390px larger controls, 3px focus, no ornamental motion | `.ui-button`, `:focus-visible`, reduced-motion rule | Keyboard and touch access |
| Compact list/header/filters and expanded-row boundary | `.workspace-shell`, `.workspace-row`, `.workspace-record--open` | SUB-73 list hierarchy; field confirm/edit remains SUB-74 |

`FieldReview` is the shared compact field line: label, prominent value when
present, quieter empty copy when absent, a trust word only when it is not the
steady Confirmed end state (Proposed / Inferred / Conflicted / Deferred; Missing
is omitted beside Not recorded), and quiet Edit / primary Confirm on one row.
Amount and cadence share a visual group without sharing confirmation scope.
Status edits inline (SUB-89): ordinary corrections are status-only; cancel /
schedule / reactivate expand timing before the shared lifecycle writers.
Expected dates are
read-only. Success, saving and error copy sit on the affected field. Precise
confirm/edit behaviour landed in SUB-74. The open row now composes saved facts
and independently addressable proposals in one shell (SUB-75): pending deltas
sit beside the saved value, drafts are labelled Proposed draft, and lifecycle
cards are not ordinary field corrections. Reminder preferences are a first-class
open-row section (SUB-76): Not set / Off / Enabled with Set or Edit, independent
renewal and trial-end writes, and suggestions that stay unapplied until chosen.
Notes, historical dates and amendments stay behind disclosure. Capture uses one
target indicator, keeps unsent drafts per target, and summarises conversation
turns for the selected holding (SUB-77). Original multi-item input stays behind
source disclosure. Later is deferred and still available here. SUB-78 is the
cross-surface responsive, keyboard and feedback pass: visible loading versus
empty, search-miss copy, a skip link, wrapping at 320px, and a filter-mismatch
notice that keeps the open row. No new dependency or writer was added.

The data-free review fixture is at `/ui-foundations` (not linked from the
product). At desktop and 390px, compare the same button hierarchy, long field
wrapping, status words, focus outline, disabled and busy states, disclosure and
error recovery. All fixture actions stay local. Secondary text on white has
5.66:1 contrast and on paper 5.11:1; primary text on white has 7.48:1. Proposed,
inferred and error text on their pale fills exceed 6.7:1. Disabled controls use
opaque readable colours rather than lowering text opacity. Native focus and
`prefers-reduced-motion` are supported; no motion is required to understand a
state. The SUB-76 gallery block shows Not set / Set, Enabled with a missing
date, a scannable Suggested line with a CTA that names the choice (for example
Use Off), and supporting-detail disclosure. The SUB-77 block
shows one target chip, file/voice/send, Deferred — still available here, and
Original capture disclosure.

## SUB-78 justified deviations from the approved prototype

Production is the live workspace, not a copy of the synthetic six-row demo.
Identity matching still enumerates every compatible holding; the prototype's
single-match shortcut is not used. Capture still writes pending proposals only.
[SUB-64](https://linear.app/lets-play-match/issue/SUB-64/remember-a-planned-cancellation-and-remind-the-user-to-act)
adds a Cancel plan block on the open row and due intentions in Reminders; it
does not change lifecycle status by itself.

The composer stays after saved terms in the DOM. On viewports below `lg`,
**Conversation** and **Reminders** jumps at the top of the open row reach those
actions without scrolling every field. Desktop keeps terms first and a sticky
composer. Changing a filter still closes a row that does not belong to it
(SUB-65); completing work that drops filter membership keeps the row open until
Close, with an explicit mismatch notice.

Tablet widths hide the collapsed-row date column so the remaining columns can
wrap; the recorded and expected dates remain on the open row. Account is not a
separate list column — when present it appears with plan under the provider on
the identity line. 320px drops the open-row side margin so the field column can
use the full width.

## Browser evidence (14 September 2026)

Foundation fixture `/ui-foundations` and the live `/workspace` list were
inspected with Chrome device metrics (not `resize_page`, which historically
clamped near 500 CSS pixels).

| Surface | Viewport | `scrollWidth` | Notes |
|---|---|---|---|
| `/ui-foundations` | 320 × 568 | 320 | Loading/empty/recovery copy visible; skip link present |
| `/ui-foundations` | 390 × 844 | 390 | Long field text wrapped |
| `/ui-foundations` | 768 × 1024 | 768 | Tablet, no overflow |
| `/ui-foundations` | 1280 × 800 | 1280 | First Tab focused **Skip to feedback** |
| `/workspace` | 320 × 568 | 320 | Harbor name wrapped; filters 44px min-height; capture summary wrapped; Conversation jump put the composer on screen |
| `/workspace` | 390 × 844 | 390 | No overflow |
| `/workspace` | 640 × 400 | 640 | 200% zoom equivalent of 1280 |
| `/workspace` | 768 × 1024 | 768 | Collapsed-row date column hidden; dates remain on the open row |
| `/workspace` | 1280 × 800 | 1280 | Skip link; detail toolbar `flex-start` |

Open questions with zero rows showed **No open questions.**, not a loading
status and not **No subscriptions yet.** Keyboard Tab on the gallery reached
the skip link first. These checks are not a substitute for a complete
accessibility audit or live extraction quality. SUB-79 human sign-off is in
[validation/sub-79-ui-signoff.md](validation/sub-79-ui-signoff.md).
