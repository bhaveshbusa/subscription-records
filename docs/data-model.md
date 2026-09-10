# Data model

Postgres. All tables include `id` (uuid), `user_id`, `created_at`, `updated_at` unless noted.

The ledger is holdings + cost + next due, not a payment history. Field-level trust is stored on the subscription projection (and copied onto list API). Historical truth lives in `amendments` and `events`. There is no `charges` table.

The tables below match the schema **on `main` today** — the stage-one columns and the reminder-preference table have landed ([SUB-44](https://linear.app/lets-play-match/issue/SUB-44/add-trial-and-auto-renewal-facts-to-manual-entry-and-reads), [SUB-47](https://linear.app/lets-play-match/issue/SUB-47/save-independent-reminder-preferences)) and are specified after the current tables. The agreed Subscription Workspace UX direction is at the end of this file; its schema changes land in the linked issues, not before. Expected next renewal is **not a column**: it is computed on read after [SUB-48](https://linear.app/lets-play-match/issue/SUB-48/show-expected-renewals-and-remove-routine-confirmation-work).

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
| `trial_ends_on` | date, nullable. Separate from `ends_on`. During trial this is the expected payment-start boundary if the user continues. |
| `auto_renewal` | `yes` \| `no` \| unknown (null + `empty` / non-confirmed status). Not inferred from cadence. |
| `notes` | text, nullable |
| `provider_field_status` / `amount_field_status` / `cadence_field_status` / `renewal_field_status` / `status_field_status` / `trial_end_field_status` / `auto_renewal_field_status` | `field_status` |
| `amount_confidence` etc. | `confidence`, nullable |
| `deferred_until` | timestamptz, nullable |

Do not store monthly-equivalent; compute in the API.

Amount, currency, and cadence on a `trial` row are the paid plan after trial, not a current charge. There is no separate trial-price column. List and detail label those fields “after trial” while status is trial. [SUB-44](https://linear.app/lets-play-match/issue/SUB-44/add-trial-and-auto-renewal-facts-to-manual-entry-and-reads).

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

## No dismissable `reminders` table

There was one, holding dismissable "renews Friday" and "you deferred this"
cards written by a nightly scan. It is gone, dropped in `0012_drop_reminders`
along with its two enums. Stage one does **not** bring it back. Inbox
notifications stay computed on read. There is no notification store, dismissal
state, or scheduled scan.

On `main`, **Reminders** and the deferred-and-due half of **Unfinished**
are projections from `subscriptions` and reminder preferences when Inbox is
opened — see [query-and-ledger.md](query-and-ledger.md). Preference-driven
**Reminders** replaced Renewing soon. A persisted nudge can disagree with the
row it is about; a projection cannot.

## Stage-one additions (landed)

Additive migrations only. Existing rows stay valid. Old proposal payloads that
omit new fields must not clear them.

### `subscriptions` — [SUB-44](https://linear.app/lets-play-match/issue/SUB-44/add-trial-and-auto-renewal-facts-to-manual-entry-and-reads)

Landed. Columns above. Existing rows migrated with these facts unknown, never inferred from cadence. Capture proposes them as pending cards ([SUB-45](https://linear.app/lets-play-match/issue/SUB-45/capture-the-new-facts-and-preferences-through-proposals)); old proposal payloads that omit them must not clear them.

Do not add `expected_next_renewal`, trial-price, or post-trial-price columns.

### `subscription_reminder_preferences` — [SUB-47](https://linear.app/lets-play-match/issue/SUB-47/save-independent-reminder-preferences)

Landed. User-owned. Unique on `(user_id, subscription_id, target)`.

| Column | Notes |
|---|---|
| `subscription_id` | fk |
| `target` | `renewal` \| `trial_end` |
| `state` | `off` \| `enabled` (an **absent** row is unset — distinct from `off`) |
| `lead_value` | integer, nullable when off/unset |
| `lead_unit` | `days` \| `months` |

Suggestions (weekly/monthly renewal off; yearly one calendar month; trial three
days) are UI starting points. Only a user action writes a row. Migration leaves
existing subscriptions unset. Cadence edits must not overwrite a stored choice.
Notification dates are not stored here.

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

What capture already asked, so “later” is not re-asked. **Unique per user + `scope_key` + reason** ([SUB-52](https://linear.app/lets-play-match/issue/SUB-52/decide-the-holding-identity-rule-for-capture)). `scope_key` names the thing the question is about: `holding:<subscription id>` when a holding was matched, otherwise `draft:<provider canonical>|<normalised account or empty>` for a subscription not yet on file. Two accounts of one provider therefore keep separate questions, and `subscription_id` / `provider_canonical` stay as display and lookup columns rather than identity. Every row here belongs to **one capture turn** — a missing amount, a cadence, a renewal date, a duplicate, cancel timing, an account identity — and is asked at most once per scope. An `account_identity` question is raised when a message matches several holdings without naming one, or names an account no holding of that provider carries; its answer (`same`, `new`, or one of the offered accounts) is read against the exact question row. Open questions are still persisted but not surfaced again after their turn until [SUB-55](https://linear.app/lets-play-match/issue/SUB-55/open-capture-questions-are-recorded-but-never-surfaced-again).

Migration `0016_question_scope` backfilled existing rows (`holding:<subscription_id>` when set, else `draft:<provider_canonical>|`) before adding the unique index.

`still_holding` remains on the `question_reason` enum but nothing writes it. It backed a chat-open greeting that asked about every overdue row at once; that question is now the Overdue section's two buttons, on the row it is about (see [query-and-ledger.md](query-and-ledger.md)).

## Authority

| Field | AI/system may auto-set to `confirmed`? |
|---|---|
| Provider, plan, category-like hints | Yes, if high confidence and no collision |
| Amount, cadence, next_renewal, trial end, auto-renewal | **No**. Cadence never confirms auto-renewal |
| Reminder preference | **No** (proposal until accept, or an explicit manual save) |
| Cancel / merge / reactivate vs new | **No** (proposal only) |
| Receipt / “I paid” | Updates holding, cost, and next due as `proposed` or `inferred`. Does not confirm amount. Does not write a payment |
| Expected next renewal | **Must not be stored** |

## Subscription Workspace UX direction (agreed — not on `main` yet)

Published in [SUB-57](https://linear.app/lets-play-match/issue/SUB-57/publish-the-agreed-subscription-workspace-ux-contract); the full contract is [subscription-workspace-ux-plan.md](subscription-workspace-ux-plan.md). These are schema-shaping decisions the dependent issues implement — do not add them early:

- **The stable holding ID is identity** (landed, [SUB-52](https://linear.app/lets-play-match/issue/SUB-52/decide-the-holding-identity-rule-for-capture)). Provider and account are matching evidence; plan is an editable property. Never add a unique constraint on provider or provider+account. Matching resolves to one compatible holding, asks when several are compatible or the named account is unseen, and otherwise drafts a `create`. A pending `create` with the same provider+account as an earlier pending one is folded onto that card (payload merged, rationale appended, `capture_id` re-linked); a different account is a separate draft. Proposals against a holding carry `payload.target` (provider + account at capture time); accept refuses with `stale_target` if the holding's identity has since changed, and a `create` accept refuses with `duplicate_holding` if an equivalent draft was accepted first — both under the user row lock, leaving the card pending.
- Question identity is `(user_id, scope_key, reason)` — the holding/draft scope (landed, [SUB-52](https://linear.app/lets-play-match/issue/SUB-52/decide-the-holding-identity-rule-for-capture)); resurfacing them is [SUB-55](https://linear.app/lets-play-match/issue/SUB-55/open-capture-questions-are-recorded-but-never-surfaced-again).
- A persistent conversation with an explicit target and unsent-draft recovery may add minimal linkage — session-scoped, resolved under the session user, rejecting cross-user and incompatible IDs ([SUB-61](https://linear.app/lets-play-match/issue/SUB-61/keep-a-persistent-conversation-linked-to-the-selected-subscription-or)).
- Acceptance rechecks identity and revision transactionally — transport retry idempotency is separate from semantic duplicate matching ([SUB-52](https://linear.app/lets-play-match/issue/SUB-52/decide-the-holding-identity-rule-for-capture), [SUB-59](https://linear.app/lets-play-match/issue/SUB-59/confirm-and-edit-individual-fields-directly-on-proposals-and-records)).
- Interpretation defaults change in [SUB-60](https://linear.app/lets-play-match/issue/SUB-60/interpret-new-subscriptions-as-active-and-current-trials-as-trial): new captures default to `active` and explicit current-trial input means `trial`; `unknown` is for genuinely ambiguous input only. The enum gains nothing — `active`, `trial`, and `unknown` already exist.

## Invariants

- One open amendment (`effective_to` is null) per subscription
- Cancelled subscriptions keep their row
- List queries never return another user’s rows
- Do not infer `cancelled` from silence or a passed `next_renewal`. Keep the **stored** `next_renewal` and its trust. Do not roll it in a job. Do not substitute a projected future date for the stored value in list or detail.
- Expected next renewal (SUB-48) is a read-time projection, never a column, and only when status is `active`, auto-renewal is confirmed yes, and cadence and recorded date are confirmed.
- There is no `lapsed` status. User-stated expiry, a failed card, or "not renewed" is `cancelled`. The enum value survives in Postgres only because dropping one needs the type recreated; nothing writes it.
- A user-stated past date is the event date; do not snap cancel to today
- Trial end passing does not convert the row to paid or write a payment
- A notes-only update must not confirm untouched money/date fields (SUB-43)
- Reminder notifications are not rows. Expiring one writes nothing
