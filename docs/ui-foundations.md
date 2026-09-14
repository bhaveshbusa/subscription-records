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
comparison, not a copy-paste theme replacement.

| Prototype rule or component | Production token or component | Use |
|---|---|---|
| `--paper`, `--ink`, `--surface`, `--muted`, `--line` | `--ui-paper`, `--ui-ink`, `--ui-surface`, `--ui-muted`, `--ui-line` | Page, content, secondary text and dividers |
| `--green`, `--pale`, `.primary`, `.quiet` | `--ui-green`, `--ui-green-pale`, `Button` variants | One primary action; quieter supporting actions |
| `.label`, `.value`, `.field-line` | `FieldFrame`, `.ui-label`, `.ui-field-value`, `.ui-field-actions` | Field anatomy without changing confirmation scope |
| `.block`, `.secondary-disclosure` | `Surface`, `.ui-section`, `Disclosure` | Section boundaries and supporting evidence |
| `.trust`, `.status-*`, `.error` | `FieldStatusBadge`, `Feedback` | Text plus colour for state; recoverable errors |
| 390px larger controls, 3px focus, no ornamental motion | `.ui-button`, `:focus-visible`, reduced-motion rule | Keyboard and touch access |
| Compact list/header/filters and expanded-row boundary | `.workspace-shell`, `.workspace-row`, `.workspace-record--open` | SUB-73 list hierarchy; field confirm/edit remains SUB-74 |

`FieldReview` is the shared compact field line: label, prominent value, a
trust word, and quiet Edit / primary Confirm on one row. Amount and cadence
share a visual group without sharing confirmation scope. Expected dates are
read-only. Success, saving and error copy sit on the affected field. Precise
confirm/edit behaviour landed in SUB-74. The open row now composes saved facts
and independently addressable proposals in one shell (SUB-75): pending deltas
sit beside the saved value, drafts are labelled Proposed draft, and lifecycle
cards are not ordinary field corrections. Reminder preferences are a first-class
open-row section (SUB-76): Not set / Off / Enabled with Set or Edit, independent
renewal and trial-end writes, and suggestions that stay unapplied until chosen.
Notes, historical dates and amendments stay behind disclosure. Composer and
reachable questions remain SUB-77. No new dependency or writer was added.

The data-free review fixture is at `/ui-foundations` (not linked from the
product). At desktop and 390px, compare the same button hierarchy, long field
wrapping, status words, focus outline, disabled and busy states, disclosure and
error recovery. All fixture actions stay local. Secondary text on white has
5.66:1 contrast and on paper 5.11:1; primary text on white has 7.48:1. Proposed,
inferred and error text on their pale fills exceed 6.7:1. Disabled controls use
opaque readable colours rather than lowering text opacity. Native focus and
`prefers-reduced-motion` are supported; no motion is required to understand a
state. The SUB-76 gallery block shows Not set / Set, Enabled with a missing
date, Use this suggestion, and supporting-detail disclosure; at 500 CSS pixels
`document.documentElement.scrollWidth` remained 500.

## Browser evidence (14 September 2026)

The built `/ui-foundations` page was inspected with synthetic content. At
390 × 844 CSS pixels, `document.documentElement.scrollWidth` was **390px**;
the field area measured 324px and the long account/plan text wrapped. At
1280 × 800, scroll width was **1280px** and the field gallery formed two 447px
columns. Keyboard Tab reached the primary action first with a computed 3px
`#18745c` outline. The gallery visibly includes default, disabled, busy,
error, long-content and disclosure states; hover styling is defined by the
shared button rule. These checks are specific to this foundation fixture, not
a substitute for later full-workspace responsive or accessibility sign-off.
