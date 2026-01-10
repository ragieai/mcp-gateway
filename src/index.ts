#!/usr/bin/env node
/**
 * Main entry point for the Ragie MCP Gateway
 * A gateway that demonstrates how to integrate with clients like Claude and OpenAI
 */

import dotenv from "dotenv";
import { getConfigFromEnv } from "./config.js";
import { Gateway } from "./gateway.js";
import { createLogger } from "./logger.js";
import { DatabaseMapper } from "./mapping.js";
import { getDatabase } from "./db/index.js";

// Load environment variables
dotenv.config();

const config = getConfigFromEnv();
const logger = createLogger("Main", config.logLevel, config.logFormat);
const gracefulShutdown = process.env["NODE_ENV"] === "development" ? false : true;

async function main(): Promise<void> {
  const mapper = new DatabaseMapper(getDatabase(), config.encryptionKey);

  const gateway = new Gateway(config, mapper);
  await gateway.start();

  logger.info("MCP Gateway started successfully");

  process.on("SIGINT", async () => {
    if (gracefulShutdown) {
      logger.info("Received SIGINT, shutting down gracefully...");
      await gateway.stop();
    } else {
      logger.info("Received SIGINT, shutting down immediately...");
    }
    process.exit(0);
  });
}

// Start the application
main().catch(error => {
  logger.error(error);
  process.exit(1);
});
