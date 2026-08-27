# Linear issues (create these)

Create a Linear project **Subscription recorder**. Create **epics** (parent issues) first, then children. Set relations from `Depends on`. Copy **Devin prompt** into the Linear description.

Priority: P0 = SUB-1–6, P1 = SUB-7–10, P2 = SUB-11–14, P3 = SUB-15–19.

Until Gate A, only one issue should be **Ready for Devin** at a time.

---

## Epic: Foundation

### SUB-1 — Scaffold Next.js app, Auth.js, deploy preview

- **Depends on:** none
- **Labels:** `epic:foundation`
- **Devin prompt:**
  Follow `AGENTS.md`. Create a Next.js App Router TypeScript app in the repo root with Tailwind, ESLint, `npm run lint`, `npm run typecheck`, `npm test` (vitest smoke). Add Auth.js v5 with credentials provider for development (`SEED_EMAIL` / `SEED_PASSWORD` env) and a magic-link placeholder for production (can no-op send in preview). Pages: `/login`, `/` redirect to `/ledger` (ledger can 404 until SUB-4). Protect `/ledger` with session. README: how to run locally. GitHub Actions: lint, typecheck, test. Do not add database yet.
- **Acceptance criteria:**
  - [ ] `npm run dev` shows login
  - [ ] Wrong password fails; seed user reaches a logged-in shell
  - [ ] Unauthenticated `/ledger` redirects to login
  - [ ] CI workflow exists
  - [ ] No DB
- **You test:** Log in on Vercel preview with seed credentials from the PR description.

### SUB-2 — Postgres schema, Drizzle, seed subscriptions

- **Depends on:** SUB-1
- **Labels:** `epic:foundation`
- **Devin prompt:**
  Implement `docs/data-model.md` tables: `subscriptions`, `amendments`, `charges`, `events` (+ Auth.js adapter tables if needed). Drizzle migrations. Seed command `npm run db:seed` that upserts 10 GBP subscriptions as specified in `docs/query-and-ledger.md` (mix of statuses and field_status). Document `DATABASE_URL` in README. Do not build list UI.
- **Acceptance criteria:**
  - [ ] Migration applies on empty Neon/Postgres
  - [ ] Seed is idempotent
  - [ ] Seed matches the mix in query-and-ledger.md
  - [ ] `user_id` on all ledger tables
- **You test:** You do not need to; Gate A covers data via UI. Optional: Devin includes seed screenshot of `SELECT count(*)`.

---

## Epic: Ledger (view and query)

### SUB-3 — Subscriptions query API

- **Depends on:** SUB-2
- **Labels:** `epic:ledger`
- **Devin prompt:**
  Implement `GET /api/subscriptions`, `GET /api/subscriptions/summary`, `GET /api/subscriptions/:id` exactly as `docs/query-and-ledger.md`. Session-scoped. Zod-validate query params. Money as minor integers. Pagination cursor. Vitest or integration tests with seeded DB (or transactional test db). No UI.
- **Acceptance criteria:**
  - [ ] `q=net` returns Netflix not Spotify
  - [ ] `status=active` excludes cancelled
  - [ ] `renewingWithinDays` works
  - [ ] Other user’s rows never appear (test with two users or a second seeded user)
  - [ ] 404 on `:id` for wrong user
  - [ ] Summary monthly equivalent uses cadence rules in the doc
- **You test:** Optional curl from PR; mandatory in Gate A with UI.

### SUB-4 — Ledger list UI (`/ledger`)

- **Depends on:** SUB-3
- **Labels:** `epic:ledger` `needs-signoff`
- **Devin prompt:**
  Build `/ledger` per `docs/query-and-ledger.md` UI spec: summary stats, search, status chips, table, row trust labels, link to detail (detail can be stub). Client fetches the query API. Loading and empty states. Accessible table.
- **Acceptance criteria:**
  - [ ] Seeded data visible after login
  - [ ] Search and filters change the table
  - [ ] Summary numbers match API
  - [ ] Mobile-usable (viewport 390px: table scrolls, stats wrap)
- **You test:** Gate A part 1 (list). This is the first **must** click-through.

### SUB-5 — Ledger detail UI (`/ledger/[id]`)

- **Depends on:** SUB-4
- **Labels:** `epic:ledger` `needs-signoff`
- **Devin prompt:**
  Detail page from `GET /api/subscriptions/:id`. Show current terms, each field’s value **and** field_status, amendments (even if one), events/charges or “No activity yet”. Back to list. Invalid id → 404 page.
- **Acceptance criteria:**
  - [ ] Inferred vs confirmed is visible without reading JSON
  - [ ] Cancelled seed row still opens
  - [ ] Deep link works when logged in
- **You test:** Open Netflix and the cancelled row.

### SUB-6 — Needs-attention filter, sort, pagination

- **Depends on:** SUB-5
- **Labels:** `epic:ledger` `needs-signoff`
- **Devin prompt:**
  Chip “Needs attention” using the definition in query-and-ledger.md. All sort keys. Cursor pagination in UI if > page size (set limit 5 in a test or story to prove it). Preserve query string in the URL (`?q=&status=`) so refresh keeps filters.
- **Acceptance criteria:**
  - [ ] URL is shareable/refreshable for current filters
  - [ ] Needs attention count matches summary
  - [ ] Sort by next renewal: nulls last
- **You test:** Full **Gate A** checklist in `docs/testing-and-signoff.md`.

---

## Epic: Manual write

### SUB-7 — Manual create and edit

- **Depends on:** SUB-6 (Gate A should be Done)
- **Labels:** `epic:ledger` `needs-signoff`
- **Devin prompt:**
  `/ledger/new` and edit on detail. User can save **incomplete** (provider only). Setting amount/cadence/renewal via this form marks those fields `confirmed` (user is the authority). PATCH/POST APIs session-scoped. Do not add AI.
- **Acceptance criteria:**
  - [ ] Create “TestCo” with no amount → appears in list
  - [ ] Edit amount to £9.99 monthly → field_status confirmed
  - [ ] Cannot edit another user’s id
- **You test:** **Gate B**.

### SUB-8 — Proposal table and accept/reject (no LLM)

- **Depends on:** SUB-7
- **Labels:** `epic:capture`
- **Devin prompt:**
  Add `proposals` table (`docs/data-model.md` kinds). Admin/dev-only or “Inbox” page listing pending proposals. `POST /api/proposals/:id/accept|reject`. Accept create/update applies in a transaction using domain rules in AGENTS.md (no silent confirm of money if proposal payload says proposed). Seed one pending create proposal for a new provider so inbox is not empty. No LLM.
- **Acceptance criteria:**
  - [ ] Accept create → subscription in ledger
  - [ ] Reject → not in ledger
  - [ ] Accepting amount as `proposed` does not mark `confirmed`
- **You test:** Accept and reject the seeded proposal.

---

## Epic: Capture (text)

### SUB-9 — Chat UI + text/list extraction

- **Depends on:** SUB-8
- **Labels:** `epic:capture`
- **Devin prompt:**
  `/chat`. User message → server calls Claude with JSON schema from product docs (candidates + evidence). Persist `captures` (kind=text). Create **pending proposals**, do not write ledger rows until accept. Lists must yield N candidates. Stream or return cards. At most one follow-up question (highest priority missing field among amount/cadence/renewal, or duplicate ask). Anthropic key server-side. If no key in preview, return a clearly labeled stub extractor that only runs in development with fixtures — do not fake production.
- **Acceptance criteria:**
  - [ ] “I subscribed to Linear” → one proposal, stub allowed in ledger only after accept
  - [ ] Pasted list of 4 names → 4 proposals
  - [ ] Ledger unchanged until accept
- **You test:** Two messages on preview; do not SIGN-OFF Gate C yet.

### SUB-10 — Duplicate match + confirm money in chat

- **Depends on:** SUB-9
- **Labels:** `epic:capture` `needs-signoff`
- **Devin prompt:**
  Match candidates to existing subscriptions (canonical provider). High match → propose `update`/`charged` not create. User accept/edit on cards. Confirming a quoted amount in the card sets `confirmed`. One question per turn. Deferred: “later” sets `deferred` and must not re-ask in the next message.
- **Acceptance criteria:**
  - [ ] Second “Netflix” does not create Netflix #2
  - [ ] Rejected proposal leaves ledger unchanged
  - [ ] Money stays unconfirmed if user only accepts identity
- **You test:** **Gate C**.

---

## Epic: Lifecycle

### SUB-11 — Charges (continuity)

- **Depends on:** SUB-10
- **Labels:** `epic:lifecycle`
- **Devin prompt:**
  Classify “paid Spotify £10.99 today” as `charged` on match. Idempotency. Update `last_paid` via event; infer next renewal only as `inferred`. Do not change confirmed amount on mismatch — conflict + `terms_changed` proposal (can stub classify and finish in SUB-12).
- **Acceptance criteria:**
  - [ ] Charge appears on detail timeline
  - [ ] Repeat same payment does not duplicate
  - [ ] No second subscription
- **You test:** Pay flow on an existing seed sub.

### SUB-12 — Price / plan / cadence amendments

- **Depends on:** SUB-11
- **Labels:** `epic:lifecycle`
- **Devin prompt:**
  `terms_changed`: close open amendment, open new. Projection amount updates only after user accepts. History of old price remains.
- **Acceptance criteria:**
  - [ ] After accepted hike, detail shows new price and old amendment dates
  - [ ] Rejected hike leaves confirmed price
- **You test:** Netflix price change.

### SUB-13 — Cancel, cancel-at-period-end, lapse proposal

- **Depends on:** SUB-12
- **Labels:** `epic:lifecycle`
- **Devin prompt:**
  Map language per product discussion: “I cancelled” asks now vs period end if ambiguous. Never mark cancelled from “I don’t use it”. Status updates only on accept. Keep identity.
- **Acceptance criteria:**
  - [ ] Cancelled row still in All, gone from Active
  - [ ] cancel_scheduled still active-ish with ends_on
- **You test:** Cancel one sub.

### SUB-14 — Reactivate vs new identity

- **Depends on:** SUB-13
- **Labels:** `epic:lifecycle` `needs-signoff`
- **Devin prompt:**
  New charge/chat after cancelled → propose `reactivated` same id, new amendment. Ask if account hint differs.
- **Acceptance criteria:**
  - [ ] One Netflix id through cancel + resubscribe
- **You test:** **Gate D**.

---

## Epic: Multimodal

### SUB-15 — Screenshot / image capture

- **Depends on:** SUB-14
- **Labels:** `epic:multimodal`
- **Devin prompt:**
  Upload to R2 (or S3) via signed URL. Inngest (or equivalent) job: vision extract → proposals. Chat shows “reading…” then cards. Private bucket.
- **Acceptance criteria:**
  - [ ] Image never public
  - [ ] Proposals, not auto-ledger
- **You test:** Upload a redacted screenshot.

### SUB-16 — PDF invoices

- **Depends on:** SUB-15
- **Labels:** `epic:multimodal`
- **Devin prompt:**
  Text layer first; vision pages if needed. Same proposal pipeline. Page cap to control cost.
- **Acceptance criteria:**
  - [ ] Selectable-text PDF produces candidates
- **You test:** One short PDF.

### SUB-17 — Voice notes

- **Depends on:** SUB-16
- **Labels:** `epic:multimodal` `needs-signoff`
- **Devin prompt:**
  Browser MediaRecorder → Whisper (Groq or similar) → same extract path.
- **Acceptance criteria:**
  - [ ] Spoken “add Notion” becomes a proposal
- **You test:** **Gate E**.

---

## Epic: Jobs

### SUB-18 — Daily lapse scan

- **Depends on:** SUB-14 (can parallel multimodal)
- **Labels:** `epic:jobs`
- **Devin prompt:**
  Inngest cron: active + next_renewal older than grace, no charge in window → pending `lapsed` proposal or inbox question. Do not auto-set cancelled.
- **Acceptance criteria:**
  - [ ] Job can be run manually in preview
  - [ ] Status unchanged until accept
- **You test:** Trigger job on a seed row with past renewal.

### SUB-19 — Reminders for deferred and renewals

- **Depends on:** SUB-18
- **Labels:** `epic:jobs` `needs-signoff`
- **Devin prompt:**
  Email or in-app inbox for `deferred_until` and upcoming renewal. No silent field writes.
- **Acceptance criteria:**
  - [ ] Reminder does not confirm dates
- **You test:** **Gate F**.

---

## Import order

Create epics → create SUB-1…SUB-19 → link parent → set blocked-by → set SUB-1 to **Ready for Devin**.
