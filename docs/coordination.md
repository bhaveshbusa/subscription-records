# Coordination: GitHub, Linear, Devin, you

```text
Linear (what to do)  →  Devin (does it)  →  GitHub PR (review surface)
                                              ↓
                                    You test on preview URL
                                              ↓
                                    You sign off on Linear + merge
```

## Roles

| Role | Does | Does not |
|---|---|---|
| **You** | Run the sign-off checklist, click through preview, comment “blockers”, merge or request changes | Implement features, write migrations, prompt-engineer in the codebase |
| **Devin** | Pick the next **ready** Linear issue, implement on a branch, open a PR, respond to review comments | Choose product direction, merge to `main`, skip sign-off |
| **Linear** | Single queue: epics, issues, blockers, sign-off state | Store source of truth for architecture (that is `docs/`) |
| **GitHub** | Code, PRs, preview deploys, CI | The work backlog (duplicate issues here only if Devin requires a GH issue) |

## Linear hygiene

- Project: `Subscription recorder`
- Issue id prefix: `SUB-`
- States: `Backlog` → `Ready for Devin` → `In Progress` → `In Review` → `Ready for sign-off` → `Done`
- Only issues in **Ready for Devin** may be picked
- An issue is `Ready for sign-off` when the PR is green and Devin believes AC are met
- **Done** only after you comment `SIGN-OFF` on the Linear issue (or equivalent Linear status you set)

Labels:

- `epic:foundation` `epic:ledger` `epic:capture` `epic:lifecycle` `epic:multimodal` `epic:jobs`
- `needs-signoff`
- `blocked`

Priority: P0 (foundation + ledger query), P1 (manual write + chat text), P2 (lifecycle), P3 (files/voice/jobs)

## GitHub hygiene

- Default branch: `main`
- Protect `main`: PR required, 1 approval (**you**), CI green
- Vercel preview on every PR — that is what you test
- After sign-off: squash merge, delete branch, Linear → Done

## Devin loop (repeat)

1. Take the lowest `SUB-*` issue in **Ready for Devin** whose dependencies are **Done**
2. Read `AGENTS.md` + the files listed in the issue
3. Branch `sub-<n>-<slug>`
4. Implement only that issue
5. Open PR `SUB-n: …` with test plan copied from the issue
6. Move Linear to **In Review**
7. Wait. If you (human) comment, Devin fixes on the same PR
8. You move Linear to **Ready for sign-off**, run the checklist, then `SIGN-OFF` and merge

If Devin is blocked on a secret (Neon URL, Anthropic key), it comments on Linear and stops. You add the secret to Vercel/GitHub; you do not need to write code.

## Copying issues into Linear

Use [linear-issues.md](linear-issues.md). Create epics first, then issues, then set **blocked by** relations to match the `Depends on` field. Mark **SUB-1 through SUB-6** as Ready for Devin in order (only the next one Ready; rest Backlog) so Devin cannot skip the ledger.

## Source of truth

| Question | Answer lives in |
|---|---|
| What to build this week | Linear issue |
| What “correct” means | `docs/product.md`, `docs/data-model.md`, `docs/query-and-ledger.md` |
| How to code | `AGENTS.md` |
| Whether it shipped | GitHub `main` + Linear **Done** |
