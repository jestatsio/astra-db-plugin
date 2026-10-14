# Connect your agent to Astra DB

You need **Node.js 20+**, a current Claude Code or Codex client, and access to an Astra database. The plugin is an unofficial integration maintained by JEStats.

## 1. Install the plugin

=== "Claude Code"

    ```bash
    claude plugin marketplace add jestatsio/astra-db-plugin
    claude plugin install astra-db@astra-db-marketplace
    ```

=== "Codex"

    ```bash
    codex plugin marketplace add jestatsio/astra-db-plugin
    codex plugin add astra-db@astra-db-marketplace
    ```

    In the Codex app, add the same repository marketplace and choose **JEStats Astra DB Plugin**.

=== "Guided setup"

    ```bash
    npx -y @erichare/astra-mcp init
    ```

    Setup detects your agents and offers the native plugins or their MCP configuration. Use `--dry-run` to preview the changes. Keep one installation per client to avoid duplicate tools.

Restart your agent after installation so its tools and skills load.

## 2. Connect privately

From the project you want to use:

```bash
npx -y @erichare/astra-mcp login
```

The terminal prompts for your application token with hidden input, then lets you choose a database and keyspace. It saves project credentials in `.env` with restricted permissions and offers to ignore the file in Git. **Do not paste tokens into chat or commit them.**

Already using the Astra CLI? Select an existing profile:

```bash
npx -y @erichare/astra-mcp login --profile analytics
```

The token stays in your CLI profile. See [credential precedence and configuration](https://github.com/jestatsio/astra-db-plugin/blob/main/docs/configuration.md) if several profiles or projects are in use.

## 3. Verify the connection

```bash
npx -y @erichare/astra-mcp doctor
```

Then ask your agent:

> Show me the databases I can access, then describe one collection's schema. Do not change any data.

A successful connection returns live metadata from your database. A text result is expected in clients that do not render MCP Apps; interactive views depend on host support.

## Claude Desktop and other clients

[Release downloads](https://github.com/jestatsio/astra-db-plugin/releases) include a Claude Desktop `.mcpb` and checksums. Guided `init` also configures supported MCP clients. [Hosted setup](https://github.com/jestatsio/astra-db-plugin/blob/main/docs/hosted.md) uses a separate HTTP/OAuth connection; installing the local plugin does not establish a hosted directory listing.

## Update or remove

Refresh the repository marketplace and install the offered plugin update in your client. Reopen the client afterward. For guided MCP registrations, use `npx -y @erichare/astra-mcp uninstall` and review its proposed changes. Remove a native plugin through that client's plugin controls. Credentials and database data are separate from the plugin cache.

[Next: explore a workflow](workflows.md){ .md-button .md-button--primary }
