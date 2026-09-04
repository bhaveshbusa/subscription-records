# Ledger view and query

Signed-in list, search, filter, detail, and summary of **holdings**: what you hold, what it costs, when the next payment is due. The ledger is not a payment recorder. Chat and jobs write the **same** tables this API reads. The UI is a projection, not a second source of truth.

A `next_renewal` that has passed is a **stale schedule**, not a lifecycle change. Do not treat it as `lapsed`. Later issues roll that date and flag needs-attention.

Detail still returns `charges[]` because the table has not been dropped. Capture does not write charges; [SUB-25](https://linear.app/lets-play-match/issue/SUB-25/ledger-surfaces-and-catch-up) changes what the surfaces show.

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
| `status` | enum or comma list | Default: omit = all |
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
- `charges[]`

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

`needsAttentionCount`: status in `unknown | lapsed` **or** any of amount/cadence/nextRenewal is `conflicted` **or** deferred and due. Seed data includes at least one such row.

## UI spec (`/ledger`)

- Header: “Subscriptions” + summary stats (count, monthly equivalent, next renewal)
- Search input (debounced)
- Status filter chips (All / Active / Cancelled / Needs attention)
- Sort key and direction controls covering all four sort keys
- `Load more` when the ledger has more rows than the page size, following `nextCursor`
- Filters, sort and page size live in the query string (`?q=&status=&needsAttention=&sort=&order=&limit=`) so a view survives a refresh
- Table columns: Provider, Plan, Status, Amount, Cadence, Next renewal, Field trust (short: confirmed vs inferred)
- Click row → `/ledger/[id]`
- Needs-attention rows visually distinct (table row tone / label), not a second product

Detail page:

- Current terms block
- Each money/date field shows **value + status** (`confirmed` / `inferred` / `proposed` / `empty` / `deferred` / `conflicted`)
- Timeline: events, charges, amendments
- Edit on `/ledger/[id]/edit`

## Seed data (development)

At least **10** subscriptions for one demo user, GBP, mixed:

- 6 active with confirmed amounts
- 1 inferred amount (so trust markers are visible)
- 1 trial
- 1 cancel_scheduled with `nextRenewal` / `ends_on`
- 1 cancelled (historical; still listed when filter = all)
- 1 needs attention (missing amount or conflicted)

Providers should look real (Netflix, Spotify, iCloud, Claude Pro, Cursor, Adobe, Notion, GitHub, 1Password, The Athletic).
