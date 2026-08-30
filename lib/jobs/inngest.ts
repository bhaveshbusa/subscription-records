import { Inngest } from "inngest";

/**
 * The app's job client. Jobs are queued work, not a second source of truth: they
 * read the ledger and write proposals, and the user's accept is still what moves
 * a row.
 */
export const inngest = new Inngest({ id: "subscription-records" });

/** Asks for a lapse scan out of band, for one user or for all of them. */
export const LAPSE_SCAN_REQUESTED = "jobs/lapse-scan.requested";
