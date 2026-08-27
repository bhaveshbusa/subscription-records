# Agent instructions (Devin and others)

This file is the contract for any coding agent. Product and architecture details live in `docs/`. Do not re-litigate them in a PR.

## Your job

Implement **exactly one Linear issue per PR**, linked in the PR body. Stop when that issue’s acceptance criteria are met. Do not start the next issue in the same PR.

The human’s job is testing and sign-off, not writing code. If a requirement is ambiguous, open a PR comment or Linear comment and wait. Do not guess product behavior for money or dates.

## Stack (locked)

| Layer | Choice |
|---|---|
| App | Next.js (App Router) + TypeScript |
| UI | React + Tailwind CSS |
| DB | Postgres + Drizzle ORM |
| Validation | Zod |
| Auth | Auth.js (Auth.js v5) with magic-link email in production; seeded credentials in development |
| Hosting | Vercel (app) + Neon (Postgres) |
| Files (later issues) | Cloudflare R2 or S3-compatible |
| Jobs (later issues) | Inngest |
| LLM (later issues) | Anthropic Claude via **server-only** SDK |

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

- Do not auto-confirm `amount`, `cadence`, or `next_renewal`. Status for those fields is `proposed` or `inferred` until a user action sets `confirmed`.
- Do not overwrite confirmed money/date fields. Write a `terms_changed` proposal or a `conflicted` field.
- Do not delete subscription identity on cancel. Append a `cancelled` event and close the open amendment.
- A payment (`charged`) matches an existing subscription when possible. It is not a new subscription by default.
- Do not create Netflix #2 because someone paid again. Match, then propose `charged` or `reactivated`.
- Capture AI (chat, OCR, STT) must not ship before **SUB-4 / SUB-5** (ledger list + query) are signed off, unless the issue you are on explicitly depends on a later epic.

## Definition of done (every issue)

- [ ] Acceptance criteria in the Linear issue are checked off
- [ ] `npm test` / `npm run lint` / `npm run typecheck` pass (once those scripts exist)
- [ ] Seed or fixture data exists if the UI would otherwise be empty
- [ ] No secrets committed
- [ ] PR links the Linear issue
- [ ] Human has a written test plan they can execute without reading the code

## What not to do

- Do not implement “while I’m here” extras (email ingest, mobile apps, pricing scrapers, share links, teams)
- Do not block saving a subscription on complete money fields
- Do not show fake precision confidence like `0.87`; use high / medium / low if you show it at all
- Do not call live vendor pricing APIs as source of truth
