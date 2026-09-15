# Design workflow (Magic Patterns)

Standing workflow for presentation and interaction changes. It was proven during
[Subscription UI & Interaction Design](https://linear.app/lets-play-match/project/subscription-ui-and-interaction-design-8eda300f9f49)
(SUB-70–SUB-79) and is not scoped to that project.

Magic Patterns holds a **versioned design reference**. The repository holds
approved production tokens, components and product contracts. A prototype does
not silently become production authority. Generated prototype code is a design
spec, not a drop-in replacement for this Next.js app.

[AGENTS.md](../AGENTS.md) still governs money, dates, trust, identity, lifecycle
and reminders. Presentation work cannot change those rules.

## When to prototype

Use Magic Patterns when the Linear issue changes **layout, hierarchy or
interaction**, or when alternatives need a reviewable comparison before
production UI work.

Skip a new prototype when the issue is a small follow-on under the already
approved vocabulary (copy, spacing, token use) or when there is no presentation
change. Precise field/trust behaviour is specified on the issue; the
implementer checks domain compatibility rather than inventing a new interaction.

The current production presentation is the [SUB-71 interaction
contract](subscription-ui-interaction-contract.md), mapped in
[ui-foundations.md](ui-foundations.md). New UI work starts from that vocabulary,
not from a blank prototype.

## Roles

| Role | Does | Does not |
|---|---|---|
| **You** | Compare concrete alternatives, run ordinary tasks, choose an exact version, sign off and merge | Implement production UI, write migrations |
| **Orchestrator** | Owns the brief, critique, exact approved version, Linear queue and design parity | Own domain rules or merge to `main` |
| **Magic Patterns** | Generates and iterates **synthetic** interactive alternatives from the named issue and approved UI context | Own domain rules, write ledger rows, or ship production code |
| **Implementer** | Checks feasibility early; adapts the approved version to existing React/Tailwind components and shared writers; opens one issue's PR | Copy prototype local state, matching shortcuts or generated scaffolding; start the next issue in the same PR |
| **Linear** | Issue brief, selected URL/version, decisions and status | Store architecture or production tokens |
| **GitHub** | Implementation, documentation review, preview deploys | The design backlog |

Mobbin is optional reference research when a specific interaction lacks a good
pattern. It is not a mandatory dependency on every issue.

## Integration flow

1. **Linear → Magic Patterns.** Restrict the working prompt to the named issue
   and its approved context. The orchestrator remains responsible for backlog
   edits, acceptance criteria and issue state.
2. **GitHub → Magic Patterns.** Attach approved UI folders and concise product
   rules as read context. Repository context is not an imported second design
   system, and it does not make generated designs automatically suitable for
   this app.
3. **Human selection.** Record the chosen editor URL **and** immutable artifact
   version on the Linear issue. Repository design artifacts, if any, use a
   docs-only PR. Implementation stays blocked until that choice is published.
4. **Magic Patterns → implementer.** Retrieve the selected version with the
   Cursor Magic Patterns plugin/MCP, or an export / copy-as-prompt if the
   connector is unavailable. Adapt design intent to existing components, APIs
   and writers.
5. **Preview → review.** The implementer links the PR and Vercel preview. The
   orchestrator compares the chosen version; you run the tasks. Differences are
   documented, not silently edited into a moving prototype.

An export is an acceptable fallback. Do not block design on plumbing, and never
copy `.env`, credentials or real invoices into a design tool.

## Handoff to implementation

Each implementation issue that follows a prototype includes:

- one Linear issue
- approved prototype URL **and** version
- desktop and 390px states in scope
- interaction/state matrix where behaviour changed
- source component pointers
- mapping to existing writers (no new API by default)
- explicit exclusions
- human test tasks the reviewer can run without reading code

## Constraints

- Use **synthetic** fixtures. Private subscription evidence stays out of Magic
  Patterns.
- Saved and proposed values stay distinguishable even in one surface. Confirm
  only the intended fields. Do not invent money, dates, auto-renewal or
  reminder consent.
- Do not paste Magic Patterns code, tokens, local `useState` simulations or
  account-matching shortcuts into production. Prefer existing
  `components/ui/` controls and the writers already named on the issue.
- Later prototype drift requires an explicit comparison. It is not a
  copy-paste theme replacement of [ui-foundations.md](ui-foundations.md).
- One issue per PR. Keep Linear **In Progress** until human sign-off. Do not
  merge.

Vendor references: [connectors](https://www.magicpatterns.com/docs/documentation/connectors/connectors),
[GitHub context](https://www.magicpatterns.com/docs/documentation/importing/connect-github),
[MCP](https://www.magicpatterns.com/docs/documentation/features/mcp-server/overview),
[integration](https://www.magicpatterns.com/docs/documentation/exporting/integration-skill).
