import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

let _db: ReturnType<typeof drizzle>;

export function getDatabase() {
  if (_db) {
    return _db;
  }

  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  const client = postgres(databaseUrl);
  _db = drizzle(client, { schema });
  return _db;
}

export * from "./schema.js";
