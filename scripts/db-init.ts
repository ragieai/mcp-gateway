import "dotenv/config";
import postgres from "postgres";

async function initDatabase() {
  const databaseUrl = process.env["DATABASE_URL"];

  if (!databaseUrl) {
    console.error("DATABASE_URL environment variable is required");
    process.exit(1);
  }

  const sql = postgres(databaseUrl);

  console.log("Creating database tables...");

  await sql`
    CREATE TABLE IF NOT EXISTS collections (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      name text NOT NULL,
      organization_id text NOT NULL,
      partition text NOT NULL,
      mcp_server_url text NOT NULL,
      allowed_roles jsonb NOT NULL,
      created_at timestamp DEFAULT now() NOT NULL,
      updated_at timestamp DEFAULT now() NOT NULL,
      filters jsonb
    )
  `;

  console.log("Database tables created successfully");

  await sql.end();
  process.exit(0);
}

initDatabase().catch((error) => {
  console.error("Failed to initialize database:", error);
  process.exit(1);
});
