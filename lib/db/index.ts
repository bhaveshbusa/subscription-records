import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

type DatabaseClient = {
  db: ReturnType<typeof drizzle>;
  pool: Pool;
};

let client: DatabaseClient | undefined;

function createClient(): DatabaseClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is required to use the database. Set it before starting a database operation.",
    );
  }

  const pool = new Pool({ connectionString });
  return { db: drizzle(pool, { schema }), pool };
}

function getClient() {
  client ??= createClient();
  return client;
}

export function getDb() {
  return getClient().db;
}

export async function closeDb() {
  if (client) {
    await client.pool.end();
    client = undefined;
  }
}
