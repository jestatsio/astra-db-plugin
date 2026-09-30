# JEStats Astra DB Plugin · @erichare/astra-mcp

Unofficial, community-maintained Astra DB integration by [JEStats](https://jestats.io), not affiliated with or endorsed by DataStax or IBM. An MCP server with live data tools, guarded writes, vector and hybrid search, interactive [MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview) views, and about 1,660 bundled Data API examples. It also includes a one-command installer for Claude Code, Codex, Cursor, VS Code, Windsurf, Gemini CLI, Claude Desktop, and IBM Bob.

```bash
npx -y @erichare/astra-mcp init
```

`init` detects your agents and configures each one. Its `login` step then asks for an Astra application token with hidden input, lets you pick a database, and writes `ASTRA_DB_*` variables to a git-ignored `.env`. There's no restart: the server re-reads credentials on every call. Requires Node.js 20+.

Already configured the Astra CLI? Use `init --no-login` to reuse your `.astrarc` profile directly, followed by `doctor`. Set `ASTRA_PROFILE` for a named profile and `ASTRA_DB_NAME` or `ASTRA_DB_API_ENDPOINT` when multiple databases are accessible. This avoids copying the CLI token into a second file. The npm package name stays unchanged for compatibility.

## Commands

| | |
| --- | --- |
| `astra-mcp` | Serve MCP over stdio (the default when stdin isn't a terminal) |
| `astra-mcp init` | Configure agents: `--agents a,b`, `--project`, `--dry-run`, `--yes`, `--no-login` |
| `astra-mcp login` | Connect a database: `--global`, `--database`, `--keyspace`, `--endpoint`, `--token-stdin` |
| `astra-mcp doctor` | Check credentials, connectivity, `.env` hygiene, and agent setup (`--json`) |
| `astra-mcp uninstall` | Undo `init` |
| `astra-mcp serve --read-only` | Serve without the write tools |
| `astra-mcp bob-bundle --out <zip>` | Build the IBM Bob bundle |

## As an MCP server

```json
{ "mcpServers": { "astra-db": { "command": "npx", "args": ["-y", "@erichare/astra-mcp@2"] } } }
```

The 18 tools:

- **Connect:** `connection_status`, `list_databases`
- **Explore:** `database_overview`, `describe_collection`, `describe_table`, `list_vectorize_providers`
- **Query:** `find`, `vector_search`, `count`, `distinct_values`
- **Build:** `code_examples`
- **Change:** `insert`, `update`, `delete`, `create_collection`, `create_table`, `create_index`, `drop`

Destructive operations need the user's confirmation, through elicitation or an explicit `confirm` argument after the user approves. Credentials come from the environment, then the project's `.env`, host settings, `login --global`, and the Astra CLI's `~/.astrarc`.

The package bundles everything into one file with no runtime dependencies. Releases after 2.0.0 are published from GitHub Actions with npm provenance.

Documentation, the Claude Code and Codex plugin, and the hosted OAuth endpoint for ChatGPT and claude.ai: **[github.com/jestatsio/astra-db-plugin](https://github.com/jestatsio/astra-db-plugin)**.

Apache-2.0. Includes documentation-derived examples vendored from [sl-at-ibm/astra-toolkit-skill](https://github.com/sl-at-ibm/astra-toolkit-skill); see NOTICE in the repository. Community project, not an official DataStax or IBM product.
