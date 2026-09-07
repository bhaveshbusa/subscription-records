# CLAUDE.md

Read **[AGENTS.md](AGENTS.md) before writing any code.** It is the contract:
stack, repo conventions, domain rules, and definition of done. Do not
re-litigate it in a PR.

## Where "correct" is defined

| Question | File |
|---|---|
| How to code, what never to violate | [AGENTS.md](AGENTS.md) |
| What the product is | [docs/product.md](docs/product.md) |
| Data model | [docs/data-model.md](docs/data-model.md) |
| List, detail, query API | [docs/query-and-ledger.md](docs/query-and-ledger.md) |
| How it is wired | [docs/architecture.md](docs/architecture.md) |
| Who does what, and when | [docs/coordination.md](docs/coordination.md) |

A Linear issue says *what to build this week*. These files say *what correct
means*. When an issue and these files disagree, stop and ask — do not guess
money, date, or lifecycle behavior.

## The loop

One Linear issue → one branch `sub-<n>-<slug>` → one PR titled `SUB-n: <title>`
→ human sign-off → squash merge. Do not start the next issue in the same PR.
Do not merge to `main` yourself.

Before you call an issue done: `npm run lint`, `npm run typecheck`, `npm test`.

## Local setup

`npm test` needs no setup: `pretest` starts an ephemeral `postgres:16` on port
5433 (`docker-compose.yml`), migrates it, and `vitest.config.ts` points the
suite there — **not** at the `DATABASE_URL` in your `.env.local`. CI and cloud
sessions provide their own. Docker must be running locally; that is the only
prerequisite.

Tests are not all pure: every `lib/**/*integration.test.ts` file opens a real
Postgres connection, and each one runs inside a transaction that is rolled back.

**Never point `npm run db:seed` at the database the tests use.** Those suites
insert their own fixtures in `beforeAll` using the same fixed ids as
`lib/db/seed-data.ts`. On a seeded database the `beforeAll` dies on
`users_pkey`, Vitest reports the whole file as *skipped*, and `npm test` still
exits 0 — a green run that tested nothing. The separate test container exists
so this cannot happen by accident; keep it that way. See
[README.md](README.md#database) and `vitest.config.ts`.
