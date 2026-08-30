# Personal subscription recorder

A **web-cloud** assistant that turns messy input (chat, lists, screenshots, PDFs, voice) into a trustworthy personal subscription inventory.

Success is not growth. Success is whether **you** can maintain your own inventory with less effort than a spreadsheet, without the system silently inventing prices or dates.

Your role: **test and sign off**. Devin implements. GitHub holds code and PRs. Linear holds the work queue.

## Start here

| If you need | Open |
|---|---|
| How the three tools work together | [docs/coordination.md](docs/coordination.md) |
| Why ledger view/query is first | [docs/query-and-ledger.md](docs/query-and-ledger.md) |
| Phased plan and sign-off gates | [docs/plan.md](docs/plan.md) |
| Linear issues to create (copy-paste) | [docs/linear-issues.md](docs/linear-issues.md) |
| What you personally test | [docs/testing-and-signoff.md](docs/testing-and-signoff.md) |
| Rules for Devin (and any agent) | [AGENTS.md](AGENTS.md) |
| Product + AI layers | [docs/product.md](docs/product.md) |
| Cloud architecture | [docs/architecture.md](docs/architecture.md) |
| Data model | [docs/data-model.md](docs/data-model.md) |

## Non-negotiables

1. The AI **proposes**. It does not silently decide cost, billing cadence, or renewal dates.
2. A subscription with only a provider name is valid. Incomplete stubs are first-class.
3. Lifecycle is an **event log** (charges, price changes, cancels). The list you see is a projection.
4. Every query is scoped to the signed-in `user_id`.
5. **Ledger read/query ships before capture AI.** You cannot sign off on recording if you cannot see or search what was recorded.

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
| `CAPTURE_STORAGE_BUCKET` | Private R2 or S3 bucket that holds uploaded screenshots |
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
| `GET /api/subscriptions` | `q`, `status` (comma list), `renewingWithinDays`, `sort` (`provider` \| `nextRenewal` \| `monthlyEquivalent` \| `updatedAt`), `order`, `limit` (max 100), `cursor` |
| `GET /api/subscriptions/summary` | Counts, monthly equivalent total, next upcoming renewal |
| `GET /api/subscriptions/:id` | Full projection with amendments, events, and charges; 404 for another user's row |
| `POST /api/chat` | `{ "message": "..." }` → the stored capture id, pending `create` proposals, one follow-up question at most, and the extractor used |
| `POST /api/captures/images` | `{ "fileName", "mediaType", "byteSize" }` → the capture id and a signed upload of one image to one server-chosen key |
| `POST /api/captures/images/:id/read` | Reads the uploaded image → `reading`, `read` with pending proposals, or `failed` with why |

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

## Screenshot capture

`Add screenshot` in `/chat` sends the file straight to private storage on a URL
this server signed for one key and one content type, then asks the server to
read it. The chat shows `Reading…` until the reading finishes and answers with
the same proposal cards a message would; the ledger still only changes when a
proposal is accepted.

The image is never public. Nothing the browser receives can read a stored
object: reads happen server-side and the bytes go to Claude inline. Uploads are
refused unless they are PNG, JPEG, or WebP under 5 MB.

With the `CAPTURE_STORAGE_*` variables set, files live in the private bucket.
Without them, development and test runs keep files in the git-ignored
`.captures` directory outside `public/` and a preview or production server
returns `503 storage_unavailable` rather than storing a receipt somewhere less
private.

```bash
# Ask for an upload, PUT the file to the signed URL, then read it.
curl -s --cookie "$SESSION_COOKIE" -H 'Content-Type: application/json' \
  -d '{"fileName":"receipt.png","mediaType":"image/png","byteSize":24000}' \
  http://localhost:3000/api/captures/images
curl -s --cookie "$SESSION_COOKIE" -X PUT -H 'Content-Type: image/png' \
  --data-binary @receipt.png "http://localhost:3000$UPLOAD_PATH"
curl -s --cookie "$SESSION_COOKIE" -X POST \
  http://localhost:3000/api/captures/images/$CAPTURE_ID/read
```

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

The application shell and authentication begin at Linear issue **SUB-1**. The
remaining delivery sequence is in [docs/plan.md](docs/plan.md).
