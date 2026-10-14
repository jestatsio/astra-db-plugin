# Reference and support

## Technical guides

| Guide | What it covers |
| --- | --- |
| [Tools](https://github.com/jestatsio/astra-db-plugin/blob/main/docs/tools.md) | Arguments, outputs, resources, prompts, and error codes |
| [Configuration](https://github.com/jestatsio/astra-db-plugin/blob/main/docs/configuration.md) | Credential precedence, profiles, project settings, and read-only mode |
| [Troubleshooting](https://github.com/jestatsio/astra-db-plugin/blob/main/docs/troubleshooting.md) | Connection, permission, and client problems |
| [Hosted connection](https://github.com/jestatsio/astra-db-plugin/blob/main/docs/hosted.md) | HTTP transport, OAuth, and self-hosting |
| [IBM Bob](https://github.com/jestatsio/astra-db-plugin/blob/main/docs/bob.md) | Bundle installation and supported workflows |
| [Security](https://github.com/jestatsio/astra-db-plugin/blob/main/docs/security.md) | Confirmation, credential handling, and access boundaries |

These guides live with the source so implementation and reference changes can be reviewed together.

## Something is not working

1. Run `npx -y @erichare/astra-mcp doctor` in the affected project.
2. Check which credential source and database are selected. Never include tokens in a report.
3. Confirm the plugin and MCP server are enabled, and restart the agent after installation changes.
4. [Open an issue](https://github.com/jestatsio/astra-db-plugin/issues) with the client version, plugin version, redacted error, and the smallest reproducible example.

## Data and privacy

The local server connects to Astra with your credentials. Database content returned by tools goes to your chosen agent under that provider's terms. A local launcher does not mean a remote database query stays on your computer. Hosted deployments have their own connection and credential handling.

Read the [privacy notice](https://github.com/jestatsio/astra-db-plugin/blob/main/docs/privacy.md) and [terms](https://github.com/jestatsio/astra-db-plugin/blob/main/docs/terms-of-service.md).

## Distribution status

[Version 2.1.0](https://github.com/jestatsio/astra-db-plugin/releases/tag/v2.1.0) is published. Claude Code and Codex can install from the repository's community marketplaces. The npm server remains `@erichare/astra-mcp`; the native plugin identifier remains `astra-db@astra-db-marketplace`.

Official directory submission is a separate process. [Maintainer publishing guidance](https://github.com/jestatsio/astra-db-plugin/blob/main/docs/publishing.md) and the [directory update record](https://github.com/jestatsio/astra-db-plugin/blob/main/docs/directory-update-2026-10-07.md) document the distinction between the local package and hosted submission requirements. No official approval is claimed here.

JEStats Astra DB Plugin is community maintained and is not affiliated with or endorsed by DataStax or IBM. Their names identify compatibility.
