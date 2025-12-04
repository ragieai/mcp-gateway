#!/usr/bin/env node
/**
 * Main entry point for the Ragie MCP Gateway
 * A gateway that demonstrates how to integrate with clients like Claude and OpenAI
 */

import dotenv from "dotenv";
import { Gateway } from "./gateway.js";
import { createLogger } from "./logger.js";
import { getConfigFromEnv } from "./config.js";
import { loadMapper, Mapper } from "./mapping.js";
import assert from "assert";

// Load environment variables
dotenv.config();

const config = getConfigFromEnv();
const logger = createLogger("Main", config.logLevel, config.logFormat);
const gracefulShutdown = process.env["NODE_ENV"] === "development" ? false : true;

async function main(): Promise<void> {
  let mapper: Mapper;
  try {
    mapper = loadMapper(config.mappingFile);
  } catch (e) {
    assert(e instanceof Error, "Expected error to be an instance of Error");
    logger.error("Could not load mapper: " + e.message);
    process.exit(1);
  }

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
