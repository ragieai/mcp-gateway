# Ragie MCP Gateway

A multi-tenant MCP (Model Context Protocol) gateway for the Ragie Model Context Protocol server that implements bearer token authentication using WorkOS. This gateway enables secure, organization-based access to Ragie's MCP services through JWT token validation and organization membership verification.

## Overview

This gateway acts as a secure proxy between AI clients (like Claude, OpenAI, or Anthropic) and the Ragie MCP server. It provides:

- **Bearer Token Authentication**: JWT token verification via WorkOS JWKS
- **Organization-Based Routing**: Multi-tenant routing with organization-scoped endpoints
- **Organization Membership Validation**: Verifies user membership in organizations via WorkOS
- **Collection-Based Mapping**: Maps organization IDs and collections to Ragie partitions with per-organization/collection API keys
- **Proxy Functionality**: Transparent forwarding of authenticated requests to Ragie MCP services
- **OAuth Discovery Endpoints**: Well-known endpoints for OAuth metadata discovery

## Prerequisites

- Node.js 18+
- WorkOS account and application setup
- Ragie API keys for your organizations/collections
- Mapping file configured with organization/collection to partition mappings

## Installation

### Using npx (Recommended)

Run the gateway directly without installing:

```bash
npx @ragieai/mcp-gateway
```

### Global Installation

Install globally for system-wide access:

```bash
npm install -g @ragieai/mcp-gateway
```

Then run it from anywhere:

```bash
mcp-gateway
```

### Local Installation

Install as a dependency in your project:

```bash
npm install @ragieai/mcp-gateway
```

Then run it with:

```bash
npx mcp-gateway
```

Or add it to your `package.json` scripts:

```json
{
  "scripts": {
    "start:gateway": "mcp-gateway"
  }
}
```

### Development Setup

If you want to contribute or customize the gateway:

```bash
# Clone the repository
git clone <repository-url>
cd mcp-gateway

# Install dependencies
npm install

# Copy the environment template
cp .env.example .env

# Configure your environment variables in .env (see Configuration section)

# Build the project
npm run build
```

## Configuration

The gateway requires several environment variables to be configured. You can set these via:

- Environment variables in your shell
- A `.env` file in the current directory (loaded automatically)
- Your deployment platform's environment configuration

### Required Variables

- `MAPPING_FILE`: Path to a JSON file mapping organization IDs and collections to Ragie partitions (required)
- `WORKOS_API_KEY`: Your WorkOS API key
- `WORKOS_AUTHORIZATION_SERVER_URL`: Your WorkOS AuthKit authorization server URL
- `WORKOS_CLIENT_ID`: Your WorkOS application client ID

### Optional Variables

- `BASE_URL`: The public URL of your gateway server (defaults to `http://localhost:{PORT}` where `{PORT}` is the configured port)
- `PORT`: Server port (defaults to 3000)
- `LOG_LEVEL`: Logging level - debug, info, warn, or error (defaults to info)
- `LOG_FORMAT`: Log format - json or pretty (defaults to pretty)
- `NODE_ENV`: Environment mode (development, production, etc.)
- `RAGIE_BASE_URL`: Ragie API base URL (defaults to `https://api.ragie.ai/`)

### Example `.env` File

```bash
# Required: Path to mapping file
MAPPING_FILE=mapping.json

# Required: WorkOS Configuration
WORKOS_API_KEY=your_workos_api_key_here
WORKOS_AUTHORIZATION_SERVER_URL=https://api.workos.com/auth/v1
WORKOS_CLIENT_ID=your_workos_client_id_here

# Optional: Base URL (defaults to http://localhost:{PORT} where {PORT} is the configured port)
# BASE_URL=http://localhost:3000

PORT=3000
LOG_LEVEL=info
LOG_FORMAT=pretty
NODE_ENV=production
# Optional: Ragie API base URL (defaults to https://api.ragie.ai/)
# RAGIE_BASE_URL=https://api.ragie.ai/
```

## Usage

### Basic Usage

Run the gateway with default settings:

```bash
npx @ragieai/mcp-gateway
```

The gateway will start on port 3000 (or the port specified in `PORT` environment variable).

### Organization and Collection Mapping

The gateway uses a required mapping file that maps organization IDs and collections to Ragie partitions. Each organization can have multiple collections, and each collection mapping specifies the partition and API key to use.

Create a JSON mapping file:

```json
{
  "org_11111111111111111111111111": {
    "collection-name": {
      "partition": "soc2",
      "apiKey": "ragie_api_key_for_this_org_collection",
      "allowedRoles": ["admin", "member"]
    },
    "another-collection": {
      "partition": "custom-partition",
      "apiKey": "different_api_key",
      "allowedRoles": "*"
    }
  },
  "org_22222222222222222222222222": {
    "default": {
      "partition": "production",
      "apiKey": "production_api_key",
      "allowedRoles": ["admin"]
    }
  }
}
```

Each collection mapping must include:
- `partition` (required): The Ragie partition name to route to
- `apiKey` (required): The Ragie API key for this organization/collection combination
- `allowedRoles` (required): Array of role names (e.g., `["admin", "member"]`) or `"*"` to allow all roles

**Role-Based Access Control:** The gateway enforces role-based access control using WorkOS organization membership roles. Users must have at least one role that matches the `allowedRoles` configuration for the collection they're trying to access. Use `"*"` to allow access for any role.

Set the `MAPPING_FILE` environment variable (required). The path can be absolute or relative to the current working directory:

```bash
MAPPING_FILE=mapping.json npx @ragieai/mcp-gateway
```

Or in your `.env` file:

```bash
MAPPING_FILE=mapping.json
```

**Important:** The mapping file is loaded once at startup. If the file cannot be read or contains invalid JSON, the gateway will fail to start with an error. Changes to the mapping file require restarting the gateway to take effect.

The gateway uses strict mapping by default - only organization/collection combinations defined in the mapping file are allowed. Requests to unmapped organizations or collections will return a 404 error.

### Example: Running with Environment Variables

```bash
BASE_URL=https://gateway.example.com \
MAPPING_FILE=mapping.json \
WORKOS_API_KEY=your_workos_key \
WORKOS_AUTHORIZATION_SERVER_URL=https://api.workos.com/auth/v1 \
WORKOS_CLIENT_ID=your_client_id \
LOG_FORMAT=json \
npx @ragieai/mcp-gateway
```

## API Endpoints

### OAuth Discovery Endpoints

- `GET /.well-known/oauth-protected-resource` - Returns OAuth protected resource metadata
- `GET /.well-known/oauth-authorization-server` - Returns OAuth authorization server metadata (proxied from WorkOS)

### Protected Endpoints

- `POST /:organizationId/mcp/:collection` - Proxies requests to Ragie MCP server (requires bearer token)

### Path Rewriting

The gateway rewrites paths when proxying to the Ragie MCP server based on the mapping file:
- `POST /org_123/mcp/my-collection` → `POST /mcp/soc2/` (if `org_123`/`my-collection` maps to partition `soc2`, trailing slash added)

The gateway constructs the target URL by combining `RAGIE_BASE_URL` with the rewritten path. For example, if `RAGIE_BASE_URL` is `https://api.ragie.ai/` and the path is rewritten to `/mcp/soc2/`, the final URL will be `https://api.ragie.ai/mcp/soc2/`.

### Per-Organization/Collection API Keys

Each organization/collection combination in the mapping file must specify its own API key. This allows different organizations and collections to use different Ragie API keys:

```json
{
  "org_11111111111111111111111111": {
    "collection-name": {
      "partition": "soc2",
      "apiKey": "ragie_api_key_for_org_1_collection_1",
      "allowedRoles": ["admin"]
    },
    "another-collection": {
      "partition": "custom-partition",
      "apiKey": "ragie_api_key_for_org_1_collection_2",
      "allowedRoles": "*"
    }
  },
  "org_22222222222222222222222222": {
    "default": {
      "partition": "production",
      "apiKey": "ragie_api_key_for_org_2",
      "allowedRoles": ["admin"]
    }
  }
}
```

**Important:** All collection mappings must include an `apiKey` field. There is no default API key fallback - each organization/collection combination must have its own API key specified in the mapping file.

## Authentication Flow

1. **Client obtains JWT**: Clients authenticate with WorkOS and receive a JWT bearer token
2. **Bearer Token**: Clients include the token in the `Authorization: Bearer <token>` header
3. **Token Verification**: The gateway verifies the JWT signature using WorkOS JWKS
4. **Membership Validation**: The gateway verifies the user is an active member of the requested organization
5. **Role Validation**: The gateway validates that the user has at least one role matching the collection's `allowedRoles`
6. **Mapping Validation**: The gateway checks that the organization/collection combination exists in the mapping file
7. **Request Proxying**: Authenticated requests are proxied to the Ragie MCP server with the appropriate API key from the mapping file

## Security Features

- **JWT Verification**: All bearer tokens are cryptographically verified using WorkOS JWKS
- **Organization Membership**: Users must be active members of the organization they're accessing
- **Role-Based Access Control**: Users must have at least one role matching the collection's `allowedRoles` configuration
- **Mapping Validation**: Only organization/collection combinations defined in the mapping file are accessible
- **API Key Injection**: Ragie API key is automatically injected in proxied requests from the mapping file
- **Error Handling**: Proper HTTP status codes (401, 403, 404) and WWW-Authenticate headers for auth failures
- **Collection Isolation**: Each organization/collection combination uses its own API key and partition

## Development

### Project Structure

- **Gateway Class**: Main application logic and Express server setup
- **Configuration**: Environment-based configuration management with Zod validation
- **Logger**: Structured logging with configurable levels and formats (JSON or pretty)
- **Tests**: Comprehensive test coverage with mocked dependencies

### Available Scripts

- `npm run build` - Compile TypeScript to JavaScript
- `npm run dev` - Start development server with hot reloading
- `npm start` - Start production server (after build)
- `npm run clean` - Clean build artifacts
- `npm run typecheck` - Run typecheck
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues
- `npm run format` - Format code with Prettier
- `npm test` - Run test suite
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage report

## Integration with AI Clients

This gateway is designed to work with AI clients that support bearer token authentication. Clients should:

1. Authenticate users with WorkOS to obtain JWT tokens
2. Include bearer tokens in the `Authorization` header for all requests
3. Specify the organization ID and collection in the URL path: `POST /{organizationId}/mcp/{collection}`
4. Handle 401 responses with WWW-Authenticate headers for authentication errors
5. Handle 404 responses for unmapped organization/collection combinations
6. Discover OAuth endpoints via `/.well-known/oauth-protected-resource` if needed

### Example Request

```bash
curl -X POST \
  -H "Authorization: Bearer <workos-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{"query": "example query"}' \
  https://gateway.example.com/org_123/mcp/my-collection
```

## Multi-Tenant Architecture

The gateway supports multi-tenant access through organization and collection-based routing:

- Each organization can have multiple collections, each with its own endpoint path
- Users must be members of the organization to access its endpoints
- Each organization/collection combination maps to a specific Ragie partition
- Each organization/collection combination uses its own API key
- Only mapped organization/collection combinations are accessible (strict mapping by default)

## Deployment

The gateway can be deployed to any platform that supports Node.js:

### Docker Deployment

The project includes a production-ready Dockerfile with multi-stage builds for optimal image size and security.

#### Building the Docker Image

Build the Docker image from the project root:

```bash
docker build -t mcp-gateway .
```

You can also specify a tag with version:

```bash
docker build -t mcp-gateway:latest -t mcp-gateway:0.0.2 .
```

#### Running the Container

Run the container with required environment variables:

```bash
docker run -d \
  --name mcp-gateway \
  -p 3000:3000 \
  -e MAPPING_FILE=/app/mapping.json \
  -e WORKOS_API_KEY=your_workos_api_key_here \
  -e WORKOS_AUTHORIZATION_SERVER_URL=https://api.workos.com/auth/v1 \
  -e WORKOS_CLIENT_ID=your_workos_client_id_here \
  -v $(pwd)/mapping.json:/app/mapping.json:ro \
  mcp-gateway
```

#### Using Environment File

For easier management, you can use a `.env` file with Docker:

```bash
docker run -d \
  --name mcp-gateway \
  -p 3000:3000 \
  --env-file .env \
  mcp-gateway
```

#### Optional Configuration

Include optional environment variables as needed:

```bash
docker run -d \
  --name mcp-gateway \
  -p 3000:3000 \
  -e MAPPING_FILE=/app/mapping.json \
  -e WORKOS_API_KEY=your_workos_api_key_here \
  -e WORKOS_AUTHORIZATION_SERVER_URL=https://api.workos.com/auth/v1 \
  -e WORKOS_CLIENT_ID=your_workos_client_id_here \
  -e BASE_URL=https://gateway.example.com \
  -e PORT=3000 \
  -e LOG_LEVEL=info \
  -e LOG_FORMAT=json \
  -v $(pwd)/mapping.json:/app/mapping.json:ro \
  mcp-gateway
```

#### Docker Compose

For easier deployment, you can use Docker Compose. Create a `docker-compose.yml`:

```yaml
version: '3.8'

services:
  mcp-gateway:
    build: .
    container_name: mcp-gateway
    ports:
      - "3000:3000"
    environment:
      - MAPPING_FILE=${MAPPING_FILE:-/app/mapping.json}
      - WORKOS_API_KEY=${WORKOS_API_KEY}
      - WORKOS_AUTHORIZATION_SERVER_URL=${WORKOS_AUTHORIZATION_SERVER_URL}
      - WORKOS_CLIENT_ID=${WORKOS_CLIENT_ID}
      - BASE_URL=${BASE_URL:-http://localhost:3000}
      - PORT=3000
      - LOG_LEVEL=${LOG_LEVEL:-info}
      - LOG_FORMAT=${LOG_FORMAT:-pretty}
    volumes:
      - ./mapping.json:/app/mapping.json:ro
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/.well-known/oauth-protected-resource"]
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 5s
```

Then run:

```bash
docker-compose up -d
```

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## Support

For issues and questions, please refer to the project's issue tracker or documentation.
