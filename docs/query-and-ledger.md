# Ledger view and query (Phase 1 — required before capture)

Yes. A **basic view and query** path is mandatory before chat, OCR, or lifecycle AI.

Recording without a readable inventory cannot be tested or signed off. Capture work would have no place to verify duplicates, stubs, or spend. Devin would also have no UI to demo besides JSON.

Phase 1 is therefore a **read model**: seed data in, list/detail/search out. Manual create (SUB-7) comes next so you can add rows without waiting on the LLM. Chat writes into the **same** tables this query API already reads.

## What “basic” means (in scope)

You can, while signed in:

1. See all of **your** subscriptions in a table (not other users’).
2. Search by provider / plan text (`q`).
3. Filter by `status` (active, trial, paused, cancel_scheduled, cancelled, lapsed, unknown).
4. Filter **renewing within N days**.
5. Sort by provider, next renewal, amount (monthly equivalent), updated time.
6. Open a detail page: current amount, cadence, next renewal, status, field confirmation state, empty timeline.
7. See a summary: active count, monthly equivalent total, next upcoming renewal.
8. Hit the same capabilities via HTTP JSON (so later chat and tests share one backend).

Empty states: seeded demo data in development; production shows an empty ledger with a short message, not an error.

## What is not in Phase 1

- Chat, screenshots, voice
- AI proposals
- Editing (except what SUB-7 adds later)
- Charge/amendment history UI beyond a placeholder “no events yet” on detail
- Saved views, CSV export, sharing links

## HTTP API

All routes require a session. All results are `WHERE user_id = :session`.

### `GET /api/subscriptions`

Query params:

| Param | Type | Notes |
|---|---|---|
| `q` | string | Case-insensitive match on provider name, plan, account hint |
| `status` | enum or comma list | Default: omit = all |
| `renewingWithinDays` | int | `next_renewal` between now and now+N, exclusive of cancelled with no renewal |
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
      "updatedAt": "2026-08-27T18:00:00.000Z"
    }
  ],
  "nextCursor": null
}
```

Money is integer **minor units** (pence). Never floats.

`monthlyEquivalentMinor`: yearly ÷ 12 (integer division, document remainder); weekly × 13/3 is not needed in v1 — support `weekly | monthly | yearly` only. Yearly monthly-equivalent = `round(amount/12)` for display only; do not persist that as the amount.

### `GET /api/subscriptions/:id`

Full projection plus:

- `accountHint`
- `startedOn`
- `notes`
- `amendments[]` (may be a single open amendment in Phase 1)
- `events[]` (may be empty)
- `charges[]` (may be empty)

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

`needsAttentionCount`: status in `unknown | lapsed` **or** any of amount/cadence/nextRenewal is `conflicted` **or** deferred and due. Phase 1 seed should include at least one such row so you can see the number move.

## UI spec (`/ledger`)

- Header: “Subscriptions” + summary stats (count, monthly equivalent, next renewal)
- Search input (debounced)
- Status filter chips (All / Active / Cancelled / Needs attention)
- Table columns: Provider, Plan, Status, Amount, Cadence, Next renewal, Field trust (short: confirmed vs inferred)
- Click row → `/ledger/[id]`
- Needs-attention rows visually distinct (table row tone / label), not a second product

Detail page:

- Current terms block
- Each money/date field shows **value + status** (`confirmed` / `inferred` / `proposed` / `empty` / `deferred` / `conflicted`)
- Timeline section: list events or “No activity yet”
- No edit buttons until SUB-7

## Seed data (development)

At least **10** subscriptions for one demo user, GBP, mixed:

- 6 active with confirmed amounts
- 1 inferred amount (so trust markers are visible)
- 1 trial
- 1 cancel_scheduled with `nextRenewal` / `ends_on`
- 1 cancelled (historical; still listed when filter = all)
- 1 needs attention (missing amount or conflicted)

Providers should look real (Netflix, Spotify, iCloud, Claude Pro, Cursor, Adobe, Notion, GitHub, 1Password, The Athletic) so exploratory testing feels like your inventory.

## Sign-off meaning

Phase 1 is signed off when you can use `/ledger` on a preview deploy, search “net”, filter Active, open Netflix, and the JSON API returns the same numbers as the UI. No AI involved.
