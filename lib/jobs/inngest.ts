import { Inngest } from "inngest";

/**
 * The app's job client. Jobs are queued work, not a second source of truth: they
 * read the ledger and raise reminders, and the user's accept is still what moves
 * a status. No job writes a money or date field.
 */
export const inngest = new Inngest({ id: "subscription-records" });

/** Asks for a reminder scan out of band, for one user or for all of them. */
export const REMINDER_SCAN_REQUESTED = "jobs/reminder-scan.requested";
