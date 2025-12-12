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
- PostgreSQL database with collections table
- WorkOS account and application setup
- Ragie API keys for your organizations/collections (stored encrypted in database)

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

- `DATABASE_URL`: PostgreSQL connection URL for the collections database
- `ENCRYPTION_KEY`: Encryption key for decrypting API keys stored in database (min 32 characters)
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
# Required: Database connection
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/mcp-gateway

# Required: Encryption key for API keys (min 32 characters)
ENCRYPTION_KEY=your-encryption-key-at-least-32-characters

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

### Collections Database

The gateway reads collection configurations from a PostgreSQL database. Each collection record includes:

- `name`: The collection identifier used in the URL path
- `organization_id`: The WorkOS organization ID
- `partition`: The Ragie partition name to route to
- `ragie_api_key`: The encrypted Ragie API key for this collection
- `allowed_roles`: Array of role names (e.g., `["admin", "member"]`) or `"*"` to allow all roles

**Role-Based Access Control:** The gateway enforces role-based access control using WorkOS organization membership roles. Users must have at least one role that matches the `allowedRoles` configuration for the collection they're trying to access. Use `"*"` to allow access for any role.

**API Key Encryption:** API keys are stored encrypted in the database using AES-256-GCM. The `ENCRYPTION_KEY` environment variable must match the key used to encrypt the API keys (typically by the manager application).

The gateway only allows access to organization/collection combinations that exist in the database. Requests to non-existent collections will return a 404 error.

### Example: Running with Environment Variables

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/mcp-gateway \
ENCRYPTION_KEY=your-encryption-key-at-least-32-characters \
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

The gateway rewrites paths when proxying to the Ragie MCP server based on the collection's partition:
- `POST /org_123/mcp/my-collection` → `POST /mcp/soc2/` (if the collection maps to partition `soc2`, trailing slash added)

The gateway constructs the target URL by combining `RAGIE_BASE_URL` with the rewritten path. For example, if `RAGIE_BASE_URL` is `https://api.ragie.ai/` and the path is rewritten to `/mcp/soc2/`, the final URL will be `https://api.ragie.ai/mcp/soc2/`.

### Per-Collection API Keys

Each collection in the database has its own encrypted API key. This allows different organizations and collections to use different Ragie API keys. The gateway automatically decrypts and uses the appropriate API key when proxying requests.

## Authentication Flow

1. **Client obtains JWT**: Clients authenticate with WorkOS and receive a JWT bearer token
2. **Bearer Token**: Clients include the token in the `Authorization: Bearer <token>` header
3. **Token Verification**: The gateway verifies the JWT signature using WorkOS JWKS
4. **Membership Validation**: The gateway verifies the user is an active member of the requested organization
5. **Role Validation**: The gateway validates that the user has at least one role matching the collection's `allowedRoles`
6. **Collection Validation**: The gateway checks that the organization/collection combination exists in the database
7. **Request Proxying**: Authenticated requests are proxied to the Ragie MCP server with the decrypted API key from the database

## Security Features

- **JWT Verification**: All bearer tokens are cryptographically verified using WorkOS JWKS
- **Organization Membership**: Users must be active members of the organization they're accessing
- **Role-Based Access Control**: Users must have at least one role matching the collection's `allowedRoles` configuration
- **Collection Validation**: Only organization/collection combinations that exist in the database are accessible
- **Encrypted API Keys**: Ragie API keys are stored encrypted (AES-256-GCM) and decrypted only when needed
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
- Each collection maps to a specific Ragie partition
- Each collection uses its own encrypted API key
- Only collections that exist in the database are accessible

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
  -e DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:5432/mcp-gateway \
  -e ENCRYPTION_KEY=your-encryption-key-at-least-32-characters \
  -e WORKOS_API_KEY=your_workos_api_key_here \
  -e WORKOS_AUTHORIZATION_SERVER_URL=https://api.workos.com/auth/v1 \
  -e WORKOS_CLIENT_ID=your_workos_client_id_here \
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
  -e DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:5432/mcp-gateway \
  -e ENCRYPTION_KEY=your-encryption-key-at-least-32-characters \
  -e WORKOS_API_KEY=your_workos_api_key_here \
  -e WORKOS_AUTHORIZATION_SERVER_URL=https://api.workos.com/auth/v1 \
  -e WORKOS_CLIENT_ID=your_workos_client_id_here \
  -e BASE_URL=https://gateway.example.com \
  -e PORT=3000 \
  -e LOG_LEVEL=info \
  -e LOG_FORMAT=json \
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
      - DATABASE_URL=${DATABASE_URL}
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
      - WORKOS_API_KEY=${WORKOS_API_KEY}
      - WORKOS_AUTHORIZATION_SERVER_URL=${WORKOS_AUTHORIZATION_SERVER_URL}
      - WORKOS_CLIENT_ID=${WORKOS_CLIENT_ID}
      - BASE_URL=${BASE_URL:-http://localhost:3000}
      - PORT=3000
      - LOG_LEVEL=${LOG_LEVEL:-info}
      - LOG_FORMAT=${LOG_FORMAT:-pretty}
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
