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

- Project: **Subscription Workspace UX** (team: Subscription records). Completed history sits on the Stage One and Capture Subscriptions projects.
- Issue id prefix: `SUB-`
- States: `Backlog` → `Todo` / Ready → `In Progress` → `Done`. There is **no** `In Review`: a PR'd issue stays **In Progress** with the PR attached until you sign off
- **Done** only after you sign off (you merge, or you comment `SIGN-OFF`)
- One issue per PR

### Current project: Subscription Workspace UX

The workspace through SUB-65 has landed. [SUB-63](https://linear.app/lets-play-match/issue/SUB-63/validate-the-subscription-workspace-with-real-onboarding-and-return) is the real-use validation activity, guided by [testing-and-signoff.md](testing-and-signoff.md). The current interaction decisions are in [product.md](product.md) and [user-journeys.md](user-journeys.md). SUB-64 is out of scope.

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
