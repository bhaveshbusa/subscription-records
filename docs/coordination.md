# Coordination: GitHub, Linear, Devin, you

```text
Linear (what to do)  →  implementer (see below)  →  GitHub PR (review surface)
                                                         ↓
                                               You test on preview URL
                                                         ↓
                                               You sign off on Linear + merge
```

## This epic (SUB-21): Cursor, not Devin

Holdings-ledger work ([SUB-21](https://linear.app/lets-play-match/issue/SUB-21/holdings-ledger-not-a-payment-recorder) and children SUB-22–25) is implemented by **Cursor** in the IDE: one issue, branch, PR, then human sign-off. Do not assign or run Devin on these issues.

## Roles

| Role | Does | Does not |
|---|---|---|
| **You** | Run the jobs in [testing-and-signoff.md](testing-and-signoff.md), click through preview, comment blockers, merge | Implement features, write migrations |
| **Cursor** | Implement SUB-21 children in the IDE (one issue → branch → PR) | Assign Devin this epic, start the next child in the same PR |
| **Devin** | Pick the next **ready** Linear issue that is not this epic, implement on a branch, open a PR, respond to review | SUB-21–25, choose product direction, merge to `main`, skip sign-off |
| **Linear** | Single queue: issues, blockers, sign-off state | Store source of truth for architecture (that is `docs/`) |
| **GitHub** | Code, PRs, preview deploys, CI | The work backlog |

## Linear hygiene

- Project: Capture Subscriptions (team: Subscription records)
- Issue id prefix: `SUB-`
- States: `Backlog` → `Todo` / Ready for Devin → `In Progress` → `In Review` → `Done`
- **Done** only after you sign off (you merge, or you comment `SIGN-OFF`)
- One issue per PR. Do not recreate SUB-1–20.
- SUB-21–25 are Cursor work, not Ready for Devin

## GitHub hygiene

- Default branch: `main`
- Protect `main`: PR required, 1 approval (**you**), CI green
- Vercel preview on every PR — that is what you test
- After sign-off: squash merge, delete branch, Linear → Done

## Cursor loop (this epic)

1. Take one SUB-21 child whose blockers are **Done**
2. Read `AGENTS.md` + the files listed in the issue
3. Branch `sub-<n>-<slug>`
4. Implement only that issue. Do not start the next child in the same PR
5. Open PR `SUB-n: …` with a test plan the human can run without reading code
6. Wait. You (human) run the relevant jobs, then `SIGN-OFF` and merge

## Devin loop (repeat)

Skip this epic. For other ready issues:

1. Take one Linear issue whose dependencies are **Done**
2. Read `AGENTS.md` + the files listed in the issue
3. Branch `sub-<n>-<slug>`
4. Implement only that issue
5. Open PR `SUB-n: …` with a test plan the human can run without reading code
6. Wait. If you (human) comment, Devin fixes on the same PR
7. You run the relevant jobs, then `SIGN-OFF` and merge

If Devin is blocked on a secret, it comments on Linear and stops. You add the secret to Vercel/`.env.local`; you do not need to write code.

## Source of truth

| Question | Answer lives in |
|---|---|
| What to build this week | Linear issue |
| What “correct” means | `AGENTS.md`, `docs/product.md`, `docs/data-model.md`, `docs/query-and-ledger.md` |
| How to code | `AGENTS.md` |
| How it is wired | `docs/architecture.md` |
| Whether it shipped | GitHub `main` + Linear **Done** |
