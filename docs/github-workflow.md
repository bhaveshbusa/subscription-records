# GitHub workflow

## First-time setup (you, once)

1. GitHub repo on `main` with this documentation.
2. Enable Vercel ↔ GitHub. Set env names from `.env.example` (never commit values). Seed login is for Preview and local only.
3. Protect `main`: require PR, require your approval, require CI.
4. Invite Devin’s GitHub app/user with write to the repo.
5. Point Devin at: repo, Linear project, “read `AGENTS.md`”.

## Branching

- `main` is always deployable
- `sub-<n>-<slug>` per issue
- No long-lived `develop`

## PR template

Use `.github/PULL_REQUEST_TEMPLATE.md`. Devin fills it. You use the Test plan as your click-through, against the jobs in [testing-and-signoff.md](testing-and-signoff.md).

## CI

Lint, typecheck, unit tests (`npm test` against Postgres in GitHub Actions).

## Secrets

Never in git. Preview and production env in Vercel. Document **names** in README as they are added.

## Devin + GitHub issues

Prefer **Linear as the only backlog**. If Devin must have a GitHub issue, duplicate the Linear id in the GH title (`SUB-n: …`) and link Linear. Close the GH issue on merge; Linear **Done** only after your sign-off.
