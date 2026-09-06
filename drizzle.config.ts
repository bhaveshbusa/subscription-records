import { resolve } from "node:path";

import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

dotenv.config({ path: resolve(process.cwd(), ".env.local"), quiet: true });
dotenv.config({ path: resolve(process.cwd(), ".env"), quiet: true });

/**
 * Migrations run DDL over a single direct connection. Neon's Vercel integration
 * sets DATABASE_URL to a pooled string and DATABASE_URL_UNPOOLED to a direct
 * one; DDL through the pooler is the documented way to get odd failures, so
 * prefer the direct connection wherever one is offered. Elsewhere (local
 * Postgres, the test container, CI) only DATABASE_URL exists and is direct.
 */
const migrationUrl =
  process.env.DATABASE_URL_UNPOOLED?.trim() || process.env.DATABASE_URL?.trim() || "";

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: migrationUrl,
  },
});
