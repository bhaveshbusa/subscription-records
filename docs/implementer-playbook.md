# Implementer playbook

## Before writing code

1. Confirm the Linear issue is ready and dependencies are **Done**.
2. Read `AGENTS.md` and every `docs/` file the issue cites. The current contract rules live there; Linear identifies the change to make.
3. If the issue changes layout, hierarchy or interaction, read [design-workflow.md](design-workflow.md) and retrieve the named Magic Patterns URL **and** artifact version. Adapt that design to existing components and writers. Do not paste generated prototype code, local `useState` simulations or matching shortcuts. Small copy, spacing or token follow-ons under the approved vocabulary do not need a new prototype.
4. Do not guess money or date behavior. Comment and wait.
5. Do not bundle another issue or an unrelated validation finding into this PR.

## While implementing

- One issue per branch/PR
- Ledger list/detail/query copy must match `docs/query-and-ledger.md`
- Put seed credentials and preview (or local) test steps in the PR body
- Link the approved prototype version on a presentation PR so the human can compare
- If `DATABASE_URL` or API keys are missing, stop and comment on Linear

## After opening the PR

Attach the PR to the Linear issue and leave it **In Progress** — this team has no `In Review` state, and `Done` is the human's after sign-off. Do not merge. Wait for the human.

If the human comments `SIGN-OFF`, they will merge (or they may ask you to merge if that permission exists). Prefer human merge.

## If the issue is too large

Split in Linear, finish a thin vertical slice, do not ship a partial API that the next issue cannot use.
