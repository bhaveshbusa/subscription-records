# Data model

Postgres. All tables include `id` (uuid), `user_id`, `created_at`, `updated_at` unless noted.

The ledger is holdings + cost + next due, not a payment history. Field-level trust is stored on the subscription projection (and copied onto list API). Historical truth lives in `amendments` and `events`. There is no `charges` table.

## Enums

These lists match the schema as it stands today. Capture must not write payments
or raise `charged` proposals. A `charged` proposal, if accepted, applies terms,
not a payment.

**There is no `lapsed` status, event, or proposal kind.** Expiry, a failed
card, or "not renewed" is `cancelled` — the user is telling us it stopped,
which is the same claim — and a past `next_renewal` is `overdue` rather than
any lifecycle value (see [product.md](product.md) and [AGENTS.md](../AGENTS.md)).

`0013_drop_lapsed` rewrote every `lapsed` subscription, event and proposal to
`cancelled`, keeping `ends_on` and identity. The value is still listed on the
three enums below because Postgres cannot drop an enum value without recreating
the type; **nothing reads or writes it**, and the labels that still mention it
read "Cancelled" so a row from an unmigrated database is not shown as a status
this product has.

```text
subscription_status: unknown | trial | active | paused | cancel_scheduled | cancelled
                     | lapsed  (historical; nothing writes it)
field_status: empty | proposed | inferred | confirmed | deferred | conflicted
cadence: weekly | monthly | yearly
confidence: low | medium | high
event_type: started | converted_to_paid | charged | terms_changed | paused | resumed
            | cancel_scheduled | cancelled | refunded | payment_failed | reactivated
            | lapsed  (historical; nothing writes it)
proposal_kind: create | update | charged | terms_changed | cancel_scheduled | cancelled
               | reactivated | lapsed  (historical; nothing writes it)
proposal_state: pending | accepted | rejected | superseded
capture_kind: text | image | pdf | audio
capture_run_state: awaiting_upload | reading | read | failed
question_reason: amount | cadence | renewal | duplicate | cancel_timing | account_identity | still_holding
question_state: asked | answered | deferred
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

## No `reminders` table

There was one, holding dismissable "renews Friday" and "you deferred this"
cards written by a nightly scan. It is gone, dropped in `0012_drop_reminders`
along with its two enums.

What replaced it is not another table. **Renewing soon** and the deferred-and-due
half of **Unfinished** are projections computed from `subscriptions` and
`capture_questions` when Inbox is opened — see
[query-and-ledger.md](query-and-ledger.md). A persisted nudge can disagree with
the row it is about; a projection cannot. Dismiss-as-seen went with the table:
a row leaves a section because the ledger changed, not because someone waved it
away.

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

What chat already asked, so “later” is not re-asked. Unique per user + provider + reason. `still_holding` is one row per user (canonical provider `these-subscriptions`), not per subscription. Code still asks it as a chat-open greeting today; the intended behavior drops that greeting in favor of overdue rows living in Inbox (see [query-and-ledger.md](query-and-ledger.md)) — this row stays for the one remaining per-turn follow-up.

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
- Do not infer `cancelled` from silence or a passed `next_renewal`. A holding row's **stored** `next_renewal` in the past is `overdue`; keep the stored date until the user acts. Do not roll it in a job and do not substitute a future date in list or detail.
- There is no `lapsed` status. User-stated expiry, a failed card, or "not renewed" is `cancelled`. The enum value survives in Postgres only because dropping one needs the type recreated; nothing writes it.
- A user-stated past date is the event date; do not snap cancel to today
