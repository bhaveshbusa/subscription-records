# Devin playbook

## Before writing code

1. Confirm the Linear issue is **Ready for Devin** and dependencies are **Done**.
2. Read `AGENTS.md` and every `docs/` file the issue cites.
3. If Gate A is not Done, refuse capture/LLM issues.

## While implementing

- One issue per branch/PR
- Match API and UI copy in `docs/query-and-ledger.md` when on SUB-3–6
- Put seed credentials and preview test steps in the PR body
- If `DATABASE_URL` or API keys are missing, stop and comment on Linear

## After opening the PR

Move Linear to **In Review**. Do not merge. Wait for the human.

If the human comments `SIGN-OFF`, they will merge (or they may ask you to merge if that permission exists). Prefer human merge.

## If the issue is too large

Split in Linear, finish a thin vertical slice, do not ship a partial API that the next issue cannot use.
