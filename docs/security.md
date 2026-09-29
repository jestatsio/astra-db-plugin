# Security model

An agent with database tools can read and change real data, and a careless one can leak credentials. These are the safeguards, from the tools outward. To report a vulnerability, see [SECURITY.md](../SECURITY.md).

## Writes and destructive operations

| Operation | Behavior |
| --- | --- |
| Reads (`find`, `vector_search`, `describe_*`, …) | Annotated `readOnlyHint`; hosts may auto-approve them |
| `insert`, `create_collection`, `create_table`, `create_index` | Run normally. Additive, annotated `destructiveHint: false`; schema creation is idempotent |
| `update` or `delete` on one document or row | Run normally, annotated `destructiveHint: true` so hosts ask for permission as usual |
| `update` / `delete` with `many`, or with an empty filter | Need the user's confirmation |
| `drop` (collection, table, index) | Always needs the user's confirmation; also marked `anthropic/requiresUserInteraction` |

Confirmation happens in the server, not only in the prompt. If the client supports elicitation, the user is asked directly and shown the impact ("Drops collection `default_keyspace.articles` (~12,400 documents)"). Otherwise the tool refuses with `confirmation_required`, and the agent can proceed only by passing `confirm` equal to the target's name. The tool descriptions and server instructions tell the model that it may set `confirm` only after the user approved the stated impact in a later message; the original request doesn't count. The [`destructive-confirmation` eval](../evals/destructive-confirmation/prompt.md) checks that it doesn't self-confirm.

**Read-only mode** (`ASTRA_MCP_READ_ONLY=1`, `serve --read-only`, or the plugin's *Read-only* setting) doesn't register the write tools at all, and each write handler checks again. For a hard guarantee, use a token whose Astra role is read-only: the server can't do more than the token allows.

## Credentials

- **Never through the chat.** `login` reads the token with hidden input in your own terminal. When credentials are missing, tools return `not_configured` with a hint that sends the agent to `login`, and the server instructions forbid asking for tokens. If you paste one anyway, the agent is told not to use it and to suggest rotating it (the [`setup-token-in-chat` eval](../evals/setup-token-in-chat/prompt.md) covers this).
- **Files.** `login` writes `.env` or the profile file with mode 0600, and offers to git-ignore `.env`. `doctor` reports an `.env` that isn't ignored and scans git-tracked files for committed `AstraCS:` tokens.
- **Output.** Tokens appear masked (`AstraCS:…cdef`) in `connection_status`, `doctor`, and hook messages. Error messages from Astra are sanitized before they reach the model.
- **No persistence in the server.** The local server keeps a token only in memory, for the connection cache.

**Where tokens go.** The token is only ever sent to the configured endpoint, to endpoints the DevOps API returns for the user's own databases, or to Astra Data API hosts (`https://<database-id>-<region>.apps.astra.datastax.com`) named in a tool's `database` argument. Any other URL in that argument is refused, so a prompt can't redirect authenticated requests to a host it controls.

## The credential guard hook

In Claude Code, Codex, and IBM Bob, a `PreToolUse` hook inspects only the *new* content an agent is about to write: `Write` and `Edit` bodies, notebook cells, the added lines of `apply_patch`, and shell commands that write files (`>`, `tee`, heredocs). It looks for a real-shaped `AstraCS:` token.

| Destination | Decision |
| --- | --- |
| A git-ignored `.env` or `.env.*` file | Allowed |
| An `.env` that git doesn't ignore | Ask in Claude Code; deny in Codex (its hooks treat *ask* as allow) and in Bob |
| `.env.example`, `.sample`, `.template`, `.dist` | Denied |
| Any other file | Denied, with a pointer to `ASTRA_DB_APPLICATION_TOKEN` and `login` |

Deleting or replacing a leaked token is never blocked, because the text being removed isn't inspected. Placeholders such as `AstraCS:your-token-here` pass. The hook is a safety net for honest mistakes, not a sandbox: an agent determined to exfiltrate data has other ways, so grant tools accordingly.

## Hosted server

- Writes are opt-in per connection: the *Allow writes* box on the OAuth consent page (scope `astra:write`), or `X-Astra-Allow-Writes: true` with raw bearer credentials. Without either, write tools aren't registered for that request.
- OAuth follows the current MCP authorization spec: PKCE S256 only, `iss` on every redirect, audience-bound tokens, 1-hour access tokens, and rotating refresh tokens (30 days sliding, 90 days maximum). Client ID Metadata Documents are fetched with SSRF protections (https only, no redirects, private addresses refused on the connected address, size and time limits). Request-supplied endpoints must be Astra's own hosts.
- Tokens are sealed with AES-256-GCM under a key derived from the deployment secret. OAuth code and refresh grants require a shared Redis store: codes are single-use, and refresh-token replay revokes the chain. Missing or unavailable storage fails with a retryable 503. Already issued access tokens remain valid until expiry; revoke the upstream Astra token or rotate the deployment secret to cut off access. Details in [hosted.md](hosted.md).

## Supply chain

- `@erichare/astra-mcp` ships as a single bundled file with no runtime dependencies. Releases after 2.0.0 are published from GitHub Actions with npm trusted publishing and provenance, which `npm audit signatures` verifies. 2.0.0, the package's first version, was published by the maintainer with 2FA, because npm only enables trusted publishing once a package exists.
- The Claude Code and Codex plugins pin the exact server version they were released with.
- The Claude Desktop bundle (`.mcpb`) and the IBM Bob zip are built in the same release workflow and attached to the GitHub Release.
