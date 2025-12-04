import { EventEmitter } from "events";
import express, { NextFunction, Request, Response } from "express";

import { OrganizationMembership, WorkOS } from "@workos-inc/node";
import assert from "assert";
import expressWinston from "express-winston";
import { readFileSync } from "fs";
import { Server } from "http";
import { createProxyMiddleware } from "http-proxy-middleware";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type winston from "winston";
import { Config } from "./config.js";
import { createLogger } from "./logger.js";
import type { Mapper } from "./mapping.js";

const _filename = fileURLToPath(import.meta.url);
const _dirname = dirname(_filename);

interface ProxyParams {
  organizationId: string;
  collection: string;
}

type ProxyRequest = Request<ProxyParams>;

export class Gateway extends EventEmitter {
  private logger: winston.Logger;
  private config: Config;
  private isRunning: boolean;
  private app: express.Application;
  private mapper: Mapper;
  private server: Server | null;
  private workos: WorkOS;
  private wwwAuthenticateHeader: string;
  private workosJwks: ReturnType<typeof createRemoteJWKSet>;
  private welcomeTemplate: string;

  constructor(config: Config, mapper: Mapper, workos: WorkOS | null = null) {
    super();

    this.config = config;
    this.mapper = mapper;
    this.logger = createLogger("Gateway", this.config.logLevel, this.config.logFormat);
    this.isRunning = false;
    this.server = null;

    this.workos =
      workos ??
      new WorkOS(this.config.workosApiKey, {
        clientId: this.config.workosClientId,
      });

    this.wwwAuthenticateHeader = [
      'Bearer error="unauthorized"',
      'error_description="Authorization needed"',
      `resource_metadata="${this.config.baseUrl}/.well-known/oauth-protected-resource"`,
    ].join(", ");

    this.workosJwks = createRemoteJWKSet(new URL(this.config.workosAuthorizationServerUrl + "/oauth2/jwks"));

    const templatePath = join(_dirname, "templates", "welcome.html");
    this.welcomeTemplate = readFileSync(templatePath, "utf-8");

    this.app = express();
    this.initializeApp();
  }

  private initializeApp(): void {
    // Request/response logging middleware
    this.app.use(
      expressWinston.logger({
        winstonInstance: this.logger,
        meta: true,
        level: (req: Request, res: Response) => {
          if (res.statusCode >= 500) {
            return "error";
          } else if (res.statusCode >= 400) {
            return "warn";
          }
          return "info";
        },
        colorize: this.config.logFormat === "pretty",
        msg: "{{req.method}} {{req.path}} {{res.statusCode}} {{res.responseTime}}ms",
        requestWhitelist: ["path", "method", "httpVersion"],
        responseWhitelist: ["statusCode", "responseTime"],
      })
    );

    this.app.get("/welcome", (req: Request, res: Response) => {
      res.status(200).send(this.welcomeTemplate);
    });

    this.app.post(
      "/:organizationId/mcp/:collection",
      this.authMiddleware.bind(this),
      createProxyMiddleware<ProxyRequest>({
        target: this.config.ragieBaseUrl,
        logger: this.logger,
        changeOrigin: true,
        pathRewrite: (_path, req) => {
          const partition = this.mapper.getPartition(req.params.organizationId, req.params.collection);
          return `/mcp/${partition}/`;
        },
        on: {
          proxyReq: (proxyReq, req) => {
            const apiKey = this.mapper.getApiKey(req.params.organizationId, req.params.collection);
            proxyReq.setHeader("Authorization", `Bearer ${apiKey}`);
          },
        },
      })
    );

    this.app.get("/.well-known/oauth-protected-resource", (req, res) =>
      res.json({
        resource: `${this.config.baseUrl}/`,
        authorization_servers: [this.config.workosAuthorizationServerUrl],
        bearer_methods_supported: ["header"],
      })
    );

    this.app.get("/.well-known/oauth-authorization-server", async (_req, res) => {
      const response = await fetch(
        `${this.config.workosAuthorizationServerUrl}/.well-known/oauth-authorization-server`
      );
      const metadata = await response.json();

      res.json(metadata);
    });
  }

  async authMiddleware(req: ProxyRequest, res: Response, next: NextFunction) {
    const { organizationId, collection } = req.params;

    if (!this.mapper.hasMapping(organizationId, collection)) {
      this.logger.warn(`No mapping found for organization ${organizationId} and collection ${collection}`);
      res.status(404).json({ error: "Mapping not found" });
      return;
    }

    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    let userId: string | undefined;

    if (!token) {
      res.set("WWW-Authenticate", this.wwwAuthenticateHeader).status(401).json({ error: "No token provided." });
      return;
    }

    try {
      const { payload } = await jwtVerify(token, this.workosJwks, {
        issuer: this.config.workosAuthorizationServerUrl,
      });
      userId = payload.sub;
    } catch {
      res.set("WWW-Authenticate", this.wwwAuthenticateHeader).status(401).json({ error: "Invalid bearer token." });
      return;
    }
    assert(userId, "User ID is required in the JWT payload"); // type narrowing for userId

    // FIXME: This is a workaround because the WorkOS JWT does not include the organization ID.
    // As a result, this request needs to be made to validate the users membership in the organization.
    const response = await this.workos.userManagement.listOrganizationMemberships({
      userId,
      organizationId,
      statuses: ["active"],
    });

    const hasAccess = _checkAccess(userId, response.data, this.mapper.getAllowedRoles(organizationId, collection));
    if (!hasAccess) {
      res.set("WWW-Authenticate", this.wwwAuthenticateHeader).status(403).json({ error: "Access denied" });
      return;
    }

    next();
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn("Gateway is already running");
      return;
    }

    this.logger.info(`Starting Gateway on port ${this.config.port}`);
    this.logger.info(`Base URL: ${this.config.baseUrl}`);

    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.config.port, (error?: Error) => {
        if (error) {
          this.logger.error("Failed to start server:", error);
          reject(error);
          return;
        }

        this.isRunning = true;

        this.emit("started");
        this.logger.info("Gateway started successfully");
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      this.logger.warn("Gateway is not running");
      return;
    }

    this.logger.info("Stopping Gateway...");

    return new Promise(resolve => {
      if (this.server) {
        if (this.server.listening) {
          this.server.close((error?: Error) => {
            if (error) {
              this.logger.error("Failed to stop server:", error);
              resolve(void 0);
              return;
            }

            this.isRunning = false;
            this.emit("stopped");
            this.logger.info("Gateway stopped successfully");
            resolve(void 0);
          });
        }
      } else {
        this.isRunning = false;
        this.emit("stopped");
        this.logger.info("Gateway stopped successfully");
        resolve(void 0);
      }
    });
  }

  getConfig(): Config {
    return { ...this.config };
  }

  isActive(): boolean {
    return this.isRunning;
  }
}

function _checkAccess(userId: string, memberships: OrganizationMembership[], allowedRoles: string[] | "*"): boolean {
  if (memberships.length === 0) {
    return false;
  }

  if (allowedRoles === "*") {
    return true;
  }

  const roles = new Set<string>(
    memberships
      .filter(membership => membership.userId === userId)
      .flatMap(membership => membership.roles ?? [])
      .map(role => role.slug)
  );

  return allowedRoles.some(role => roles.has(role));
}
