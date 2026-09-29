# Hosted server

This is the unofficial JEStats Astra DB Plugin. It is not affiliated with or endorsed by DataStax or IBM. Its OAuth flow authorizes a connection to this plugin using your Astra application token; it does not offer Astra account login or remove Astra's token requirement.

The same server runs as a streamable-HTTP endpoint for clients that can't launch a local process, such as ChatGPT and claude.ai:

```
https://astra-widgets-mcp.vercel.app/mcp
```

It has the full tool set with interactive MCP Apps views. Writes are off unless you grant them for that connection. Credentials are carried in each request, either inside an encrypted OAuth token or in headers. OAuth requires a shared Redis replay store, which retains code/token fingerprints, token-family identifiers, and expiry/revocation state without storing your Astra token.

## Connect with OAuth

- **ChatGPT:** turn on developer mode (*Settings → Security and login*), add a custom connector under *Plugins (Connectors) → +*, paste the URL above, and choose **OAuth**.
- **claude.ai and Claude Desktop:** *Settings → Connectors → Add custom connector*, then paste the URL.

Menu names move around; any client that supports remote MCP servers with OAuth works the same way.

The client registers itself and opens a **Connect Astra DB** page:

| Field | |
| --- | --- |
| Application token | Required. Entered on this page, never in the chat |
| Data API endpoint | Optional when the token sees exactly one active database. Must be an Astra endpoint (`https://<database-id>-<region>.apps.astra.datastax.com`) |
| Keyspace | Optional |
| **Allow writes** | Off by default. When ticked, the connection gets the `astra:write` scope and the insert, update, delete, and schema tools appear. Destructive operations still ask for confirmation |

To change the grant later, disconnect and connect again.

## Connect with headers

For scripts, `curl`, or clients that only send static headers:

```
Authorization: Bearer <ASTRA_DB_APPLICATION_TOKEN>
X-Astra-Endpoint: https://<db-id>-<region>.apps.astra.datastax.com   (or ?endpoint=…; Astra hosts only)
X-Astra-Keyspace: <keyspace>                                           (optional, or ?keyspace=…)
X-Astra-Allow-Writes: true                                             (optional; writes are off without it)
```

Claude Desktop through `mcp-remote`:

```json
{
  "mcpServers": {
    "astra-db": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://astra-widgets-mcp.vercel.app/mcp",
               "--header", "Authorization: Bearer ${ASTRA_DB_APPLICATION_TOKEN}",
               "--header", "X-Astra-Endpoint: ${ASTRA_DB_API_ENDPOINT}"],
      "env": { "ASTRA_DB_APPLICATION_TOKEN": "…", "ASTRA_DB_API_ENDPOINT": "…" }
    }
  }
}
```

Running the server locally (`npx -y @erichare/astra-mcp`) is simpler for Claude Desktop, though.

## How the OAuth server works

- **Discovery.** `/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server`. A 401 from `/mcp` carries `WWW-Authenticate` with the resource-metadata URL, and CORS exposes that header to browser clients.
- **Client registration.** Client ID Metadata Documents (an `https` `client_id` URL, fetched with a 5-second timeout, 64 KB cap, no redirects, private addresses refused on the address actually connected to (so DNS rebinding can't slip past), and cached for 5 minutes; `redirect_uri` must match exactly) and dynamic client registration at `/register`.
- **Authorization.** Authorization code with PKCE (S256 only). Every redirect carries `iss`. Codes live 10 minutes and are bound to the client, redirect URI, resource, and scope. A code works once, including when simultaneous exchanges reach different server instances. Failed PKCE or binding checks do not consume it.
- **Tokens.** Access tokens live 1 hour. Refresh tokens rotate on every use, work once, and live 30 days from the last refresh, and at most 90 days from the original consent.
- **Scopes.** `astra:read` always; `astra:write` only when *Allow writes* was ticked.
- **Format.** Tokens are AES-256-GCM sealed blobs (`aw2.<key id>.…`), keyed by HKDF-SHA256 from the server secret. They hold the Astra credentials and the grant (client, audience, scopes), and an access token is accepted only by the resource it was issued for. Tokens from the 1.x widgets server (`aw1.…`) keep working, read-only.

**Replay protection.** Configure a shared Redis REST store (Vercel KV / Upstash for Redis: `KV_REST_API_URL` and `KV_REST_API_TOKEN`, or `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`). Authorization codes and refresh tokens are consumed atomically with `SET NX EX`; only fingerprints and expiry state are stored. A second code exchange returns `invalid_grant`. Presenting a used refresh token revokes that whole chain of rotations, so both the thief and the user must reconnect. If storage is missing, misconfigured, or unreachable, code exchanges and refreshes fail with a retryable 503; the server does not skip replay checks. Access tokens already issued stay valid for their remaining hour, and header authentication remains available.

Use a complete URL/token pair from one provider; pairs are never combined. Storage URLs must use HTTPS without embedded credentials. If any `KV_REST_API_*` setting is present, that pair takes precedence and must be complete. Missing storage leaves discovery available, but cannot issue or refresh an OAuth connection. A lost response after a successful code claim may require reconnecting because the code remains consumed.

To cut off every outstanding token, rotate the server secret. To cut off one user, revoke their Astra token in the Astra console; every hosted token carries it, so all of them stop working.

**Endpoints.** The server only calls Astra's own Data API hosts (`*.apps.astra.datastax.com`, plus the `-dev` and `-test` variants) with a request's credentials. Other endpoint URLs are refused, so the deployment can't be used to reach arbitrary hosts.

## Self-hosting on Vercel

The Vercel project's root directory is `server/`.

1. Set `ASTRA_MCP_AUTH_SECRET` to a long random value (`openssl rand -base64 48`). The 1.x name `ASTRA_WIDGETS_AUTH_SECRET` is still read.
2. In *Settings → Build and Deployment*, turn on **Include files outside the root directory**. The build bundles `../skills` so the `code_examples` tool works; without it, that one tool is left out.
3. Add a shared Redis store (*Storage → Upstash for Redis*, or any Redis REST endpoint) for [replay protection](#how-the-oauth-server-works). It is required for OAuth. Set one complete URL/token environment-variable pair, and verify successful code exchange, refresh rotation, and rejected replay on the deployed service.
4. Deploy with `vercel --prod` from `server/`, or connect the repository.

To rotate the secret, move the current value to `ASTRA_MCP_AUTH_SECRET_PREVIOUS`, set a new `ASTRA_MCP_AUTH_SECRET`, and redeploy. Tokens sealed with either key are accepted; remove the previous one after 90 days.

Routes (see `server/vercel.json`): `/mcp`, `/authorize`, `/token`, `/register`, and the two `/.well-known/` documents. `api/mcp.ts` and `api/oauth.ts` are thin wrappers around `src/http/`.

## Differences from the local server

- Credentials come only from the request. No `.env`, profile, or Astra CLI lookup, and `connection_status` reports the source as `request`.
- There's no `emit: "html_file"`; views render inline.
- The server instructions tell the model never to ask for tokens in the chat, since the connection already has one.
