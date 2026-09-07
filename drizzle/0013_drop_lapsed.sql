-- There is no `lapsed` status. A subscription that expired, whose card failed,
-- or that was not renewed is `cancelled` — the user said it stopped, which is
-- the same claim, so the ledger tells one story instead of two.
--
-- Data only. The value stays on the `subscription_status`, `event_type` and
-- `proposal_kind` enums, because Postgres cannot drop an enum value without
-- recreating the type; the app no longer writes it.

UPDATE "subscriptions" SET "status" = 'cancelled' WHERE "status" = 'lapsed';
--> statement-breakpoint
UPDATE "events" SET "type" = 'cancelled' WHERE "type" = 'lapsed';
--> statement-breakpoint
UPDATE "proposals"
SET "kind" = 'cancelled',
    "payload" = CASE
      WHEN "payload" #> '{subscriptionStatus,value}' = '"lapsed"'
        THEN jsonb_set("payload", '{subscriptionStatus,value}', '"cancelled"')
      ELSE "payload"
    END
WHERE "kind" = 'lapsed';
