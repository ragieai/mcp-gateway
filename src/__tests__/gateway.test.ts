/**
 * Tests for the Gateway class
 */

import { createServer, Server, IncomingMessage, ServerResponse } from "http";
import { Gateway } from "../gateway.js";
import { Mapper, CollectionRecord } from "../mapping.js";

class MockMapper implements Mapper {
  public collectionFilters?: Record<string, unknown>;

  async hasCollection(): Promise<boolean> {
    return true;
  }
  async getCollection(): Promise<CollectionRecord> {
    return new CollectionRecord("test-partition", "test-api-key", "*", this.collectionFilters);
  }
}

// Mock WorkOS client
const mockWorkOS = {
  userManagement: {
    listOrganizationMemberships: jest.fn().mockResolvedValue({
      data: [{ userId: "test-user-id", roles: [{ slug: "admin" }] }],
    }),
  },
};

describe("Gateway", () => {
  let gateway: Gateway;
  let mockMapper: MockMapper;

  beforeEach(() => {
    mockMapper = new MockMapper();
    gateway = new Gateway(
      {
        baseUrl: "http://localhost:3000",
        port: 3002,
        logLevel: "error", // Reduce log noise during tests
        logFormat: "pretty",
        ragieBaseUrl: "http://localhost:3099",
        workosApiKey: "workos_api_key",
        workosAuthorizationServerUrl: "https://placeholder.authkit.app",
        workosClientId: "workos_client_id",
        encryptionKey: "test-encryption-key-at-least-32-chars",
      },
      mockMapper,
      mockWorkOS as never
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

  describe("filters", () => {
    let upstreamServer: Server;
    let capturedBody: unknown;

    beforeEach(async () => {
      // Create a mock upstream server to capture the proxied request
      capturedBody = null;
      upstreamServer = createServer((req: IncomingMessage, res: ServerResponse) => {
        let body = "";
        req.on("data", chunk => {
          body += chunk;
        });
        req.on("end", () => {
          capturedBody = JSON.parse(body);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ jsonrpc: "2.0", result: {}, id: 1 }));
        });
      });

      await new Promise<void>(resolve => {
        upstreamServer.listen(3099, resolve);
      });

      await gateway.start();
    });

    afterEach(async () => {
      await new Promise<void>(resolve => {
        upstreamServer.close(() => resolve());
      });
    });

    it("should merge collection filters into retrieve requests", async () => {
      mockMapper.collectionFilters = { department: "engineering", scope: "internal" };

      const response = await fetch("http://localhost:3002/org_123/mcp/test-collection", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          params: {
            name: "retrieve",
            arguments: {
              query: "test query",
              filter: { category: "docs" },
            },
          },
          id: 1,
        }),
      });

      expect(response.status).toBe(200);
      expect(capturedBody).toEqual({
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          name: "retrieve",
          arguments: {
            query: "test query",
            filter: {
              category: "docs",
              department: "engineering",
              scope: "internal",
            },
          },
        },
        id: 1,
      });
    });

    it("should override request filters with collection filters", async () => {
      mockMapper.collectionFilters = { department: "sales" };

      const response = await fetch("http://localhost:3002/org_123/mcp/test-collection", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          params: {
            name: "retrieve",
            arguments: {
              query: "test query",
              filter: { department: "engineering", category: "docs" },
            },
          },
          id: 1,
        }),
      });

      expect(response.status).toBe(200);
      expect(capturedBody).toEqual({
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          name: "retrieve",
          arguments: {
            query: "test query",
            filter: {
              category: "docs",
              department: "sales", // Overridden by collection filter
            },
          },
        },
        id: 1,
      });
    });

    it("should not modify non-retrieve requests", async () => {
      mockMapper.collectionFilters = { department: "engineering" };

      const response = await fetch("http://localhost:3002/org_123/mcp/test-collection", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          params: {
            name: "search",
            arguments: {
              query: "test query",
            },
          },
          id: 1,
        }),
      });

      expect(response.status).toBe(200);
      expect(capturedBody).toEqual({
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          name: "search",
          arguments: {
            query: "test query",
          },
        },
        id: 1,
      });
    });

    it("should not modify requests when collection has no filters", async () => {
      delete mockMapper.collectionFilters;

      const response = await fetch("http://localhost:3002/org_123/mcp/test-collection", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          params: {
            name: "retrieve",
            arguments: {
              query: "test query",
              filter: { category: "docs" },
            },
          },
          id: 1,
        }),
      });

      expect(response.status).toBe(200);
      expect(capturedBody).toEqual({
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          name: "retrieve",
          arguments: {
            query: "test query",
            filter: { category: "docs" },
          },
        },
        id: 1,
      });
    });

    it("should add filters to retrieve requests without existing filters", async () => {
      mockMapper.collectionFilters = { department: "engineering" };

      const response = await fetch("http://localhost:3002/org_123/mcp/test-collection", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          params: {
            name: "retrieve",
            arguments: {
              query: "test query",
            },
          },
          id: 1,
        }),
      });

      expect(response.status).toBe(200);
      expect(capturedBody).toEqual({
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          name: "retrieve",
          arguments: {
            query: "test query",
            filter: { department: "engineering" },
          },
        },
        id: 1,
      });
    });
  });
});
