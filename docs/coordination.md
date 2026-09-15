# Coordination: GitHub, Linear, Magic Patterns, implementer, you

```text
Linear (what to do)
    │
    ├─ presentation/interaction change ─→ Magic Patterns (synthetic prototype)
    │                                              ↓
    │                                    You choose an exact version
    │                                              ↓
    └─ ready implementation ──────────→ implementer  →  GitHub PR
                                                            ↓
                                                  You test on preview URL
                                                            ↓
                                                  You sign off on Linear + merge
```

Presentation and interaction exploration uses [design-workflow.md](design-workflow.md).
Domain behaviour still comes from `AGENTS.md` and the product contracts.

## Roles

| Role | Does | Does not |
|---|---|---|
| **You** | Compare prototypes, run the jobs in [testing-and-signoff.md](testing-and-signoff.md), click through preview, comment blockers, merge | Implement features, write migrations |
| **Orchestrator** | Brief, critique, exact approved prototype version and Linear queue | Own domain rules or merge to `main` |
| **Magic Patterns** | Synthetic interactive alternatives from the named issue | Domain rules, ledger writes, production code |
| **Implementer** | Pick one **ready** Linear issue, adapt any approved design to existing components/writers, open a PR, respond to review | Choose product direction, paste prototype code, merge to `main`, skip sign-off, start the next issue in the same PR |
| **Linear** | Single queue: issues, blockers, selected design versions, sign-off state | Store source of truth for architecture (that is `docs/`) |
| **GitHub** | Code, PRs, preview deploys, CI | The work backlog |

## Linear hygiene

- Team: **Subscription records**. Issue id prefix: `SUB-`
- States: `Backlog` → `Todo` / Ready → `In Progress` → `Done`. There is **no** `In Review`: a PR'd issue stays **In Progress** with the PR attached until you sign off
- **Done** only after you sign off (you merge, or you comment `SIGN-OFF`)
- One issue per PR
- Presentation issues name the approved Magic Patterns URL **and** artifact version before implementation starts. See [design-workflow.md](design-workflow.md).

### Completed projects

The [Subscription UI & Interaction Design](https://linear.app/lets-play-match/project/subscription-ui-and-interaction-design-8eda300f9f49)
project concluded on 15 September 2026 after SUB-79 and SUB-80 sign-off. Compact
Rows v2 and Integrated differences remain the approved presentation in
[subscription-ui-interaction-contract.md](subscription-ui-interaction-contract.md).
The Magic Patterns handoff proven there is now the standing design workflow,
not a project-only process. Unreported SUB-79 comparison-task outcomes are not
claimed as passed. Remaining observations, including SUB-81, belong in their
own issue. SUB-64 remains Backlog and outside that completed scope.

The [Subscription Workspace UX](https://linear.app/lets-play-match/project/subscription-workspace-ux-6fb87b2cf4de)
workspace including SUB-66–SUB-69 landed earlier. Bhavesh signed off SUB-63 and
concluded that project on 13 September 2026 after real onboarding. The
[validation record](validation/sub-63-run-2026-09-11.md) records the outcome
and unreported checks; [testing-and-signoff.md](testing-and-signoff.md) remains
a reusable guide. Current interaction decisions live in [product.md](product.md)
and [user-journeys.md](user-journeys.md). Earlier history sits on Stage One and
Capture Subscriptions.

Completed implementation plans have been retired; Git and Linear retain the
delivery history. Preserve the current domain contracts when fixing any
validation finding.

## GitHub hygiene

- Default branch: `main`
- Protect `main`: PR required, 1 approval (**you**), CI green
- Vercel preview on every PR — that is what you test
- After sign-off: squash merge, delete branch, Linear → Done

## Implementer loop

1. Take one Linear issue whose dependencies are **Done**
2. Read `AGENTS.md` + the files listed in the issue. If the issue changes
   presentation, also read [design-workflow.md](design-workflow.md) and the
   named prototype version
3. Branch `sub-<n>-<slug>`
4. Implement only that issue
5. Open PR `SUB-n: …` with a test plan the human can run without reading code
6. Wait. If you (human) comment, the implementer fixes on the same PR
7. You run the relevant jobs, then `SIGN-OFF` and merge

If the implementer is blocked on a secret, it comments on Linear and stops. You add the secret to Vercel/`.env.local`; you do not need to write code.

## Source of truth

| Question | Answer lives in |
|---|---|
| What to build this week | Linear issue |
| What “correct” means | `AGENTS.md`, `docs/product.md`, `docs/data-model.md`, `docs/query-and-ledger.md` |
| How to explore and hand off UI | `docs/design-workflow.md` |
| Approved workspace presentation | `docs/subscription-ui-interaction-contract.md`, `docs/ui-foundations.md` |
| How to code | `AGENTS.md` |
| How it is wired | `docs/architecture.md` |
| Whether it shipped | GitHub `main` + Linear **Done** |
