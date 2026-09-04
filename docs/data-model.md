# Data model

Postgres. All tables include `id` (uuid), `user_id`, `created_at`, `updated_at` unless noted.

The ledger is holdings + cost + next due, not a payment history. Field-level trust is stored on the subscription projection (and copied onto list API). Historical truth lives in `amendments` and `events`. The `charges` table stays in the schema; capture must not write it. Do not drop the table here.

## Enums

These lists match the schema today, including `charged`. Capture must not write `charges` or raise `charged` proposals. Do not drop the table or enum values here.

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
capture_kind: text | image | pdf | audio
capture_run_state: awaiting_upload | reading | read | failed
question_reason: amount | cadence | renewal | duplicate | cancel_timing | account_identity
question_state: asked | answered | deferred
reminder_kind: deferred_terms | upcoming_renewal
reminder_state: pending | dismissed
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

Versioned terms. Seed data inserts one open amendment per subscription (`effective_to` null).

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

Still in the schema. Seed includes a small number of example charges. Do not drop this table in this epic.

**Intended:** a receipt or “I paid” updates holding, cost, and next due. Capture must not write `charges`. Historical seed rows may remain until SUB-25.

| Column | Notes |
|---|---|
| `subscription_id` | |
| `paid_on` | date |
| `amount_minor` | |
| `currency` | |
| `covers_from` / `covers_to` | nullable |
| `capture_id` | nullable fk to `captures` |
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

## `captures`

Immutable inputs. Text keeps the message in `content`. Files keep bytes in the private bucket (`storage_key`); the browser never gets a read URL.

| Column | Notes |
|---|---|
| `kind` | `text` \| `image` \| `pdf` \| `audio` |
| `source` | e.g. `chat` |
| `content` | message body; null for files |
| `storage_key` / `media_type` / `byte_size` / `file_name` | file captures |

## `capture_runs`

One read attempt per file capture (`awaiting_upload` → `reading` → `read` \| `failed`). A retry resumes this row rather than paying twice.

## `capture_questions`

What chat already asked, so “later” is not re-asked. Unique per user + provider + reason.

## Authority

| Field | AI/system may auto-set to `confirmed`? |
|---|---|
| Provider, plan, category-like hints | Yes, if high confidence and no collision |
| Amount, cadence, next_renewal | **No** |
| Cancel / merge / reactivate vs new | **No** (proposal only) |
| Receipt / “I paid” | Updates holding, cost, and next due as `proposed` or `inferred`. Does not confirm amount. Does not write a payment |

## Invariants

- One open amendment (`effective_to` is null) per subscription
- Cancelled subscriptions keep their row
- List queries never return another user’s rows
- Do not infer `cancelled` or `lapsed` from silence or a passed `next_renewal` (that date is a stale schedule, not a lifecycle change; roll it by cadence as `inferred`)
- `lapsed` is only when the user says it expired / the card failed / it was not renewed
- A user-stated past date is the event date; do not snap cancel to today
