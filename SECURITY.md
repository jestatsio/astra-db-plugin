# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately through [GitHub security advisories](https://github.com/jestatsio/astra-db-plugin/security/advisories/new). Don't open a public issue. Include what you found, how to reproduce it, and what an attacker could do with it. You'll get an acknowledgement within a few days, and a fix or mitigation plan once the report is confirmed.

In scope:

- the MCP server and CLI (`@erichare/astra-mcp`, `server/`)
- the hosted server at `astra-widgets-mcp.vercel.app`, including its OAuth flow
- the hooks (`hooks/`), installers (`install.sh`, `install.ps1`), and plugin manifests

Issues in Astra DB itself, the Data API, or the DataStax client libraries belong with [DataStax / IBM](https://www.ibm.com/support).

**Never include a real token in a report.** If one leaks, revoke it in the Astra console under *Settings → Tokens*.

## Supported versions

Only the latest release gets security fixes. The plugins pin the server version, so updating the plugin (`claude plugin update astra-db`, or the equivalent for your agent) updates the server too.

## How the project handles credentials and writes

See [docs/security.md](docs/security.md) for the safeguards and [docs/privacy.md](docs/privacy.md) for what data goes where.
