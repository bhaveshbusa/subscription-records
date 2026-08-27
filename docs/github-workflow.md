# GitHub workflow

## First-time setup (you, once)

1. Create a GitHub repo and push `main` with this documentation.
2. Enable Vercel ↔ GitHub; set env: `AUTH_SECRET`, `DATABASE_URL` (Neon), seed login, later `ANTHROPIC_API_KEY`, R2 keys.
3. Protect `main`: require PR, require your approval, require CI.
4. Invite Devin’s GitHub app/user with write to the repo.
5. Create Linear issues from [linear-issues.md](linear-issues.md).
6. Point Devin at: repo, Linear project, “take Ready for Devin only”, “read AGENTS.md”.

## Branching

- `main` is always deployable
- `sub-<n>-<slug>` per issue
- No long-lived `develop`

## PR template

Use `.github/PULL_REQUEST_TEMPLATE.md`. Devin fills it. You use the Test plan section as your click-through.

## CI

Lint, typecheck, unit tests. Optional: Playwright later (SUB-4+); not required for SUB-1.

## Secrets

Never in git. Preview and production env in Vercel. Document names in README as Devin adds them.

## Devin + GitHub issues

Prefer **Linear as the only backlog**. If Devin must have a GitHub issue, duplicate the Linear id in the GH title (`SUB-4: …`) and link Linear. Close GH issue on merge; Linear Done only after your sign-off.
