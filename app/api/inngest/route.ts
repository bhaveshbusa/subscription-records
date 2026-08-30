import { serve } from "inngest/next";

import { jobFunctions } from "@/lib/jobs/functions";
import { inngest } from "@/lib/jobs/inngest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Where Inngest reaches the app's jobs: it registers what is here and calls back
 * to run each one. The nightly lapse scan hangs off this route, and the Inngest
 * dev server uses the same one locally.
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: jobFunctions,
});
