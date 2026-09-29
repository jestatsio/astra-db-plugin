# Changelog

## 2.1.0 — 2026-09-29

- Brand the unofficial Astra DB plugin as **JEStats Astra DB Plugin**, with original artwork and the current jestats.io palette across manifests, documentation, CLI help, interactive views, and hosted consent.
- Prepare repository links and installer sources for `jestatsio/astra-db-plugin`, retaining the `astra-db` plugin ID, `astra-db-marketplace` marketplace ID, and `@erichare/astra-mcp` npm package.
- Prepare the MCP Registry identity `io.github.jestatsio/astra-mcp` for the transferred repository's GitHub OIDC publisher.
- Document existing Astra CLI profile reuse, make token entry optional in the Desktop bundle, and clarify that hosted OAuth still requires an Astra application token.
- Correct privacy disclosures for HTML export cleanup and optional hosted replay storage; add a full UX assessment and store submission draft.
- Show the hosted consent warning when Allow writes is selected.
- Add `login --profile` / `--astrarc`: save connection selectors without copying the CLI token, honor profile rotation without restart, and pair tokens with their Astra control-plane environment. Add `--astra-env` for manual token setup and clear missing-profile diagnostics.
- Preserve existing credential, read-only, disabled, and permission settings when reinstalling Cursor, VS Code, and Bob.
- Require working shared replay storage for hosted OAuth code/refresh grants, consume authorization codes once, reject alternate sealed-token encodings, and block private IPv4-mapped/IPv6 metadata destinations. Self-hosters must configure Redis before upgrading; existing access tokens retain their normal expiry.
- Correct delete tool idempotency hints, include vendored-content NOTICE in npm/Desktop bundles, and publish release checksums.
- Use npm staged publishing with maintainer approval and exact package/registry readback; registry failures now block GitHub release publication.

## 2.0.0 — 2026-09-24

**2.0: one first-party MCP server, one source tree for every agent, and a one-command install.** This is a breaking release; see *Upgrading from 1.x* below.

### Highlights

- **`npx -y @erichare/astra-mcp init`** configures Claude Code, Codex, Cursor, VS Code, Windsurf, Gemini CLI, Claude Desktop, and IBM Bob. `login` connects a database from a hidden prompt and writes a git-ignored `.env`, and credentials are re-read on every call, so there's no restart. `doctor` diagnoses and `uninstall` reverses. `install.sh` and `install.ps1` are thin wrappers.
- **One MCP server, `@erichare/astra-mcp`**, on MCP SDK v2, serving both the 2025 and 2026-07-28 protocols. It replaces `@datastax/astra-db-mcp` and the read-only widgets server with 18 tools:
  - connection status, databases, overview, collection and table schemas
  - `find`, and vector and hybrid search by text, vector, or "more like this", on collections and tables
  - count, distinct values, vectorize providers
  - offline `code_examples`
  - insert, update, delete, and create collection, table, and index, plus drop

  Any database is reachable through the `database` argument. Errors are structured, with hints. There are resources and prompts with completions.
- **Guarded writes.** Destructive operations are confirmed by the user, through elicitation where the client supports it, or else an explicit `confirm` after approval. There's also a read-only mode.
- **A single MCP Apps view shell** (ext-apps 2): overview, collection, table, explorer, and similarity views, with drill-downs that keep a Back history, host theming, keyboard support, and live model-context updates.
- **Hosted server:** the full tool set, writes opt-in per connection, and modernized OAuth (Client ID Metadata Documents with DNS-rebinding-safe fetching, `iss`, audience-bound tokens, rotating refresh tokens, key rotation). With an optional Redis store (Vercel KV / Upstash), refresh tokens are single-use and a replay revokes the chain. Endpoints are restricted to Astra's Data API hosts.
- **Skills everywhere.** Commands and agents became skills: `setup`, `doctor`, `data-model-review`, the `overview` / `collection` / `explore` / `similar` shortcuts, and the `reviewer`, `data-modeler`, and `migration-helper` personas. The examples read `ASTRA_DB_*` from the environment and have per-language indexes.
- **Hooks rewritten in Node.** The credential guard inspects only new content and allows a git-ignored `.env`, and a session hook adds one line of connection context.
- **Distribution:** npm (trusted publishing with provenance from the next release on), the MCP Registry, a Claude Desktop `.mcpb`, an IBM Bob zip, Smithery, and Docker. Every piece is released from one workflow.
- **Evals:** MCP-mocked `claude plugin eval` cases for vector search, filtered find, destructive confirmation, pasted tokens, and Go code.

### Fixes

- Widget drill-downs render the result's own view instead of the originating template.
- "More like this" finds documents with typed (`uuid` / `objectId`) ids.
- The overview no longer stops silently at 10 keyspaces, and a failing keyspace reports its own error.
- IBM Bob gets valid mode groups and the widgets skill.
- `$ARGUMENTS` no longer leaks into Codex skills.
- The credential hook no longer blocks the edit that removes a leaked token.
- The skill and the plugin agree on environment variable names.

### Upgrading from 1.x

- **Run `npx -y @erichare/astra-mcp init`.** It replaces `astra-widgets` and `@datastax/astra-db-mcp` entries in the configs it manages.
- **Claude Code:** update the plugin (`claude plugin marketplace update astra-db-marketplace`, then `claude plugin update astra-db`). The two servers become one, `astra-db`, so tools are now `mcp__plugin_astra-db_astra-db__*`. Token, endpoint, keyspace, and read-only are plugin settings. `/astra-db:setup`, `/astra-db:doctor`, and `/astra-db:data-model-review` keep their names. `sync-check` is gone, and the agents are now the `reviewer`, `data-modeler`, and `migration-helper` skills.
- **Tool renames:** `collection_card` → `describe_collection`, `similarity_search` → `vector_search`, `explore_collection` → `find`. `structuredContent.widget` is now `view`.
- **Codex:** the plugin moved from `codex/` to the repository root. Update the marketplace and reinstall `astra-db@astra-db-marketplace`.
- **IBM Bob:** the committed `.bob/` bundle is gone. Run `npx -y @erichare/astra-mcp init --agents bob` (add `--project` for a project bundle) or use `astra-db-bob.zip` from the release. Command and mode names are unchanged.
- **Environment:** `ASTRA_DB_APPLICATION_TOKEN` and `ASTRA_DB_API_ENDPOINT` as before, plus the optional `ASTRA_DB_KEYSPACE` and `ASTRA_DB_NAME`. `APPLICATION_TOKEN`, `API_ENDPOINT`, and the Astra CLI's `ASTRA_DB_TOKEN` are accepted as aliases.
- **`install.sh`** now forwards `init` options (`sh -s -- --agents cursor --yes`) instead of taking a target (`bob`, `claude`, `codex`, `skills-dir`).
- **Self-hosted server:** the secret is now `ASTRA_MCP_AUTH_SECRET` (`ASTRA_WIDGETS_AUTH_SECRET` is still read), and turn on Vercel's *Include files outside the root directory*. Existing connections keep working read-only; reconnect to grant writes.
- **Skill content** is vendored instead of synced weekly from upstream (see NOTICE).

## 1.2.1 — 2026-08-21

- **OAuth for the hosted server.** ChatGPT and claude.ai connectors (OAuth-only) can now use the hosted widgets: the server ships an OAuth 2.1 authorization server (protected-resource + AS discovery, dynamic client registration, PKCE `/authorize` with a "Connect Astra DB" page, `/token` with refresh) whose tokens are AES-GCM-sealed blobs carrying the user's Astra credentials — stateless, never stored. `/mcp` accepts those tokens or the raw bearer + `X-Astra-Endpoint` form; 401s advertise the resource metadata.

## 1.2.0 — 2026-08-21

- **Widgets.** New `astra-widgets` MCP server (TypeScript, bundled at `server/dist/index.js`, no npm publish) with four read-only tools — `database_overview`, `collection_card`, `similarity_search`, `explore_collection` — each returning `structuredContent` plus an MCP Apps UI resource (`ui://astra-widgets/*`): collection card, similarity results (ranked bars + constellation map), collection explorer (filters, paging, click-to-drill), and database overview. `emit: "html_file"` writes a self-contained page for harnesses without inline rendering.
- New `astra-widgets` skill with a design spec and Claude Code desktop widget templates; new commands `/astra-db:overview`, `/astra-db:collection`, `/astra-db:similar`, `/astra-db:explore` (ported to Codex as `$astra-*` skills and to Bob as `/astra-*` commands). The server ships in every layout (`codex/server`, `.bob/server`) and in all three MCP configs; `install.sh bob` installs it too.
- Hosted entrypoint for ChatGPT at `https://astra-widgets-mcp.vercel.app/mcp` (`server/api/mcp.ts`, streamable HTTP, bearer = Astra token, endpoint via `X-Astra-Endpoint` header or `?endpoint=`).
- CI builds and tests the server (vitest) and parity-checks the committed bundle.

## 1.1.0 — 2026-08-21

- **Feature parity across harnesses.** IBM Bob now gets the full bundle: `/astra-setup`, `/astra-doctor`, `/astra-data-model-review` slash commands, three custom modes (`astra-reviewer`, `astra-data-modeler`, `astra-migration-helper`) in `.bob/custom_modes.yaml`, the Astra DB MCP server in `.bob/mcp.json`, and a credential-hygiene rule. OpenAI Codex / ChatGPT gets the same commands and agents as `$astra-*` skills.
- Codex installs headlessly: `codex plugin marketplace add erichare/astra-db-plugin && codex plugin add astra-db@astra-db-marketplace` (also `install.sh codex-plugin`). The Codex plugin root is now the self-contained `codex/` directory.
- `install.sh bob` installs the whole Bob bundle and merges safely with existing `.bob/` config; new `--global` flag targets `~/.bob/`.
- Credential-guard hook now also matches Codex's `apply_patch` tool; SessionStart hook gains a status message.
- Releases pick the semver level from the conventional commit (`feat` → minor).

## 1.0.2 — 2026-08-21

- Content sync / maintenance release.

## 1.0.1 — 2026-08-21

- Content sync / maintenance release.

## 1.0.0 — 2026-08-20

- Initial release: astra-toolkit skill (synced from sl-at-ibm/astra-toolkit-skill), three commands (`setup`, `data-model-review`, `sync-check`), three agents (`astra-reviewer`, `astra-data-modeler`, `astra-migration-helper`), credential-guard and freshness hooks, bundled Astra DB MCP server, and layouts for Claude Code, Agent Skills harnesses (Codex), and IBM Bob.
