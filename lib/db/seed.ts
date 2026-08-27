import { resolve } from "node:path";

import dotenv from "dotenv";

import { closeDb, getDb } from "./index";
import { createSeedData, DEFAULT_SEED_EMAIL } from "./seed-data";
import { amendments, charges, events, subscriptions, users } from "./schema";

dotenv.config({ path: resolve(process.cwd(), ".env.local"), quiet: true });
dotenv.config({ path: resolve(process.cwd(), ".env"), quiet: true });

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is required to seed the database. Set it in .env.local or the environment.",
    );
  }

  const email = process.env.SEED_EMAIL?.trim().toLowerCase() || DEFAULT_SEED_EMAIL;
  const data = createSeedData(new Date(), email);
  const db = getDb();

  await db.transaction(async (tx) => {
    await tx
      .insert(users)
      .values(data.user)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          name: data.user.name,
          email: data.user.email,
          email_verified: data.user.email_verified,
          image: data.user.image,
          updated_at: new Date(),
        },
      });

    for (const subscription of data.subscriptions) {
      await tx
        .insert(subscriptions)
        .values(subscription)
        .onConflictDoUpdate({
          target: subscriptions.id,
          set: {
            provider_canonical: subscription.provider_canonical,
            provider_display: subscription.provider_display,
            plan: subscription.plan,
            account_hint: subscription.account_hint,
            status: subscription.status,
            amount_minor: subscription.amount_minor,
            currency: subscription.currency,
            cadence: subscription.cadence,
            next_renewal: subscription.next_renewal,
            started_on: subscription.started_on,
            ends_on: subscription.ends_on,
            notes: subscription.notes,
            provider_field_status: subscription.provider_field_status,
            amount_field_status: subscription.amount_field_status,
            cadence_field_status: subscription.cadence_field_status,
            renewal_field_status: subscription.renewal_field_status,
            status_field_status: subscription.status_field_status,
            amount_confidence: subscription.amount_confidence,
            cadence_confidence: subscription.cadence_confidence,
            renewal_confidence: subscription.renewal_confidence,
            provider_confidence: subscription.provider_confidence,
            status_confidence: subscription.status_confidence,
            deferred_until: subscription.deferred_until,
            updated_at: new Date(),
          },
        });
    }

    for (const amendment of data.amendments) {
      await tx
        .insert(amendments)
        .values(amendment)
        .onConflictDoUpdate({
          target: amendments.id,
          set: {
            subscription_id: amendment.subscription_id,
            effective_from: amendment.effective_from,
            effective_to: amendment.effective_to,
            amount_minor: amendment.amount_minor,
            currency: amendment.currency,
            cadence: amendment.cadence,
            plan: amendment.plan,
            updated_at: new Date(),
          },
        });
    }

    for (const event of data.events) {
      await tx
        .insert(events)
        .values(event)
        .onConflictDoUpdate({
          target: events.id,
          set: {
            subscription_id: event.subscription_id,
            type: event.type,
            at: event.at,
            confirmed: event.confirmed,
            rationale: event.rationale,
            payload: event.payload,
            capture_id: event.capture_id,
            updated_at: new Date(),
          },
        });
    }

    for (const charge of data.charges) {
      await tx
        .insert(charges)
        .values(charge)
        .onConflictDoUpdate({
          target: [charges.user_id, charges.idempotency_key],
          set: {
            subscription_id: charge.subscription_id,
            paid_on: charge.paid_on,
            amount_minor: charge.amount_minor,
            currency: charge.currency,
            covers_from: charge.covers_from,
            covers_to: charge.covers_to,
            capture_id: charge.capture_id,
            updated_at: new Date(),
          },
        });
    }
  });

  const [userCount, subscriptionCount, amendmentCount, eventCount, chargeCount] =
    await Promise.all([
      db.$count(users),
      db.$count(subscriptions),
      db.$count(amendments),
      db.$count(events),
      db.$count(charges),
    ]);

  console.log(
    `Seed complete: users=${userCount}, subscriptions=${subscriptionCount}, amendments=${amendmentCount}, events=${eventCount}, charges=${chargeCount}`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeDb);
