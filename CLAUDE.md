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

Tests are not all pure. `lib/**/api.integration.test.ts` opens a real Postgres
connection, and `vitest.config.ts` loads `.env.local`, so `DATABASE_URL` must
point at a live database or those suites fail.

**Do not run `npm run db:seed` against the database you test with.** Those
suites insert their own fixtures in `beforeAll` using the same fixed ids as
`lib/db/seed.ts`. On a seeded database the `beforeAll` dies on `users_pkey`,
every test in the file is skipped, and `npm test` still exits 0 — 108 tests
quietly do not run. `.github/workflows/ci.yml` migrates and never seeds.

A cloud session gets this right automatically via `scripts/cloud-setup.sh`.
Locally, either keep a separate unseeded test database or drop and re-migrate
before trusting a green run. See [README.md](README.md#database).
