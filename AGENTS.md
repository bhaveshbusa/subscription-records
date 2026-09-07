# Agent instructions (for any implementation agent)

This file is the contract for any coding agent. Product and architecture details live in `docs/`. Do not re-litigate them in a PR.

## Where "correct" is defined

| Question | File |
|---|---|
| How to code, what never to violate | this file |
| What the product is | [docs/product.md](docs/product.md) |
| Data model | [docs/data-model.md](docs/data-model.md) |
| List, detail, query API | [docs/query-and-ledger.md](docs/query-and-ledger.md) |
| How it is wired | [docs/architecture.md](docs/architecture.md) |
| Who does what, and when | [docs/coordination.md](docs/coordination.md) |
| How to run and verify it | [README.md](README.md) |

A Linear issue says *what to build this week*. These files say *what correct
means*. When an issue and these files disagree, stop and ask — do not guess
money, date, or lifecycle behavior.

## Your job

Implement **exactly one Linear issue per PR**, linked in the PR body. Stop when that issue’s acceptance criteria are met. Do not start the next issue in the same PR.

The human’s job is testing and sign-off, not writing code. Open the PR and leave the Linear issue **In Progress** — this team has no `In Review` state, and `Done` is the human's after sign-off. Do not merge to `main` yourself.

If a requirement is ambiguous, open a PR comment or Linear comment and wait. Do not guess product behavior for money, dates, or lifecycle.

## Stack (locked)

| Layer | Choice |
|---|---|
| App | Next.js (App Router) + TypeScript |
| UI | React + Tailwind CSS |
| DB | Postgres + Drizzle ORM |
| Validation | Zod |
| Auth | Auth.js (Auth.js v5) with magic-link email in production; seeded credentials in development |
| Hosting | Vercel (app) + Neon (Postgres) |
| Files | Cloudflare R2 or S3-compatible (local disk `.captures` when keys are unset) |
| Jobs | **None.** Nothing runs on a schedule; a job that writes money or dates is a second author of the ledger |
| LLM | Anthropic Claude via **server-only** SDK; Groq Whisper for voice |

Do not add a second ORM, a second auth library, Redux, or a multi-agent framework.

## Repo conventions

- Feature branches: `sub-<linear-id>-<short-slug>` e.g. `sub-4-ledger-list`
- One issue → one PR → squash merge after **human sign-off**
- PR title: `SUB-N: <issue title>`
- PR body must include: Linear id, summary, test plan, screenshots or curl for UI/API
- Migrations are Drizzle SQL in `drizzle/` and must be reversible in spirit (additive preferred)
- `user_id` on every business table; every query filters by session user
- No LLM API keys in the client. No public object storage.

## Domain rules (never violate)

The ledger records **what the user holds, what it costs, and when the next payment is due**. It does not record payments.

- Do not auto-confirm `amount`, `cadence`, or `next_renewal`. Status for those fields is `proposed` or `inferred` until a user action sets `confirmed`.
- Do not overwrite confirmed money/date fields. Write a `terms_changed` proposal or a `conflicted` field. No exception for a passed `next_renewal` — see below.
- Do not delete subscription identity on cancel. Append a `cancelled` event and close the open amendment.
- Match before create. A mention of a service already in the ledger updates that row. It is not a new subscription. The reason is holding identity, not “a payment is not a new sub”.
- A receipt or “I paid” updates **holding, cost, and next due**. It does not write a payment.
- A holding row whose **stored** `next_renewal` is in the past is **overdue** — not cancelled, not `lapsed`. Keep the stored date until the user acts. Do not roll it forward in an unattended job and do not substitute a future date in list or detail.
- Do not infer `cancelled` from silence or from a date passing.
- There is no `lapsed` status. User-stated expiry, a failed card, or “not renewed” is `cancelled`. A past date is overdue until the user says they still hold it (rolls `next_renewal` forward by cadence as `inferred`, never `confirmed`) or that it stopped (`cancelled`).
- A past date the user states is the event date. Do not snap cancel to today. Relative past dates (“three months ago”) are valid cancel timing.
- Incomplete rows are done enough. Do not block saving on complete money fields.
- Capture (chat, files, voice) writes **pending proposals** only. It does not write ledger rows until accept.
- Inbox is the workbench: pending proposals, overdue holdings, unfinished rows, and a renewing-soon glance. The ledger stays inventory — no “needs attention” chip there.

## Definition of done (every issue)

- [ ] Acceptance criteria in the Linear issue are checked off
- [ ] `npm test` / `npm run lint` / `npm run typecheck` pass. `npm test` brings up its own throwaway Postgres; **never** point `npm run db:seed` at it — seed rows make every integration suite die in `beforeAll`, which Vitest reports as *skipped* while the run still exits 0. See [README.md](README.md#tests)
- [ ] Seed or fixture data exists if the UI would otherwise be empty
- [ ] No secrets committed
- [ ] PR links the Linear issue
- [ ] Human has a written test plan they can execute without reading the code

## What not to do

- Do not implement “while I’m here” extras (email ingest, mobile apps, pricing scrapers, share links, teams)
- Do not block saving a subscription on complete money fields
- Do not show fake precision confidence like `0.87`; use high / medium / low if you show it at all
- Do not call live vendor pricing APIs as source of truth
