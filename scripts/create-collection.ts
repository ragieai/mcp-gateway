#!/usr/bin/env npx ts-node
/**
 * Script to create a collection in the database.
 *
 * Interactive mode (default):
 *   npx ts-node scripts/create-collection.ts
 *
 * Non-interactive mode:
 *   npx ts-node scripts/create-collection.ts \
 *     --name "my-collection" \
 *     --organization-id "org_123" \
 *     --partition "my-partition" \
 *     --ragie-api-key "ragie_xxx" \
 *     --allowed-roles "admin,member"
 *
 * Use --allowed-roles "*" to allow all roles.
 */

import "dotenv/config";
import * as readline from "readline";
import postgres from "postgres";
import { encrypt } from "../src/crypto.js";

interface CollectionInput {
  name: string;
  organizationId: string;
  partition: string;
  ragieApiKey: string;
  allowedRoles: string[] | "*";
}

function parseArgs(): Partial<CollectionInput> & { help?: boolean } {
  const args = process.argv.slice(2);
  const result: Partial<CollectionInput> & { help?: boolean } = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case "--help":
      case "-h":
        result.help = true;
        break;
      case "--name":
        result.name = nextArg;
        i++;
        break;
      case "--organization-id":
        result.organizationId = nextArg;
        i++;
        break;
      case "--partition":
        result.partition = nextArg;
        i++;
        break;
      case "--ragie-api-key":
        result.ragieApiKey = nextArg;
        i++;
        break;
      case "--allowed-roles":
        if (nextArg === "*") {
          result.allowedRoles = "*";
        } else {
          result.allowedRoles = nextArg.split(",").map(r => r.trim());
        }
        i++;
        break;
    }
  }

  return result;
}

function printHelp(): void {
  console.log(`
Usage: npx ts-node scripts/create-collection.ts [options]

Creates a collection in the database. Runs interactively if no options provided.

Options:
  --name <name>              Collection name (used in URL path)
  --organization-id <id>     WorkOS organization ID
  --partition <partition>    Ragie partition name
  --ragie-api-key <key>      Ragie API key (will be encrypted)
  --allowed-roles <roles>    Comma-separated roles or "*" for all
  -h, --help                 Show this help message

Environment variables:
  DATABASE_URL               PostgreSQL connection URL (required)
  ENCRYPTION_KEY             Encryption key for API keys (required, min 32 chars)

Examples:
  # Interactive mode
  npx ts-node scripts/create-collection.ts

  # Non-interactive mode
  npx ts-node scripts/create-collection.ts \\
    --name "docs" \\
    --organization-id "org_abc123" \\
    --partition "production" \\
    --ragie-api-key "ragie_xxx" \\
    --allowed-roles "admin,member"

  # Allow all roles
  npx ts-node scripts/create-collection.ts \\
    --name "public-docs" \\
    --organization-id "org_abc123" \\
    --partition "public" \\
    --ragie-api-key "ragie_xxx" \\
    --allowed-roles "*"
`);
}

function createReadlineInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

async function prompt(rl: readline.Interface, question: string, defaultValue?: string): Promise<string> {
  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  return new Promise(resolve => {
    rl.question(`${question}${suffix}: `, answer => {
      resolve(answer.trim() || defaultValue || "");
    });
  });
}

async function promptRequired(rl: readline.Interface, question: string): Promise<string> {
  let answer = "";
  while (!answer) {
    answer = await prompt(rl, question);
    if (!answer) {
      console.log("  This field is required.");
    }
  }
  return answer;
}

async function runInteractive(): Promise<CollectionInput> {
  const rl = createReadlineInterface();

  console.log("\nCreate a new collection\n");

  try {
    const name = await promptRequired(rl, "Collection name");
    const organizationId = await promptRequired(rl, "Organization ID");
    const partition = await promptRequired(rl, "Partition");
    const ragieApiKey = await promptRequired(rl, "Ragie API key");
    const allowedRolesInput = await promptRequired(rl, 'Allowed roles (comma-separated or "*" for all)');

    const allowedRoles = allowedRolesInput === "*" ? "*" : allowedRolesInput.split(",").map(r => r.trim());

    return {
      name,
      organizationId,
      partition,
      ragieApiKey,
      allowedRoles,
    };
  } finally {
    rl.close();
  }
}

async function createCollection(input: CollectionInput): Promise<void> {
  const databaseUrl = process.env["DATABASE_URL"];
  const encryptionKey = process.env["ENCRYPTION_KEY"];

  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  if (!encryptionKey || encryptionKey.length < 32) {
    throw new Error("ENCRYPTION_KEY environment variable is required and must be at least 32 characters");
  }

  const sql = postgres(databaseUrl);

  try {
    // Encrypt the API key
    const encryptedApiKey = await encrypt(input.ragieApiKey, encryptionKey);

    // Insert the collection
    const result = await sql`
      INSERT INTO collections (
        name,
        organization_id,
        partition,
        ragie_api_key,
        allowed_roles
      ) VALUES (
        ${input.name},
        ${input.organizationId},
        ${input.partition},
        ${encryptedApiKey},
        ${JSON.stringify(input.allowedRoles)}
      )
      RETURNING id
    `;

    console.log(`\nCollection created successfully!`);
    console.log(`  ID: ${result[0].id}`);
    console.log(`  Name: ${input.name}`);
    console.log(`  Organization: ${input.organizationId}`);
    console.log(`  Partition: ${input.partition}`);
    console.log(`  Allowed roles: ${input.allowedRoles === "*" ? "* (all)" : (input.allowedRoles as string[]).join(", ")}`);
    console.log(`\nEndpoint: POST /${input.organizationId}/mcp/${input.name}`);
  } finally {
    await sql.end();
  }
}

async function main(): Promise<void> {
  const args = parseArgs();

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  let input: CollectionInput;

  // Check if we have all required args for non-interactive mode
  const hasAllArgs =
    args.name && args.organizationId && args.partition && args.ragieApiKey && args.allowedRoles;

  if (hasAllArgs) {
    // Non-interactive mode
    input = {
      name: args.name!,
      organizationId: args.organizationId!,
      partition: args.partition!,
      ragieApiKey: args.ragieApiKey!,
      allowedRoles: args.allowedRoles!,
    };
  } else if (Object.keys(args).length > 0 && !args.help) {
    // Some args provided but not all - show error
    console.error("Error: When using command-line arguments, all required fields must be provided.");
    console.error("Required: --name, --organization-id, --partition, --ragie-api-key, --allowed-roles");
    console.error("\nRun with --help for usage information.");
    process.exit(1);
  } else {
    // Interactive mode
    input = await runInteractive();
  }

  await createCollection(input);
}

main().catch(error => {
  console.error("Error:", error.message);
  process.exit(1);
});
