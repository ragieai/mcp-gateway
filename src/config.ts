import z from "zod";

export interface Config {
  baseUrl: string;
  port: number;
  logLevel: "debug" | "info" | "warn" | "error";
  logFormat: "json" | "pretty";
  mappingFile: string;
  ragieBaseUrl: string;
  workosApiKey: string;
  workosAuthorizationServerUrl: string;
  workosClientId: string;
}

export function getConfigFromEnv(): Config {
  const envVarSchema = z.object({
    BASE_URL: z.string().optional(),
    PORT: z.coerce.number().default(3000),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    LOG_FORMAT: z.enum(["json", "pretty"]).default("pretty"),
    MAPPING_FILE: z.string(),
    RAGIE_BASE_URL: z.string().default("https://api.ragie.ai/"),
    WORKOS_API_KEY: z.string(),
    WORKOS_AUTHORIZATION_SERVER_URL: z.string(),
    WORKOS_CLIENT_ID: z.string(),
  });

  const env = envVarSchema.parse(process.env);

  // Default BASE_URL to localhost with the configured port if not provided
  const baseUrl = env.BASE_URL || `http://localhost:${env.PORT}`;

  const config: Config = {
    baseUrl,
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    logFormat: env.LOG_FORMAT,
    mappingFile: env.MAPPING_FILE,
    ragieBaseUrl: env.RAGIE_BASE_URL,
    workosApiKey: env.WORKOS_API_KEY,
    workosAuthorizationServerUrl: env.WORKOS_AUTHORIZATION_SERVER_URL,
    workosClientId: env.WORKOS_CLIENT_ID,
  };

  return config;
}
