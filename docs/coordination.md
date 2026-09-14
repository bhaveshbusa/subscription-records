# Coordination: GitHub, Linear, implementer, you

```text
Linear (what to do)  →  implementer  →  GitHub PR (review surface)
                                                         ↓
                                               You test on preview URL
                                                         ↓
                                               You sign off on Linear + merge
```

## Roles

| Role | Does | Does not |
|---|---|---|
| **You** | Run the jobs in [testing-and-signoff.md](testing-and-signoff.md), click through preview, comment blockers, merge | Implement features, write migrations |
| **Implementer** | Pick one **ready** Linear issue, implement on a branch, open a PR, respond to review | Choose product direction, merge to `main`, skip sign-off, start the next issue in the same PR |
| **Linear** | Single queue: issues, blockers, sign-off state | Store source of truth for architecture (that is `docs/`) |
| **GitHub** | Code, PRs, preview deploys, CI | The work backlog |

## Linear hygiene

The UI design phase is tracked in [Subscription UI & Interaction Design](https://linear.app/lets-play-match/project/subscription-ui-and-interaction-design-8eda300f9f49).
SUB-70's Compact Rows v2 direction is approved. SUB-71 develops the interaction
contract for human review before SUB-72–SUB-79 implementation and validation.
See [the proposed contract](subscription-ui-interaction-contract.md) for the
orchestrator/Magic Patterns/implementer roles and bounded downstream scope.
The Workspace UX project below remains the underlying behavioral contract.

- Project: **Subscription Workspace UX** (team: Subscription records). Completed history sits on the Stage One and Capture Subscriptions projects.
- Issue id prefix: `SUB-`
- States: `Backlog` → `Todo` / Ready → `In Progress` → `Done`. There is **no** `In Review`: a PR'd issue stays **In Progress** with the PR attached until you sign off
- **Done** only after you sign off (you merge, or you comment `SIGN-OFF`)
- One issue per PR

### Current project: Subscription Workspace UX

The workspace including SUB-66–SUB-69 has landed. Bhavesh signed off SUB-63 and concluded the project on 13 September 2026 after real onboarding. The [validation record](validation/sub-63-run-2026-09-11.md) records the outcome and unreported checks; [testing-and-signoff.md](testing-and-signoff.md) remains a reusable guide. Current interaction decisions live in [product.md](product.md) and [user-journeys.md](user-journeys.md). SUB-64 remains Backlog and outside the completed scope.

Completed implementation plans have been retired; Git and Linear retain the delivery history. Preserve the current domain contracts when fixing any validation finding.

## GitHub hygiene

- Default branch: `main`
- Protect `main`: PR required, 1 approval (**you**), CI green
- Vercel preview on every PR — that is what you test
- After sign-off: squash merge, delete branch, Linear → Done

## Implementer loop

1. Take one Linear issue whose dependencies are **Done**
2. Read `AGENTS.md` + the files listed in the issue
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
| How to code | `AGENTS.md` |
| How it is wired | `docs/architecture.md` |
| Whether it shipped | GitHub `main` + Linear **Done** |
