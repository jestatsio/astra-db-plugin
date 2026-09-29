# Configuration

The server always starts, even with nothing configured: tools return `not_configured` with a hint instead of the server failing to launch. Credentials are resolved on every call, and files are re-read when they change, so a `login` in another terminal takes effect without restarting your agent.

## The quick way

```bash
npx -y @erichare/astra-mcp login            # this project: ./.env
npx -y @erichare/astra-mcp login --global   # every project: your user profile
```

`login` asks for an application token with hidden input (or reuses one it already finds), lists your databases and keyspaces, verifies the connection, and writes the result. A token scoped to a single database can't list databases, so `login` asks for that database's endpoint instead.

To keep credentials in an existing Astra CLI profile:

```bash
npx -y @erichare/astra-mcp login --profile analytics
npx -y @erichare/astra-mcp login --profile analytics --astrarc /path/to/.astrarc --global
```

Profile login saves only `ASTRA_PROFILE`, `ASTRARC`, endpoint, and keyspace in the project (or `profile`/`astrarc` metadata in the user file). It removes stored token aliases in that destination; the CLI profile remains the credential source. A missing explicitly selected profile or file produces an actionable error. Other login routes save the token privately as before. Setup warns if higher-priority settings override the saved profile.

| Option | |
| --- | --- |
| `--global` | Save to your user profile instead of `./.env` |
| `--dir <path>` | Write `.env` in another project directory |
| `--database <name or id>` | Pick this database without prompting |
| `--keyspace <name>` | Use this keyspace |
| `--endpoint <url>` | Use this Data API endpoint (database-scoped tokens) |
| `--profile <name>` | Use this existing Astra CLI profile without copying its token |
| `--astrarc <path>` | Use this Astra CLI configuration file |
| `--astra-env <prod\|dev\|test>` | Control-plane environment for manually entered/stdin tokens; CLI profiles use their own `ASTRA_ENV` |
| `--token-stdin` | Read the token from stdin, for CI: `printf %s "$TOKEN" \| npx -y @erichare/astra-mcp login --token-stdin --database demo-db` |

Create tokens in the [Astra console](https://astra.datastax.com) under **Settings → Tokens**. *Database Administrator* covers every tool; a read-only role is enough to explore.

## Resolution order

Token, endpoint, keyspace, and database hint are resolved independently. Each takes the first source that has it, so you can keep a token in your profile and pin the endpoint per project.

| # | Source | Where |
| - | --- | --- |
| 1 | Environment of the server process | `ASTRA_DB_APPLICATION_TOKEN`, `ASTRA_DB_API_ENDPOINT`, `ASTRA_DB_KEYSPACE`, `ASTRA_DB_NAME` (aliases below) |
| 2 | Project dotenv files | `.env.local`, then `.env`, in the project directory and each parent up to the git root |
| 3 | Host settings | Claude Code plugin settings and Claude Desktop bundle settings, passed as `ASTRA_MCP_CONFIG_*` |
| 4 | Your user profile | `~/.config/astra-mcp/credentials.json` (`$XDG_CONFIG_HOME` honored; `%APPDATA%\astra-mcp\credentials.json` on Windows) |
| 5 | Astra CLI profile | `$ASTRARC`, or `$XDG_CONFIG_HOME/astra/.astrarc` then `~/.astrarc`; section `ASTRA_PROFILE` (default `default`); token and matching control-plane environment |
| 6 | DevOps lookup | With a token but no endpoint: the database named by `ASTRA_DB_NAME` / `ASTRA_DB_ID`, or your only active database |

If several databases are active and none is named, tools return `ambiguous_database`. Pass `database` to the tool, set `ASTRA_DB_NAME`, or pin one with `login`.

Empty values, and unexpanded templates such as a literal `${user_config.token}`, count as unset.

Profile/config selectors may also be saved in project dotenv or the global user file. A higher-priority token takes precedence over a lower-priority profile selector. The control-plane `ASTRA_ENV` comes from the selected credential source; an unrelated CLI profile cannot redirect a shell or project token to another Astra environment. Changes to profile selectors and CLI tokens are picked up without restarting.

### Variable names

| Value | Accepted names (first wins) |
| --- | --- |
| Token | `ASTRA_DB_APPLICATION_TOKEN`, `ASTRA_DB_TOKEN` (what `astra db create-dotenv` writes), `APPLICATION_TOKEN` |
| Endpoint | `ASTRA_DB_API_ENDPOINT`, `API_ENDPOINT` |
| Keyspace | `ASTRA_DB_KEYSPACE`, `ASTRA_DB_NAMESPACE` |
| Database hint | `ASTRA_DB_NAME`, `ASTRA_DB_ID` |

Your application code should read the same `ASTRA_DB_*` names; every snippet in the `astra-toolkit` skill does. See [`.env.example`](../.env.example).

### Which directory is "the project"

The dotenv search starts at `ASTRA_MCP_PROJECT_DIR`, then `CLAUDE_PROJECT_DIR` (set by Claude Code), then the server's working directory. It walks up at most eight levels, stops at the git root, and never goes above your home directory. VS Code entries written by `init` set `ASTRA_MCP_PROJECT_DIR` to `${workspaceFolder}`. For agents that start MCP servers outside your project, such as Claude Desktop, use `login --global` or set the variables in the server entry.

## Other settings

| Variable | |
| --- | --- |
| `ASTRA_MCP_READ_ONLY=1` | Hide every write tool (also `serve --read-only`, or the plugin's *Read-only* setting) |
| `ASTRA_DB_ENVIRONMENT` | `hcd`, `dse`, `cassandra`, or `other` for a self-managed Data API; default `astra` |
| `ASTRA_ENV` | Astra control-plane environment (`prod`, `dev`, `test`); defaults to `prod` for manually configured tokens |
| `ASTRA_PROFILE` / `ASTRARC` | Named Astra CLI profile / explicit configuration path |
| `ASTRA_MCP_CREDENTIALS_FILE` | Use a different user-profile file |
| `ASTRA_MCP_PROJECT_DIR` | Where the dotenv search starts |
| `ASTRA_MCP_CLIENT` | Which host launched the server (informational; `init` sets it) |
| `ASTRA_MCP_DEVOPS_URL` | Override the DevOps API base URL (testing) |
| `ASTRA_MCP_ASSETS` | Path to an alternative `assets.json` (bundled skills and examples) |

The hosted server has its own settings; see [hosted.md](hosted.md).

## Configuring agents by hand

`npx -y @erichare/astra-mcp init` writes all of these for you, and `--dry-run` shows exactly what it would change. By hand, the server entry is:

Reinstalling keeps existing credentials, read-only mode, custom environment variables, and permission choices while updating the managed server launcher.

```json
{
  "mcpServers": {
    "astra-db": {
      "command": "npx",
      "args": ["-y", "@erichare/astra-mcp@2"]
    }
  }
}
```

| Agent | File | Notes |
| --- | --- | --- |
| Cursor | `~/.cursor/mcp.json` or `.cursor/mcp.json` | `mcpServers` |
| VS Code | user `mcp.json` or `.vscode/mcp.json` | Key is `servers`, and each entry needs `"type": "stdio"`; add `"env": {"ASTRA_MCP_PROJECT_DIR": "${workspaceFolder}"}` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` | `mcpServers` |
| Gemini CLI | `~/.gemini/settings.json` or `.gemini/settings.json` | `mcpServers` |
| Claude Desktop | `claude_desktop_config.json` | `mcpServers`; or install the `.mcpb` bundle from Releases, which asks for the settings in a form |
| Codex (no plugin support) | `~/.codex/config.toml` | `codex mcp add astra-db -- npx -y @erichare/astra-mcp@2` |

On Windows, use `"command": "cmd", "args": ["/c", "npx", "-y", "@erichare/astra-mcp@2"]`.

To pass credentials to one entry, add an `env` block with the `ASTRA_DB_*` variables. Keep that file out of version control: a git-ignored `.env` or `login --global` is usually the better place.

## Versions

`@erichare/astra-mcp@2` follows the latest 2.x release. The Claude Code and Codex plugins pin the exact server version they were released with, so an update to the plugin updates the server.
