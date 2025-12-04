/**
 * Tests for the Gateway class
 */

import { Gateway } from "../gateway.js";
import { StrictMapper, MapperConfig } from "../mapping.js";

describe("Gateway", () => {
  let gateway: Gateway;

  beforeEach(() => {
    const mapperConfig: MapperConfig = {
      ragieApiKey: "ragie_api_key",
      strictApiKeys: false,
    };
    gateway = new Gateway(
      {
        ...mapperConfig,
        baseUrl: "http://localhost:3000",
        port: 3002,
        logLevel: "error", // Reduce log noise during tests
        logFormat: "pretty",
        ragieBaseUrl: "ragie_mcp_server_url",
        workosApiKey: "workos_api_key",
        workosAuthorizationServerUrl: "https://placeholder.authkit.app",
        workosClientId: "workos_client_id",
        mappingFile: "mapping.json",
      },
      new StrictMapper({})
    );
  });

  afterEach(async () => {
    if (gateway.isActive()) {
      await gateway.stop();
    }
  });

  describe("lifecycle", () => {
    it("should start and stop successfully", async () => {
      await gateway.start();
      expect(gateway.isActive()).toBe(true);

      await gateway.stop();
      expect(gateway.isActive()).toBe(false);
    });

    it("should not start if already running", async () => {
      await gateway.start();
      expect(gateway.isActive()).toBe(true);

      // Second start should not throw
      await expect(gateway.start()).resolves.not.toThrow();
    });

    it("should not stop if not running", async () => {
      await expect(gateway.stop()).resolves.not.toThrow();
    });
  });
});
