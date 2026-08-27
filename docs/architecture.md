# Architecture (web-cloud)

```text
Browser  ──HTTPS──►  Next.js (Vercel)
                       │
                       ├─ App Router pages: /ledger, /ledger/[id], /chat (later)
                       ├─ Route handlers: /api/subscriptions...
                       ├─ Auth.js session
                       │
                       ├─ Drizzle ──► Neon Postgres
                       │
                       └─ (later) signed upload ──► R2
                          (later) Inngest workers ──► Anthropic / Whisper
```

## Three stores (logical)

1. **Captures** — immutable inputs (text, files). Phase 2+.
2. **Proposals** — AI or system suggestions waiting for accept/edit/reject. Phase 3+.
3. **Ledger** — subscriptions + amendments + charges + events. **Phase 1 reads this.**

The list UI is a **projection** of the ledger, never a second source of truth.

## Sync vs async

| Sync (request) | Async (Inngest, later) |
|---|---|
| Session, list/query, detail, accept proposal, manual CRUD | Vision/OCR, STT, PDF, daily lapse scan, reminders |

Chat text extraction may run in-request if it is fast; file interpretation must be a job.

## Security

- Session required for all `/api/*` except auth routes and health
- `user_id` from session, never from the client body for authorization
- LLM keys and object credentials only in Vercel env
- Signed URLs for files, private bucket
- RLS optional if using Supabase; with Neon, enforce in queries

## Environments

| Env | Purpose |
|---|---|
| `development` | Seed user + 10 subscriptions; magic-link or `SEED_LOGIN` |
| Preview (Vercel) | What you test per PR |
| Production | Your real inventory; no seed rows |

## Later workers (do not build in SUB-1–6)

See `docs/plan.md` epics Capture, Lifecycle, Multimodal, Jobs.
