# Ledger view and query

Signed-in list, search, filter, detail, and summary of **holdings**: what you hold, what it costs, when the next payment is due. The ledger is not a payment recorder. Capture writes the **same** tables this API reads, and nothing else writes them — there are no jobs. The UI is a projection, not a second source of truth.

Keep the **stored** `next_renewal` and its trust. List and detail must still return that recorded value. A past stored date is not a lifecycle change and not `lapsed`. **Do not replace the stored date with a projected future date.** The API also returns a separate `expectedNextRenewal` (inferred/expected) when the row qualifies.

The stored date only changes when the user acts: still-holding (rolls `next_renewal` forward by cadence, `inferred`), a manual/accepted date edit, or cancel. Overdue holdings that still need reconciliation, unfinished rows, and (after SUB-49) reminder notifications surface in **Inbox**, not as a ledger chip.

The nightly roll and the ledger's `needsAttention` chip are both gone. Inbox reads from `GET /api/inbox` — see below.

There is no payment table. Detail does not return `charges[]`.

## In scope

While signed in you can:

1. See all of **your** subscriptions in a table (not other users’).
2. Search by provider / plan text (`q`).
3. Filter by `status` (active, trial, paused, cancel_scheduled, cancelled, unknown). `lapsed` is not one of them: the API rejects it, no chip names it, and `0013_drop_lapsed` left no row with it.
4. Filter **renewing within N days**.
5. Sort by provider, next renewal, amount (monthly equivalent), updated time.
6. Open a detail page: current amount, cadence, next renewal (recorded, plus expected after SUB-48), status, field confirmation state, timeline.
7. See a summary: counts, a named paid-commitment monthly equivalent, next upcoming date.
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
| `coverage` | `confirmed` \| `unconfirmed` \| `omitted` \| `afterTrial` | Paid-commitment coverage buckets from the summary. Combine with `status` as needed. |
| `sort` | `provider` \| `nextRenewal` \| `monthlyEquivalent` \| `updatedAt` | Default `nextRenewal` (nulls last). Ties break on `id`, which is also what the cursor pages on |
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
      "trialEndsOn": { "value": null, "status": "empty", "confidence": null },
      "autoRenewal": { "value": "yes", "status": "confirmed", "confidence": "high" },
      "monthlyEquivalentMinor": 699,
      "updatedAt": "2026-08-27T18:00:00.000Z"
    }
  ],
  "nextCursor": null
}
```

Money is integer **minor units** (pence). Never floats.

`monthlyEquivalentMinor`: yearly ÷ 12 (integer division, document remainder); support `weekly | monthly | yearly` only. Yearly monthly-equivalent = `round(amount/12)` for display only; do not persist that as the amount.

### Recorded vs expected next renewal

On `main`, list and detail keep `nextRenewal` as the stored column and add a sibling when the row qualifies. Do not overwrite `nextRenewal.value` with the projection.

```json
"nextRenewal": { "value": "2026-01-31", "status": "confirmed", "confidence": "high" },
"expectedNextRenewal": { "value": "2026-04-30", "status": "inferred", "basis": "expected" }
```

`expectedNextRenewal` is present only when all of these hold: `status` is `active`, auto-renewal is confirmed `yes`, cadence is confirmed, recorded `nextRenewal` is confirmed. Otherwise omit it (or return a non-dated missing/conflict explanation — do not invent a date).

Worked example. Recorded date 2026-01-31, monthly, confirmed auto-renewal yes, today 2026-04-10:

| Occurrence | Date |
|---|---|
| Anchor (stored) | 2026-01-31 |
| +1 month | 2026-02-28 |
| +2 months | 2026-03-31 |
| +3 months (expected next) | 2026-04-30 |

Not 2026-02-28 then 2026-03-28. Compute each occurrence as `shiftCalendarMonths(anchor, n)` / `addDays(anchor, 7n)`, never by feeding the previous result into `advanceByCadence`. `rollNextRenewal` stays for user-asked still-holding only.

Sort, filter (`renewingWithinDays`), and summary's next-upcoming use the **same** resolver as list, detail, Inbox, and reminder previews: recorded date for the recorded field; expected date for “when is this due next” once a row qualifies. Reads write no subscription, amendment, or event rows.

`trial`, `paused`, `cancelled`, and `cancel_scheduled` do not receive an unlimited active schedule. A trial uses trial end as the expected payment-start boundary while status remains trial; it is not a monthly renewal to suppress. Auto-renewal `no`/`unknown` keeps a passed recorded date as reconciliation work.

### `GET /api/subscriptions/:id`

Full projection plus:

- `accountHint`
- `startedOn`
- `notes`
- `reminderPreferences` (`renewal` and `trialEnd`: `state` unset/off/enabled, lead, suggestion, date preview)
- `amendments[]`
- `events[]`

`trialEndsOn` and `autoRenewal` are on both list and detail. Amount, currency, and cadence on a `trial` row are the paid plan after trial and are labelled that way in the UI. There is no separate trial-price field. Capture proposes these facts and reminder preferences as pending cards until accept ([SUB-45](https://linear.app/lets-play-match/issue/SUB-45/capture-the-new-facts-and-preferences-through-proposals)). Reminder preferences are detail-only. An absent preference row is unset, not off. Cadence edits do not overwrite a stored reminder choice.

404 if wrong user or missing.

### `GET /api/subscriptions/summary`

```json
{
  "activeCount": 12,
  "trialCount": 3,
  "monthlyEquivalentMinor": 21607,
  "currency": "GBP",
  "label": "Recorded GBP paid-commitment monthly equivalent",
  "coverage": {
    "confirmed": { "count": 10, "monthlyEquivalentMinor": 15608 },
    "unconfirmed": { "count": 1, "monthlyEquivalentMinor": 5999, "items": [{ "subscriptionId": "uuid", "provider": "Adobe" }] },
    "omitted": {
      "missingPriceOrCadence": { "count": 1, "items": [{ "subscriptionId": "uuid", "provider": "The Economist" }] },
      "excludedCurrency": { "count": 1, "items": [{ "subscriptionId": "uuid", "provider": "The Washington Post", "currency": "USD" }] }
    },
    "afterTrial": {
      "monthlyEquivalentMinor": 2399,
      "stated": { "count": 2, "items": [{ "subscriptionId": "uuid", "provider": "Canva", "monthlyEquivalentMinor": 1000 }] },
      "unknownPrice": { "count": 1, "items": [{ "subscriptionId": "uuid", "provider": "Notion" }] }
    }
  },
  "nextRenewal": { "subscriptionId": "uuid", "provider": "Netflix", "on": "2026-09-11", "basis": "recorded" }
}
```

The number is a **recorded GBP paid-commitment monthly equivalent**. It is not actual payments and not a complete budget. [SUB-46](https://linear.app/lets-play-match/issue/SUB-46/explain-spend-coverage-and-separate-trials-from-paid-commitments)

- The current paid total is `active` and `cancel_scheduled` GBP rows that have both amount and cadence. Per-row monthly equivalents are summed after the existing rounding.
- Confirmed coverage needs confirmed amount **and** confirmed cadence on a settled holding (not `unknown`, not conflicted amount/cadence). Unconfirmed calculable rows are listed separately and still contribute to the paid total.
- Missing-price/cadence rows and non-GBP rows are omissions, not zero. No FX conversion.
- `trial` rows are excluded from the current paid total. Stated paid-plan prices appear as after trial. A missing paid-plan price stays unknown; do not store or display a confirmed £0 because the trial is free.
- Next-upcoming uses the shared schedule resolver (SUB-48).
- Next-upcoming picks one row, so ties are broken on **`id` ascending** — the same second sort key the list uses. Two holdings due the same day would otherwise make the answer arbitrary and let it change between reloads. With the tiebreaker, `nextRenewal` is exactly the first row of `GET /api/subscriptions?sort=nextRenewal&order=asc` once that list is narrowed to what the summary considers: not `cancelled`, and not already past. [SUB-53](https://linear.app/lets-play-match/issue/SUB-53/summary-next-renewal-is-nondeterministic-when-two-holdings-share-a)
- `GET /api/subscriptions?coverage=` lists the same buckets so the user can open omitted and uncertain rows. `/ledger?all=true&coverage=` is the matching UI.

There is no attention count here. Rows that need work are counted nowhere and listed in Inbox, which is the only place that asks the question.

### `POST /api/subscriptions`, `PATCH /api/subscriptions/:id`

Manual add and edit, no AI in the path. A provider name is enough to create a
row; money and dates are optional. Missing trial end, unknown auto-renewal, and
unset reminders also must not block saving. A reminder-only `PATCH` is valid.
Reminder preferences are independent of auto-renewal: weekly/monthly renewal
suggests off, yearly one calendar month, trial three days — suggestions are not
written until the user chooses. Cadence changes never overwrite a stored choice. What the user **intends to change**
lands **confirmed** — it is their own answer. A notes-only `PATCH` sends only notes; unchanged inferred/proposed amount,
cadence, and date keep their values and trust. Reopening and saving the form
must not blanket-confirm fields. An explicit confirm action can confirm an
unchanged value. An actual price change on a paid holding is a terms-change with user-specified
effective timing (`termsChange.effectiveFrom`), not an in-place overwrite of the
open amendment. A correction of the same fields updates the open amendment and
does not write a `terms_changed` event. Amount, cadence, and plan on a `trial`
row are the paid plan after trial, not currently in-force terms: entering or
changing them is an ordinary write and must not require correction versus terms
change. Manual `cancelled` / `cancel_scheduled`
and reactivation reuse `lib/proposals/lifecycle.ts` and `reactivate.ts`. `PATCH`
404s on another user's row.

### `GET /api/proposals`

`state` (comma list of `pending`, `accepted`, `rejected`, `superseded`; pending
by default) and `limit`. Returns the proposal projection the Inbox cards render.
A payload that no longer validates is reported as such rather than hidden, so a
row can never quietly disappear from the queue.

### `POST /api/proposals/:id/accept`, `/reject`

Accept applies the payload and settles the proposal in **one transaction**;
`{ "confirm": … }` in the body confirms the money, dates, trial end, or
auto-renewal it quotes, and without it those fields stay `proposed`. Accepting a
reminder preference is the consent that writes it. Reject records the decision
and leaves the ledger alone. `404` for another user's proposal, `409` for one
that is not pending.

Accepting an ending also supersedes any *other* pending proposal that would end
the same row, since that one is now moot.

## UI spec (`/ledger`)

The ledger is inventory: what you hold, what it costs, when it's next due. There
is no "Needs attention" chip here — overdue rows and unfinished rows are
Inbox's job, not the ledger's. A link that still carries `needsAttention=true`
falls back to the ledger's own default, and the API ignores the parameter.

- Header: “Subscriptions” + summary stats (count, named paid-commitment monthly equivalent, next renewal) and a coverage panel (confirmed vs unconfirmed, after trial, omissions with links)
- Search input (debounced)
- Status filter chips (All / Holding / Cancelled). Default is **Holding** (`active`, `trial`, `paused`, `cancel_scheduled`). Empty URL = holding. All uses `all=true`. Cancelled uses `status=cancelled`. `status=active` means the holding set.
- Coverage filter from the summary (`?coverage=confirmed|unconfirmed|omitted|afterTrial`) so omitted and uncertain rows can be listed
- Sort key and direction controls covering all four sort keys
- `Load more` when the ledger has more rows than the page size, following `nextCursor`
- Filters, sort and page size live in the query string (`?q=&all=&status=&coverage=&sort=&order=&limit=`) so a view survives a refresh
- Table columns: Provider, Plan, Status, Amount, Cadence, Next renewal, Field trust (short: confirmed vs inferred). Trial rows show trial end under status and label amount “after trial”. Known auto-renewal is a note under cadence.
- Click row → `/ledger/[id]`
- An overdue row's **stored** `next_renewal` is not styled differently from any other holding row on the ledger. After SUB-48 it may also show a labelled expected date; the stored date stays visible. Reconciliation still belongs in Inbox.

Detail page:

- Current terms block, including trial end and auto-renewal with trust
- Amount and cadence on a trial are labelled after trial
- Reminders block: renewal and trial-end independently, with unset/off/enabled, a date preview, and copy that Inbox is the delivery location
- Each money/date field shows **value + status** (`confirmed` / `inferred` / `proposed` / `empty` / `deferred` / `conflicted`)
- Timeline: lifecycle and terms events only (no charge lines)
- Amendments list
- Edit on `/ledger/[id]/edit`

## Catch-up is Inbox, not a greeting

There is no chat-open still-holding greeting. Overdue holdings surface as a
section in Inbox (below), where the user acts on them whenever they choose, not
as a question chat forces on the next message. The only still-holding-shaped
conversation left is **one follow-up per capture turn**, attached to the
composer and about *that* turn's rows — never a standing catch-up over the
whole ledger.

A bare "yes" in chat is not how a date gets rolled. Inbox is the only place
`next_renewal` moves without the user typing a date.

## Inbox (`/inbox`)

Inbox is the workbench: capture plus everything still open. On `main` there are
four sections, each empty when there's nothing in it:

1. **Pending proposals** — accept or reject, unchanged from today.
2. **Overdue** — holdings that still need reconciliation after a relevant date
   has passed. A confirmed auto-renewing **active** holding does **not** enter
   Overdue merely because the stored date has passed. Auto-renewal `no`/`unknown`,
   a passed trial end, paused/cancel-scheduled cases that still need a decision,
   and confirmed auto-renewal with unusable schedule inputs still do.
   Two actions per overdue row: **still have it** (rolls stored `next_renewal`
   forward by cadence, `inferred`, never `confirmed`) or **cancelled** (see
   cancel date review below).
3. **Unfinished** — `unknown` status, `conflicted` fields, and
   deferred-and-due rows (a deferred field whose `deferred_until` has arrived).
4. **Reminders** — preference-driven notifications with no dismiss, visible
   from reminder date through due date. There is no Renewing soon glance.

Sections 2–4 come from `GET /api/inbox` (below). A row can be in more than one
section when more than one thing is true of it — overdue *and* conflicted, say.
It is listed in both rather than hidden from one, because hiding it is how a
work list loses work. A reminder that has expired must not hide remaining
reconciliation work on the same holding.

There used to be a `reminders` table backing a different version of this:
persisted, dismissable `upcoming_renewal` and `deferred_terms` rows written by
a nightly scan. It is gone — see [data-model.md](data-model.md). Stage-one
Reminders are also a projection, from preferences + the shared schedule
resolver, not a revival of that table.

### Reminder notifications (SUB-47, SUB-49)

Calendar-day convention: compare UTC `YYYY-MM-DD` dates from
`now.toISOString().slice(0, 10)` (existing `today()` / `calendarToday()`).
Inclusive window: `reminderDate <= today <= dueDate`. The occurrence is gone
when `today > dueDate`.

Worked example. Renewal due 2026-10-15, lead = 1 calendar month:

| Today | Card |
|---|---|
| 2026-09-14 | absent |
| 2026-09-15 | visible |
| 2026-10-15 | visible |
| 2026-10-16 | absent |

Month-end clamping: due 2026-03-31 minus one calendar month → 2026-02-28;
due 2028-03-31 minus one month → 2028-02-29. Store lead value + unit, not 30
days. Trial reminders expire after trial end (the stage-one payment-start
boundary). Unknown targets generate no dated card.

Each result identifies the subscription, target (`renewal` | `trial_end`), due
occurrence, reminder-start date, and date trust/basis. Stable occurrence key:
subscription + target + due date. Repeated loads produce one card per
occurrence. A later auto-renewal occurrence can generate its own card only
inside its own window.

No dismiss, clear, snooze, or mark-read-to-remove control or endpoint.
Reopening Inbox does not clear a card. Preference/date edits recompute
eligibility. Expiry writes no subscription, preference, amendment, or event
row. Refresh Inbox on relevant edits, focus, and calendar-day changes so an
open page reflects expiry without a job.

A notification built from an expected date retains that date's inferred basis.

### `GET /api/inbox`

No parameters. Returns the ledger sections. `overdue` and `unfinished` use
the same list-item projection `GET /api/subscriptions` returns. `reminders`
are occurrence cards (subscription list item plus target, due date,
reminder-start date, and basis), ordered soonest due date first.

```json
{
  "overdue": [],
  "unfinished": [],
  "reminders": []
}
```

`renewingSoon` is gone. `reminders` are occurrence cards with target, due date,
reminder-start date, and basis. Do not return both.

| Section | Rows |
|---|---|
| `overdue` | Holding (`active` \| `trial` \| `paused` \| `cancel_scheduled`) with a stored `next_renewal` before today, minus confirmed auto-renewing `active` rows that have a usable expected schedule; plus passed trial ends that still need an outcome |
| `unfinished` | Status `unknown`, **or** amount/cadence/renewal `conflicted`, **or** a deferred term whose `deferred_until` has arrived |
| `reminders` | Enabled preferences whose `reminderDate <= today <= dueDate` |

Read-only: the route writes nothing, so opening Inbox cannot change a stored
date or expire a notification by storing acknowledgement. Missing terms alone
are not `unfinished` — an incomplete row is allowed to stay incomplete. Another
user's notifications are never returned.

### `POST /api/inbox/overdue/:id/still-holding`

The user says they still hold an overdue row. Rolls the stored past
`next_renewal` forward by cadence until it is today or later and marks it
`inferred` — never `confirmed`, because they said they hold the subscription,
not that they checked the date. Amount, cadence and status are untouched, so
the row stays holding and simply leaves Overdue.

`409 not_overdue` when the row is not a holding row with a passed date (so a
second click cannot roll it twice), `409 no_cadence` when there is no cadence
to roll by, `404` for another user's row or an id that does not exist.

### `POST /api/inbox/overdue/:id/cancel`

The user says an overdue row stopped. Ends it through the same lifecycle write
an accepted `cancelled` proposal uses — status `cancelled` and `confirmed`,
`ends_on` set, `next_renewal` cleared, the open amendment closed, a `cancelled`
event logged — so there is exactly one way a subscription ends.

The body must **review the actual stated end date**. `{ "endsOn": "2026-08-12" }`
sets that date. A stored due date of 1 June does not establish that a subscription
cancelled in August ended on 1 June. `{ "unknownTiming": true, "notes": "…" }`
leaves the row unresolved and may store a note — it does not invent a date.
`409 needs_end_date` when neither an end date nor unknown timing is given.
Same refusals as above when the row is not overdue.

## Seed data (development)

At least **10** subscriptions for one demo user, mixed:

- 6 active with confirmed amounts
- 1 inferred amount (so trust markers are visible)
- 1 trial
- 1 cancel_scheduled with `nextRenewal` / `ends_on`
- 1 cancelled (historical; still listed when filter = all)
- 1 unfinished (missing amount or conflicted) — an Inbox row, not a ledger chip
- 1 overdue holding (stored `next_renewal` in the past)
- 1 **yearly** inside 30 days and 1 **weekly** inside 7, so the renewing-soon
  windows can be seen working *and* seen excluding weekly

Stage-one seeds (SUB-44 onward) also need: a free trial with trial end and a
stated paid-plan price, a trial with unknown paid terms, confirmed
auto-renewal yes/no/unknown, and reminder preferences unset vs off vs enabled.
Do not infer auto-renewal from cadence in seed data.
SUB-46 also seeds an active holding with a missing price, a non-GBP holding,
and keeps Adobe inferred so confirmed vs unconfirmed vs omitted vs after-trial
are visible on `/ledger`.

Providers should look real (Netflix, Spotify, iCloud, Claude Pro, Cursor, Adobe, Notion, GitHub, 1Password, The Athletic, Headspace, Disney+, The Guardian, Oddbox, Canva, Calm, The Economist, The Washington Post).
