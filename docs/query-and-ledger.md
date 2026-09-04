# Ledger view and query

Signed-in list, search, filter, detail, and summary of **holdings**: what you hold, what it costs, when the next payment is due. The ledger is not a payment recorder. Chat and jobs write the **same** tables this API reads. The UI is a projection, not a second source of truth.

A `next_renewal` that has passed is a **stale schedule**, not a lifecycle change. Do not treat it as `lapsed`. List and detail **roll** that date forward by cadence and show it as `inferred`. The nightly / inbox scan **persists** the rolled date. `needsAttention` includes a holding row whose **stored** `next_renewal` is still in the past (stale-before-roll).

There is no payment table. Detail does not return `charges[]`.

## In scope

While signed in you can:

1. See all of **your** subscriptions in a table (not other users’).
2. Search by provider / plan text (`q`).
3. Filter by `status` (active, trial, paused, cancel_scheduled, cancelled, lapsed, unknown).
4. Filter **renewing within N days**.
5. Sort by provider, next renewal, amount (monthly equivalent), updated time.
6. Open a detail page: current amount, cadence, next renewal, status, field confirmation state, timeline.
7. See a summary: active count, monthly equivalent total, next upcoming renewal.
8. Hit the same capabilities via HTTP JSON.

Empty states: seeded demo data in development and Preview; production shows an empty ledger with a short message, not an error.

Manual create/edit is `/ledger/new` and `/ledger/[id]/edit`. Incomplete stubs are valid.

## Out of scope (not in this product yet)

Saved views, CSV export, sharing links, bank sync, Gmail ingest.

## HTTP API

All routes require a session. All results are `WHERE user_id = :session`.

### `GET /api/subscriptions`

Query params:

| Param | Type | Notes |
|---|---|---|
| `q` | string | Case-insensitive match on provider name, plan, account hint |
| `status` | enum or comma list | Omit = all rows (including cancelled). The `/ledger` UI defaults to holding statuses; it does not change this API default. |
| `renewingWithinDays` | int | `next_renewal` between now and now+N, exclusive of cancelled with no renewal |
| `needsAttention` | `true` \| `false` | Rows matching (or, when `false`, not matching) the `needsAttentionCount` definition below |
| `sort` | `provider` \| `nextRenewal` \| `monthlyEquivalent` \| `updatedAt` | Default `nextRenewal` (nulls last) |
| `order` | `asc` \| `desc` | Default `asc` |
| `limit` | int | Default 50, max 100 |
| `cursor` | string | Opaque pagination |

Response:

```json
{
  "items": [
    {
      "id": "uuid",
      "provider": { "value": "Netflix", "status": "confirmed", "confidence": "high" },
      "plan": { "value": "Standard", "status": "proposed", "confidence": "medium" },
      "status": { "value": "active", "status": "confirmed", "confidence": "high" },
      "amount": { "value": { "minor": 699, "currency": "GBP" }, "status": "inferred", "confidence": "medium" },
      "cadence": { "value": "monthly", "status": "inferred", "confidence": "medium" },
      "nextRenewal": { "value": "2026-09-12", "status": "inferred", "confidence": "low" },
      "monthlyEquivalentMinor": 699,
      "needsAttention": false,
      "updatedAt": "2026-08-27T18:00:00.000Z"
    }
  ],
  "nextCursor": null
}
```

Each list item includes `needsAttention`, matching the summary definition.

Money is integer **minor units** (pence). Never floats.

`monthlyEquivalentMinor`: yearly ÷ 12 (integer division, document remainder); support `weekly | monthly | yearly` only. Yearly monthly-equivalent = `round(amount/12)` for display only; do not persist that as the amount.

### `GET /api/subscriptions/:id`

Full projection plus:

- `accountHint`
- `startedOn`
- `notes`
- `amendments[]`
- `events[]`

404 if wrong user or missing.

### `GET /api/subscriptions/summary`

```json
{
  "activeCount": 8,
  "trialCount": 1,
  "needsAttentionCount": 2,
  "monthlyEquivalentMinor": 5400,
  "currency": "GBP",
  "nextRenewal": { "subscriptionId": "uuid", "provider": "iCloud", "on": "2026-08-30" }
}
```

`needsAttentionCount`: status in `unknown | lapsed` **or** any of amount/cadence/nextRenewal is `conflicted` **or** deferred and due **or** a holding row (`active` | `trial` | `paused` | `cancel_scheduled`) whose stored `next_renewal` is in the past. Seed data includes Disney+ (unknown stub) and Headspace (stale schedule).

## UI spec (`/ledger`)

- Header: “Subscriptions” + summary stats (count, monthly equivalent, next renewal)
- Search input (debounced)
- Status filter chips (All / Holding / Cancelled / Needs attention). Default is **Holding** (`active`, `trial`, `paused`, `cancel_scheduled`). Empty URL = holding. All uses `all=true`. Cancelled uses `status=cancelled`. Legacy `status=active` is treated as holding.
- Sort key and direction controls covering all four sort keys
- `Load more` when the ledger has more rows than the page size, following `nextCursor`
- Filters, sort and page size live in the query string (`?q=&all=&status=&needsAttention=&sort=&order=&limit=`) so a view survives a refresh
- Table columns: Provider, Plan, Status, Amount, Cadence, Next renewal, Field trust (short: confirmed vs inferred)
- Click row → `/ledger/[id]`
- Needs-attention rows visually distinct (table row tone / label), not a second product. Headspace seed is a stale-schedule case.

Detail page:

- Current terms block
- Each money/date field shows **value + status** (`confirmed` / `inferred` / `proposed` / `empty` / `deferred` / `conflicted`)
- Timeline: lifecycle and terms events only (no charge lines)
- Amendments list
- Edit on `/ledger/[id]/edit`

## Catch-up (`/chat`)

When the user opens chat (or sends a message) and a holding row has a **stored** `next_renewal` in the past, ask **one** still-holding question naming those providers. Do not also ask amount or cadence on that turn. A cancellation or account-identity question on the current message still goes first.

Skip if that question was already asked, answered, or deferred — one catch-up per user, even if other rows later go stale. A bare yes or no answers it. “Yes” keeps the rows as current. “No” does not cancel anything; they can name which ones stopped on the next turn. A message that names a subscription is a capture, not a yes/no.

## Seed data (development)

At least **10** subscriptions for one demo user, GBP, mixed:

- 6 active with confirmed amounts
- 1 inferred amount (so trust markers are visible)
- 1 trial
- 1 cancel_scheduled with `nextRenewal` / `ends_on`
- 1 cancelled (historical; still listed when filter = all)
- 1 needs attention (missing amount or conflicted)

Providers should look real (Netflix, Spotify, iCloud, Claude Pro, Cursor, Adobe, Notion, GitHub, 1Password, The Athletic).
