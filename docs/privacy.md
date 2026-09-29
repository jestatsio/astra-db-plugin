# Privacy

*Last updated: 2026-09-29*

JEStats Astra DB Plugin (the `astra-db` plugin and the `@erichare/astra-mcp` server) is an unofficial, community-maintained integration by [JEStats](https://jestats.io). It is not affiliated with or endorsed by DataStax or IBM. It collects no analytics or telemetry.

## Local server (npm, plugins, Claude Desktop bundle)

The server runs on your machine and talks only to:

- **Your Astra DB databases** through the Data API, and to the Astra **DevOps API** (`api.astra.datastax.com`) to list databases, keyspaces, and providers. Requests carry your token and a `User-Agent` naming `astra-mcp` and its version, like any DataStax client.
- **npm**, when your agent launches it with `npx`, to download the package.

Data returned by the tools goes to your agent, and from there to whichever model provider your agent uses, under that provider's terms. Only what a tool returns is shared, and you choose what to ask for.

Files it writes, all on your machine:

- `.env` in your project, or `~/.config/astra-mcp/credentials.json` (`%APPDATA%\astra-mcp\` on Windows), by `login`, with mode 0600. CLI-profile login stores connection/profile metadata and leaves the token in your CLI configuration
- agent configuration files, by `init`, with a `.bak-astra` backup of each file it changes
- HTML views, only when you ask for one (`emit: "html_file"`), in your temp directory with mode 0600. Exports older than 24 hours are cleaned up when another export is created; without a later export, files can remain until you or the operating system remove them

`code_examples` searches examples bundled in the package and makes no network requests.

## Hosted server (`astra-widgets-mcp.vercel.app`)

- **Connection credentials.** Your Astra token, endpoint, and keyspace travel inside an OAuth token encrypted with a key only the deployment holds, or in the headers you send, and are used only to call Astra DB for that request. They are not stored in a server-side credential database. OAuth token grants require a Redis replay store, which retains authorization-code fingerprints, token-family identifiers, and expiry/revocation state; it does not store your Astra token or database contents.
- **Logs.** The hosting platform (Vercel) records standard request metadata such as time, path, status, and IP address, under [Vercel's privacy policy](https://vercel.com/legal/privacy-policy). The server doesn't log request bodies, tool results, or credentials.
- **OAuth clients.** When a client identifies itself with a metadata URL, the server fetches that public document to check the redirect URI, and caches it briefly in memory.

## Your controls

- Revoke access at any time by deleting the Astra token in the Astra console; every local and hosted credential derived from it stops working.
- `npx -y @erichare/astra-mcp uninstall` removes the agent configuration. Delete `.env` or the credentials file to remove stored credentials.

Questions: open an issue at [github.com/jestatsio/astra-db-plugin](https://github.com/jestatsio/astra-db-plugin/issues).
