# Personal subscription recorder

A **web-cloud** assistant that turns messy input (chat, lists, screenshots, PDFs, voice) into a trustworthy personal subscription inventory.

Success is not growth. Success is whether **you** can maintain your own inventory with less effort than a spreadsheet, without the system silently inventing prices or dates.

Your role: **test and sign off**. An agent implements. GitHub holds code and PRs. Linear holds the work queue.

## Start here

| If you need | Open |
|---|---|
| How the three tools work together | [docs/coordination.md](docs/coordination.md) |
| What the product is / what is out of scope | [docs/plan.md](docs/plan.md) |
| Jobs to verify a change | [docs/testing-and-signoff.md](docs/testing-and-signoff.md) |
| Rules for Devin (and any agent) | [AGENTS.md](AGENTS.md) |
| Product + AI layers | [docs/product.md](docs/product.md) |
| List, detail, query API | [docs/query-and-ledger.md](docs/query-and-ledger.md) |
| System map: modules, dependencies, environments | [docs/architecture.md](docs/architecture.md) |
| Data model | [docs/data-model.md](docs/data-model.md) |

## Non-negotiables

1. The AI **proposes**. It does not silently decide cost, billing cadence, or renewal dates.
2. A subscription with only a provider name is valid. Incomplete stubs are first-class.
3. Lifecycle is an **event log** (starts, terms changes, cancels). The list you see is a projection.
4. Every query is scoped to the signed-in `user_id`.
5. Capture (chat, files, voice) becomes **proposals**. The ledger does not change until you accept.

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

## Environment

| Variable | Purpose |
|---|---|
| `AUTH_SECRET` | Signs Auth.js session tokens |
| `SEED_EMAIL` | Seed login email for development and previews |
| `SEED_PASSWORD` | Seed login password for development and previews |
| `DATABASE_URL` | Postgres connection string for Drizzle |
| `ANTHROPIC_API_KEY` | Server-only key for chat extraction; without it, `/chat` reads with development fixtures and refuses to run anywhere else |
| `ANTHROPIC_MODEL` | Optional model override for chat extraction |
| `GROQ_API_KEY` | Server-only key for transcribing voice notes; without it, recording is unavailable and says so |
| `GROQ_TRANSCRIPTION_MODEL` | Optional Whisper model override; defaults to `whisper-large-v3-turbo` |
| `CAPTURE_STORAGE_BUCKET` | Private R2 or S3 bucket that holds uploaded screenshots, PDFs, and recordings |
| `CAPTURE_STORAGE_ENDPOINT` | S3-compatible endpoint for that bucket |
| `CAPTURE_STORAGE_REGION` | Optional region; defaults to `auto` for R2 |
| `CAPTURE_STORAGE_ACCESS_KEY_ID` | Server-only credential for the bucket |
| `CAPTURE_STORAGE_SECRET_ACCESS_KEY` | Server-only credential for the bucket |
| `INNGEST_EVENT_KEY` | Server-only key that lets Inngest run the nightly lapse scan; without it the scan is only reachable by hand |
| `INNGEST_SIGNING_KEY` | Server-only key Inngest signs its callbacks with |

Set these variables in Vercel Preview. Production only requires
`AUTH_SECRET` for the current placeholder.

## Query API

All routes require a session and return only the signed-in user's rows. The
session carries an email; ledger rows are keyed by `users.id`, so each request
resolves the email to a user row first. Money is always integer minor units.

| Route | Notes |
|---|---|
| `GET /api/subscriptions` | `q`, `status` (comma list), `renewingWithinDays`, `sort` (`provider` \| `nextRenewal` \| `monthlyEquivalent` \| `updatedAt`), `order`, `limit` (max 100), `cursor` |
| `GET /api/subscriptions/summary` | Counts, monthly equivalent total, next upcoming renewal |
| `GET /api/subscriptions/:id` | Full projection with amendments and events; 404 for another user's row |
| `POST /api/chat` | `{ "message": "..." }` → the stored capture id, pending `create` proposals, one follow-up question at most, and the extractor used |
| `POST /api/captures/files` | `{ "fileName", "mediaType", "byteSize" }` → the capture id and a signed upload of one screenshot, PDF, or recording to one server-chosen key |
| `POST /api/jobs/lapse-scan` | Runs the lapse scan now over your own rows → what it raised and what it skipped, and why |
| `POST /api/jobs/reminder-scan` | Runs the reminder scan now over your own rows → the reminders it raised, and the window it looked in |
| `GET /api/reminders` | `state` (comma list of `pending`, `dismissed`; pending by default), `limit` (max 100), soonest due first |
| `POST /api/reminders/:id/dismiss` | Marks one reminder seen; 404 for another user's, 409 for one already dismissed |
| `POST /api/captures/files/:id/read` | Reads the uploaded file → `reading`, `read` with pending proposals, or `failed` with why |

Monthly equivalent is computed for display only: monthly as-is, yearly
`round(amount / 12)`, weekly `round(amount * 52 / 12)`. The summary total sums
the per-row rounded GBP amounts for subscriptions that still bill (`active`,
`trial`, `cancel_scheduled`); rows with no amount or cadence contribute nothing.

```bash
curl -s --cookie "$SESSION_COOKIE" 'http://localhost:3000/api/subscriptions?q=net'
```

## Chat capture

`/chat` stores the message in `captures` and answers with pending proposals.
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

## Screenshot and PDF capture

`Add screenshot or PDF` in `/chat` sends the file straight to private storage on
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

`Record a voice note` in `/chat` records with the browser's `MediaRecorder` -
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

## Daily lapse scan

Subscriptions rarely announce that they stopped: the renewal date passes, no
payment arrives, and the row keeps saying `active`. An Inngest cron runs at 07:00
Europe/London and looks for exactly that — `active`, a renewal date more than
seven days past, and no payment recorded on or after it — and raises a **pending**
`lapsed` proposal for the inbox.

The scan never writes a status. A subscription becomes `lapsed`, with the missed
renewal as its end date, only when the proposal is accepted, and rejecting one
says the subscription is still running, so that renewal is not raised again. A
later payment dated on or after the renewal answers the question by itself and
the scan stays quiet.

In development and previews the inbox carries a `Run lapse scan` button so the
job can be tested without waiting for 07:00 or configuring Inngest. It runs the
same scan, scoped to the signed-in user:

```bash
curl -s --cookie "$SESSION_COOKIE" -X POST http://localhost:3000/api/jobs/lapse-scan
```

With the `INNGEST_*` keys set, `/api/inngest` is where Inngest registers the
cron and the `jobs/lapse-scan.requested` event, which scans one user when its
payload names a `userId` and everybody otherwise.

## Reminders

Two things go quiet on their own: a question you put off, and a renewal you
forgot was coming. A second Inngest cron runs at 07:15 Europe/London and writes a
reminder for each — a term whose `deferred_until` day has arrived, and an `active`
or `trial` renewal falling today through the next seven days. An overdue renewal
is the lapse scan's business, not a reminder's.

A reminder is a note in the inbox and nothing more. The scan writes no
subscription column: it does not confirm the date it is reminding you about, does
not fill in a term you deferred, and raises no proposal. The card says how far the
ledger trusts the date it quotes — confirmed, proposed, inferred, or nobody's
guess — and links to the subscription, which is the only place a date changes.
Dismissing a reminder says "seen" and leaves the row alone. The same subscription,
reminder kind and day is never raised twice, dismissed or not.

In development and previews the inbox carries a `Run reminder scan` button, so the
job can be tested without waiting for 07:15 or configuring Inngest:

```bash
curl -s --cookie "$SESSION_COOKIE" -X POST http://localhost:3000/api/jobs/reminder-scan
curl -s --cookie "$SESSION_COOKIE" 'http://localhost:3000/api/reminders?state=pending'
```

With the `INNGEST_*` keys set, `/api/inngest` also registers this cron and the
`jobs/reminder-scan.requested` event, which scans one user when its payload names
a `userId` and everybody otherwise.

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
