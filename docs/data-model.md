# Data model

Postgres. All tables include `id` (uuid), `user_id`, `created_at`, `updated_at` unless noted.

Field-level trust is stored on the subscription projection (and copied onto list API). Historical truth lives in `amendments`, `charges`, and `events`.

## Enums

```text
subscription_status: unknown | trial | active | paused | cancel_scheduled | cancelled | lapsed
field_status: empty | proposed | inferred | confirmed | deferred | conflicted
cadence: weekly | monthly | yearly
confidence: low | medium | high
event_type: started | converted_to_paid | charged | terms_changed | paused | resumed
            | cancel_scheduled | cancelled | refunded | payment_failed | lapsed | reactivated
proposal_kind: create | update | charged | terms_changed | cancel_scheduled | cancelled
               | reactivated | lapsed
proposal_state: pending | accepted | rejected | superseded
```

## `users`

Auth.js adapter tables as required, plus `users.id` used as `user_id`.

## `subscriptions` (projection)

Current identity and current terms. Incomplete allowed (nullable money/dates).

| Column | Notes |
|---|---|
| `provider_canonical` | Normalized name, e.g. `netflix` |
| `provider_display` | `Netflix` |
| `plan` | nullable |
| `account_hint` | nullable |
| `status` | enum |
| `amount_minor` | nullable integer |
| `currency` | `GBP` default |
| `cadence` | nullable |
| `next_renewal` | date, nullable |
| `started_on` | date, nullable |
| `ends_on` | date, nullable (cancel at period end) |
| `notes` | text, nullable |
| `provider_field_status` / `amount_field_status` / `cadence_field_status` / `renewal_field_status` / `status_field_status` | `field_status` |
| `amount_confidence` etc. | `confidence`, nullable |
| `deferred_until` | timestamptz, nullable |

Do not store monthly-equivalent; compute in the API.

## `amendments`

Versioned terms. Phase 1 may insert one open amendment per seed subscription (`effective_to` null).

| Column | Notes |
|---|---|
| `subscription_id` | fk |
| `effective_from` | date |
| `effective_to` | date, nullable |
| `amount_minor` | nullable |
| `currency` | |
| `cadence` | nullable |
| `plan` | nullable |

## `charges`

Continuity. Empty in Phase 1 seed except optional 1–2 examples.

| Column | Notes |
|---|---|
| `subscription_id` | |
| `paid_on` | date |
| `amount_minor` | |
| `currency` | |
| `covers_from` / `covers_to` | nullable |
| `capture_id` | nullable fk, later |
| `idempotency_key` | unique per user |

## `events`

Lifecycle log. Seed at least `started` per subscription.

| Column | Notes |
|---|---|
| `subscription_id` | |
| `type` | `event_type` |
| `at` | timestamptz |
| `confirmed` | boolean |
| `rationale` | text, nullable |
| `payload` | jsonb, nullable |
| `capture_id` | nullable |

## `proposals`

Suggested data waiting for a human decision. Nothing here is in the ledger until it is accepted.

| Column | Notes |
|---|---|
| `subscription_id` | nullable; set on `create` when the proposal is accepted |
| `kind` | `proposal_kind` |
| `state` | `proposal_state`, default `pending` |
| `payload` | jsonb; per-field `{ value, status, confidence }` for money and dates |
| `rationale` | text, nullable |
| `confidence` | nullable |
| `capture_id` | nullable |
| `decided_at` | timestamptz, nullable |

Accepting applies the payload and settles the proposal in one transaction. Money and date fields keep the payload’s `proposed` / `inferred` status, and a payload that disagrees with a `confirmed` field leaves the stored value alone and marks the field `conflicted`.

## `reminders`

Notes in the inbox about a day that has arrived or is close. A reminder is not a proposal: it carries no payload, there is nothing to accept, and it never changes a subscription.

| Column | Notes |
|---|---|
| `subscription_id` | the row the reminder is about; cascades |
| `kind` | `reminder_kind`: `deferred_terms`, `upcoming_renewal` |
| `state` | `reminder_state`, default `pending` |
| `due_on` | date the reminder is about: the day a deferral came due, or the renewal date |
| `body` | the nudge in the words the inbox shows, including how far the date is trusted |
| `dismissed_at` | timestamptz, nullable |

Unique on `(subscription_id, kind, due_on)`, so the nightly scan raises the same nudge once, dismissed or not.

## `captures` / `observations` / `chat_*`

Create tables in the epic that first needs them (not in SUB-2 if it bloats the first migration — prefer SUB-2 to create **ledger tables only**, and a later migration for captures). SUB-2 should create: `subscriptions`, `amendments`, `charges`, `events`.

## Authority

| Field | AI/system may auto-set to `confirmed`? |
|---|---|
| Provider, plan, category-like hints | Yes, if high confidence and no collision |
| Amount, cadence, next_renewal | **No** |
| Cancel / merge / reactivate vs new | **No** (proposal only) |
| `charges.paid_on` from a clear receipt match | Allowed as operational fact; still does not confirm a new amount |

## Invariants

- One open amendment (`effective_to` is null) per subscription
- Cancelled subscriptions keep their row
- List queries never return another user’s rows
