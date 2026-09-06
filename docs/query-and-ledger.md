# Ledger view and query

Signed-in list, search, filter, detail, and summary of **holdings**: what you hold, what it costs, when the next payment is due. The ledger is not a payment recorder. Chat and jobs write the **same** tables this API reads. The UI is a projection, not a second source of truth.

A `next_renewal` that has passed is **overdue**, not a lifecycle change and not `lapsed` (there is no `lapsed` status). List and detail show the **stored** date as-is — no rolling forward, no substituting a future date. The stored date only changes when the user says they still hold the subscription (rolls `next_renewal` forward by cadence, `inferred`) or that it stopped (`cancelled`). Overdue holdings and other unfinished rows surface in **Inbox**, not as a ledger chip — see below.

**Code still has the nightly roll and a `needsAttention` chip on `/ledger`** (`lib/jobs/lapse-scan.ts`, the `needsAttention` API param, `subscriptions-table.tsx`). This document describes the intended end state; the child issue that removes the roll and the chip has not landed yet.

There is no payment table. Detail does not return `charges[]`.

## In scope

While signed in you can:

1. See all of **your** subscriptions in a table (not other users’).
2. Search by provider / plan text (`q`).
3. Filter by `status` (active, trial, paused, cancel_scheduled, cancelled, unknown). The schema still has a `lapsed` value (see [data-model.md](data-model.md)); nothing sets it anymore, and no filter chip names it.
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
| `needsAttention` | `true` \| `false` | Legacy filter, still live in code. Rows matching (or, when `false`, not matching) the `needsAttentionCount` definition below. The intended home for this is Inbox's overdue/unfinished sections, not a ledger filter — see below |
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

`needsAttentionCount` (legacy, still live in code): status `unknown` **or** any of amount/cadence/nextRenewal is `conflicted` **or** deferred and due **or** a holding row (`active` | `trial` | `paused` | `cancel_scheduled`) whose stored `next_renewal` is in the past (**overdue**). Seed data includes Disney+ (unknown stub) and Headspace (overdue). The intended product surface for these rows is Inbox's overdue and unfinished sections, not a ledger count — see below.

## UI spec (`/ledger`)

The ledger is inventory: what you hold, what it costs, when it's next due. There
is no "Needs attention" chip here — overdue rows and unfinished rows are
Inbox's job, not the ledger's. **Code still renders a Needs attention chip and
still accepts `needsAttention` in the URL**; the child issue that removes it
has not landed. This section describes the intended spec.

- Header: “Subscriptions” + summary stats (count, monthly equivalent, next renewal)
- Search input (debounced)
- Status filter chips (All / Holding / Cancelled). Default is **Holding** (`active`, `trial`, `paused`, `cancel_scheduled`). Empty URL = holding. All uses `all=true`. Cancelled uses `status=cancelled`. `status=active` means the holding set.
- Sort key and direction controls covering all four sort keys
- `Load more` when the ledger has more rows than the page size, following `nextCursor`
- Filters, sort and page size live in the query string (`?q=&all=&status=&sort=&order=&limit=`) so a view survives a refresh
- Table columns: Provider, Plan, Status, Amount, Cadence, Next renewal, Field trust (short: confirmed vs inferred)
- Click row → `/ledger/[id]`
- An overdue row (stored `next_renewal` in the past) is not styled differently from any other holding row on the ledger. It shows up as overdue in Inbox instead.

Detail page:

- Current terms block
- Each money/date field shows **value + status** (`confirmed` / `inferred` / `proposed` / `empty` / `deferred` / `conflicted`)
- Timeline: lifecycle and terms events only (no charge lines)
- Amendments list
- Edit on `/ledger/[id]/edit`

## Catch-up is Inbox, not a chat greeting

**Intended end state.** There is no chat-open still-holding greeting. Overdue
holdings surface as a section in Inbox (below), where the user acts on them
whenever they choose, not as a question chat forces on the next message. The
only still-holding-shaped conversation left is **one follow-up per capture
turn**, attached to the composer and about *that* turn's rows — never a
standing catch-up over the whole ledger.

**Code still has the old behavior**: opening or messaging `/chat` while a
holding row's stored `next_renewal` is in the past asks one still-holding
question naming those providers before anything else that turn
(`lib/capture/catch-up.ts`), skipped once asked, answered, or deferred. That
code path is removed by the issue that folds `/chat` into Inbox, not this one.

## Inbox (`/inbox`)

Inbox is the workbench: capture plus everything still open. Four sections,
each empty when there's nothing in it:

1. **Pending proposals** — accept or reject, unchanged from today.
2. **Overdue** — holding rows whose stored `next_renewal` is in the past. Two
   actions per row: **still have it** (rolls `next_renewal` forward by
   cadence, `inferred`, never `confirmed`) or **cancelled** (user says it
   stopped; a relative past date like "three months ago" is valid cancel
   timing).
3. **Unfinished** — `unknown` status, `conflicted` fields, and
   deferred-and-due rows (a deferred field whose `deferred_until` has arrived).
4. **Renewing soon** — a glance, not an action list (see windows below).

Renewing soon is a **projection over `subscriptions`**, not a stored table:
a holding row belongs in it when its (non-past) `next_renewal` falls within a
cadence-sized window —

| Cadence | Window |
|---|---|
| `yearly` | within 30 days |
| `monthly` | within 7 days |
| `weekly` | **excluded** — never appears in renewing soon |

A weekly row with a past `next_renewal` still appears in **Overdue**; it just
never appears in the renewing-soon glance.

**Code still has the `reminders` table** backing a different version of this
(persisted `upcoming_renewal` / `deferred_terms` rows, dismissable, written by
a nightly scan) — see [data-model.md](data-model.md). That table and the scan
that writes it are removed by a later child issue; this section describes the
projection that replaces them.

## Seed data (development)

At least **10** subscriptions for one demo user, GBP, mixed:

- 6 active with confirmed amounts
- 1 inferred amount (so trust markers are visible)
- 1 trial
- 1 cancel_scheduled with `nextRenewal` / `ends_on`
- 1 cancelled (historical; still listed when filter = all)
- 1 unfinished (missing amount or conflicted) — an Inbox row, not a ledger chip

Providers should look real (Netflix, Spotify, iCloud, Claude Pro, Cursor, Adobe, Notion, GitHub, 1Password, The Athletic).
