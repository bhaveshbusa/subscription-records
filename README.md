# Personal subscription recorder

A **web-cloud** assistant that turns messy input (chat, lists, screenshots, PDFs, voice) into a trustworthy personal subscription inventory.

Success is not growth. Success is whether **you** can maintain your own inventory with less effort than a spreadsheet, without the system silently inventing prices or dates.

Your role: **test and sign off**. An agent implements. GitHub holds code and PRs. Linear holds the work queue.

## Start here

| If you need | Open |
|---|---|
| How the three tools work together | [docs/coordination.md](docs/coordination.md) |
| What the product is / what is out of scope | [docs/plan.md](docs/plan.md) |
| Acceptance checks for a change | [docs/testing-and-signoff.md](docs/testing-and-signoff.md) |
| Rules for any implementation agent | [AGENTS.md](AGENTS.md) |
| Product + AI layers | [docs/product.md](docs/product.md) |
| List, detail, query API | [docs/query-and-ledger.md](docs/query-and-ledger.md) |
| System map: modules, dependencies, environments | [docs/architecture.md](docs/architecture.md) |
| Data model | [docs/data-model.md](docs/data-model.md) |
| The agreed next UX phase | [docs/subscription-workspace-ux-plan.md](docs/subscription-workspace-ux-plan.md) + [journeys](docs/subscription-workspace-ux-acceptance-journeys.md) |

## Non-negotiables

1. The AI **proposes**. It does not silently decide cost, billing cadence, or renewal dates.
2. A subscription with only a provider name is valid. Incomplete stubs are first-class.
3. Lifecycle is an **event log** (starts, terms changes, cancels). The list you see is a projection.
4. Every query is scoped to the signed-in `user_id`.
5. Capture (chat, files, voice) becomes **proposals**. The ledger does not change until you accept.
6. A subscription is held or it is **cancelled**. There is no third status: an
   expiry, a failed card, or "it wasn't renewed" is the user telling you it
   stopped, which is the same claim. A date that has merely passed is not an
   ending. Keep the **stored** due date; do not replace it with a projected
   future date. After SUB-48 a separate expected date may sit beside it.
7. Expected schedules, reminder preferences, and actual lifecycle changes are
   different things. Cadence does not confirm auto-renewal. Inbox reminders
   have no dismiss and expire after the due date. Nothing runs on a schedule.

## Run locally

Requirements:

- Node.js 20.19, 22.13, or a newer LTS release
- npm 10 or newer

```bash
npm install
cp .env.example .env.local
openssl rand -base64 32
```

Put the generated value in `AUTH_SECRET`, then start the app:

```bash
npm run dev
```

Open `http://localhost:3000`. Local and Vercel preview deployments use
`SEED_EMAIL` and `SEED_PASSWORD` for the credentials sign-in. The production
surface shows the magic-link placeholder until persistent Auth.js storage is
added in a later issue.

### Database

Create a Postgres database, for example a Neon project, and copy its pooled
connection string into `DATABASE_URL`. Then apply the schema and development
data:

```bash
npm run db:migrate
npm run db:seed
```

Migrations live in `drizzle/`.

### Tests

`npm test` runs against a throwaway `postgres:16` container, not the database in
`.env.local`:

```bash
npm test
```

`pretest` starts the container (port 5433), applies migrations, and leaves it
unseeded. Stop it with `npm run test:db:down`.

**Never run `npm run db:seed` against the test database.** The integration
suites insert their own fixtures using the same fixed ids as `lib/db/seed.ts`,
so seed rows make every one of them fail in `beforeAll` — and because that
happens in `beforeAll`, the files are reported as *skipped* while `npm test`
still exits 0. A guard in `vitest.global-setup.ts` now stops the run with an
explanation instead.

The suite picks its database in this order: `TEST_DATABASE_URL` if you set one;
otherwise `DATABASE_URL` in CI and cloud sessions, which supply their own
migrated, unseeded database; otherwise the container.

## Environment

| Variable | Purpose |
|---|---|
| `AUTH_SECRET` | Signs Auth.js session tokens |
| `SEED_EMAIL` | Seed login email for development and previews |
| `SEED_PASSWORD` | Seed login password for development and previews |
| `DATABASE_URL` | Postgres connection string for Drizzle |
| `ANTHROPIC_API_KEY` | Server-only key for capture extraction; without it, capture reads with development fixtures and refuses to run anywhere else |
| `ANTHROPIC_MODEL` | Optional model override for chat extraction |
| `GROQ_API_KEY` | Server-only key for transcribing voice notes; without it, recording is unavailable and says so |
| `GROQ_TRANSCRIPTION_MODEL` | Optional Whisper model override; defaults to `whisper-large-v3-turbo` |
| `CAPTURE_STORAGE_BUCKET` | Private R2 or S3 bucket that holds uploaded screenshots, PDFs, and recordings |
| `CAPTURE_STORAGE_ENDPOINT` | S3-compatible endpoint for that bucket |
| `CAPTURE_STORAGE_REGION` | Optional region; defaults to `auto` for R2 |
| `CAPTURE_STORAGE_ACCESS_KEY_ID` | Server-only credential for the bucket |
| `CAPTURE_STORAGE_SECRET_ACCESS_KEY` | Server-only credential for the bucket |

Set these variables in Vercel Preview. Production only requires
`AUTH_SECRET` for the current placeholder.

## Query API

All routes require a session and return only the signed-in user's rows. The
session carries an email; ledger rows are keyed by `users.id`, so each request
resolves the email to a user row first. Money is always integer minor units.

| Route | Notes |
|---|---|
| `GET /api/subscriptions` | `q`, `status` (comma list), `renewingWithinDays`, `coverage` (`confirmed` \| `unconfirmed` \| `omitted` \| `afterTrial`), `sort` (`provider` \| `nextRenewal` \| `monthlyEquivalent` \| `updatedAt`), `order`, `limit` (max 100), `cursor` |
| `GET /api/subscriptions/summary` | Counts, named paid-commitment monthly equivalent, confirmed vs unconfirmed coverage, after-trial and omissions, next upcoming renewal |
| `GET /api/subscriptions/:id` | Full projection with amendments and events; 404 for another user's row |
| `GET /api/inbox` | The ledger sections of Inbox → `overdue`, `unfinished`, `reminders` |
| `POST /api/inbox/overdue/:id/still-holding` | Rolls a passed due date forward by cadence as `inferred`; 409 if the row is not overdue or has no cadence |
| `POST /api/inbox/overdue/:id/cancel` | Ends an overdue row through the shared lifecycle writer after the user states the actual end date. `{ unknownTiming: true }` leaves it unresolved and may save a note |
| `POST /api/chat` | `{ "message": "..." }` → the stored capture id, pending `create` proposals, one follow-up question at most, and the extractor used |
| `POST /api/captures/files` | `{ "fileName", "mediaType", "byteSize" }` → the capture id and a signed upload of one screenshot, PDF, or recording to one server-chosen key |
| `POST /api/captures/files/:id/read` | Reads the uploaded file → `reading`, `read` with pending proposals, or `failed` with why |
| `GET /api/proposals` | `state` (comma list of `pending`, `accepted`, `rejected`, `superseded`; pending by default), `limit` |
| `POST /api/proposals/:id/accept` | Applies the proposal in one transaction; optional `{ "confirm": … }` confirms the money it quotes. 404 for another user's, 409 if it is not pending |
| `POST /api/proposals/:id/reject` | Records the decision and leaves the ledger alone |
| `POST /api/subscriptions` | Manual add. A provider name is enough; money and dates are optional |
| `PATCH /api/subscriptions/:id` | Manual edit. What you type here is **confirmed** — it is your own answer |

Monthly equivalent is computed for display only: monthly as-is, yearly
`round(amount / 12)`, weekly `round(amount * 52 / 12)`. The summary names a
**recorded GBP paid-commitment monthly equivalent**: the sum of per-row rounded
GBP amounts for `active` and `cancel_scheduled` holdings that have both amount
and cadence. Trials are excluded from that current paid total and shown
separately as after trial. Confirmed coverage needs confirmed amount and
confirmed cadence; unconfirmed calculable rows are listed apart. Missing
price/cadence and non-GBP rows are omissions, not zero. There is no FX
conversion.

```bash
curl -s --cookie "$SESSION_COOKIE" 'http://localhost:3000/api/subscriptions?q=net'
```

## Text capture

The composer on `/inbox` stores the message in `captures` and answers with pending proposals.
Nothing reaches the ledger until a proposal is accepted, and amounts, cadences,
and renewal dates arrive as `proposed`.

With `ANTHROPIC_API_KEY` set, extraction is one server-side Claude call with a
tool schema, validated with Zod. Without a key, development and test runs fall
back to a pattern-matching fixture extractor and every response is labelled as
such; a preview or production server returns `503 extractor_unavailable`
instead, so a missing key never looks like a working product.

```bash
curl -s --cookie "$SESSION_COOKIE" -H 'Content-Type: application/json' \
  -d '{"message":"I subscribed to Linear"}' http://localhost:3000/api/chat
```

One message is read in one call, and one call holds up to 25 subscriptions. A
list longer than that is read as far as the cap, with a notice saying so, so the
rest can be sent in another message. When a reply runs out of room the call
answers `502 extraction_failed` with `reason: "truncated"` and a message saying
the list was too long to read in one go — nothing is saved, and the composer
keeps what you typed so you can split it and send again. A reply that comes back
unreadable answers the same way with `reason: "malformed"`; the schema detail
goes to the server log, never to you.

```json
{
  "error": "extraction_failed",
  "reason": "truncated",
  "message": "That was too long to read in one go, so nothing was saved. Send it in smaller batches - about 10 subscriptions at a time - and each batch comes back as its own proposals."
}
```

## Screenshot and PDF capture

`Add screenshot or PDF` on `/inbox` sends the file straight to private storage on
a URL this server signed for one key and one content type, then asks the server
to read it. The chat shows `Reading…` until the reading finishes and answers with
the same proposal cards a message would; the ledger still only changes when a
proposal is accepted.

The file is never public. Nothing the browser receives can read a stored
object: reads happen server-side and the bytes go to Claude inline. Uploads are
refused unless they are a PNG, JPEG, or WebP under 5 MB, or a PDF under 10 MB.

A PDF is read by its own text layer first, up to the first five pages: an
invoice exported from a billing portal already carries its words, and reading
them is exact and costs nothing. The cards say when a longer document was only
read that far. A PDF with no text layer - a scan or a photographed bill - has
its pages looked at instead, and one past the page cap is refused with a note to
upload the pages that matter as screenshots.

With the `CAPTURE_STORAGE_*` variables set, files live in the private bucket.
Without them, development and test runs keep files in the git-ignored
`.captures` directory outside `public/` and a preview or production server
returns `503 storage_unavailable` rather than storing a receipt somewhere less
private.

```bash
# Ask for an upload, PUT the file to the signed URL, then read it.
curl -s --cookie "$SESSION_COOKIE" -H 'Content-Type: application/json' \
  -d '{"fileName":"receipt.png","mediaType":"image/png","byteSize":24000}' \
  http://localhost:3000/api/captures/files
curl -s --cookie "$SESSION_COOKIE" -X PUT -H 'Content-Type: image/png' \
  --data-binary @receipt.png "http://localhost:3000$UPLOAD_PATH"
curl -s --cookie "$SESSION_COOKIE" -X POST \
  http://localhost:3000/api/captures/files/$CAPTURE_ID/read

# The same three calls read a PDF invoice.
curl -s --cookie "$SESSION_COOKIE" -H 'Content-Type: application/json' \
  -d '{"fileName":"invoice.pdf","mediaType":"application/pdf","byteSize":180000}' \
  http://localhost:3000/api/captures/files
```

## Voice notes

`Record a voice note` on `/inbox` records with the browser's `MediaRecorder` -
Opus in WebM where that is supported, MP4 in Safari - and stops itself after two
minutes so an open microphone is not left running. The recording goes down the
same path a screenshot does: a signed upload to private storage, a reading on
the server, pending proposal cards. Saying "add Notion" produces a Notion
proposal, and the cards are headed with what was heard so they can be read
against the recording.

The transcription is one server-side Whisper call to Groq with the recording's
own bytes, so no link to a stored recording is ever minted. There is no
development stand-in: a recording cannot be read without listening to it, so
without `GROQ_API_KEY` the reading fails with a message saying the key is
missing rather than quietly proposing nothing. The transcript then goes through
the same extractor a typed message does, and the ledger still only changes when
a proposal is accepted. Recordings are refused over 10 MB.

```bash
# The same three calls read a recording.
curl -s --cookie "$SESSION_COOKIE" -H 'Content-Type: application/json' \
  -d '{"fileName":"voice-note.webm","mediaType":"audio/webm","byteSize":18000}' \
  http://localhost:3000/api/captures/files
curl -s --cookie "$SESSION_COOKIE" -X PUT -H 'Content-Type: audio/webm' \
  --data-binary @voice-note.webm "http://localhost:3000$UPLOAD_PATH"
curl -s --cookie "$SESSION_COOKIE" -X POST \
  http://localhost:3000/api/captures/files/$CAPTURE_ID/read
```

## Overdue renewals

Subscriptions rarely announce that they stopped: the renewal date passes, no
payment arrives, and the row keeps saying `active`. That row is **overdue**. It
is not cancelled, and the passed date is not evidence of anything except that
nobody has said what happened.

So nothing moves it unattended. There is no job that rolls an overdue `next_renewal`
forward, and list and detail return the **stored** date with the field status it
really has — a `confirmed` date that has passed comes back as that past date,
still `confirmed`, not as a future date stuffed into the same field. After
SUB-48 an **expected** next date may appear beside it, labelled inferred/expected,
and only for active confirmed auto-renewal with confirmed cadence and confirmed
recorded date. Advancing the **stored** date by cadence asserts the user still
holds the subscription, and only the user can make that claim: from Inbox,
through a manual edit, or by accepting a proposal.

Overdue holdings that still need reconciliation belong in Inbox. After SUB-48 a
confirmed auto-renewing active holding does not enter Overdue merely because
its stored date has passed. The ledger is inventory and marks nothing: no
attention chip, filter, or count.

**Still have it** rolls the passed date forward by cadence until it is today or
later and marks it `inferred` — never `confirmed`, because the user said they
hold the subscription, not that they checked the date. Amount, cadence and
status are left alone, so the row simply leaves Overdue.

**Cancelled** ends the row the same way an accepted `cancelled` proposal does:
status `cancelled`, `ends_on` set, `next_renewal` cleared, the open amendment
closed, and a `cancelled` event on its history. The identity stays — it is the
same subscription, now over. It ends on the **actual date the user states**,
not a stale stored renewal and not today. If they do not know when it ended,
the row stays unresolved and a note may be stored.

## Inbox

Inbox is the work list. On `main`, four sections, each hidden when it is empty:

| Section | What is in it |
|---|---|
| Proposals | Pending captures, waiting on accept or reject |
| Overdue | Holdings whose stored `next_renewal` has passed (narrowed after SUB-48) |
| Unfinished | `unknown` rows, conflicting terms, and deferrals that came due |
| Reminders | Enabled preferences whose window is open (`reminderDate` through due date). No dismiss. Weekly appears only if you asked. |

An enabled reminder is visible from its reminder date through the due date and
disappears the next calendar day. Opening Inbox does not clear a card. Expiry
writes no ledger row.

The last three come from `GET /api/inbox`, projected over `subscriptions` and
reminder preferences on every request. Nothing is stored, so there is no
card to dismiss and nothing to fall out of step with the ledger. Only Overdue
carries actions; the other sections list rows and link to detail.

Capture sits at the top of the same page, sticky, so what you type and what it
raises are never two screens apart. It asks nothing on open, and follows up at
most once per turn — a price, a cadence, when something stopped — about that
turn only, never the ledger at large. That one question stays with the box; it
is not mixed into Overdue or Reminders.

A proposal is rendered once, in Proposals, however it got there. There is no
transcript: a capture box is not a conversation, and a decided proposal should
not linger in a scrollback pretending it is still open. `/chat` redirects here.

## No background jobs

Nothing runs on a schedule. There is no cron, no queue, and no Inngest: the app
only ever does work a request asked for.

That is a product decision, not a gap. A job that writes to the ledger is a
second author of money and dates, and the whole point of this ledger is that
only the user is. The two jobs that used to exist both failed that test — one
rolled overdue due dates forward, the other persisted "renews Friday" cards —
and both were replaced by projections you can read on demand: **Overdue**,
**Unfinished** and **Reminders** on `/inbox` are computed from `subscriptions`
and reminder preferences when you open the page. There is no job, no
notification table, and no dismiss: eligibility is computed on read.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

GitHub Actions runs lint, typecheck, and tests for every pull request.
The API tests need Postgres: they read `DATABASE_URL`, run inside a
transaction that is rolled back, and are skipped when the variable is unset.
CI starts a `postgres:16` service and applies migrations before `npm test`.

## Status

The product and what is out of scope: [docs/plan.md](docs/plan.md).
Contract: [AGENTS.md](AGENTS.md), [docs/product.md](docs/product.md).
Stage One is complete; the agreed **Subscription Workspace UX** phase is
published in [docs/subscription-workspace-ux-plan.md](docs/subscription-workspace-ux-plan.md)
and is not implemented yet.
