# Store submission draft

**Last checked:** 2026-09-29. **Status:** copy and submission checklist for the proposed 2.1.0 release. No new official listing or store approval is asserted by this document.

## Public listing copy

**Name:** JEStats Astra DB Plugin

**Publisher:** JEStats

**Short description:** Unofficial Astra DB tools for AI agents: inspect schemas, explore documents and tables, run vector search, and use guarded writes.

**Full description:**

Connect your AI coding assistant to Astra DB with JEStats. Inspect databases and schemas, browse collections and tables, search documents, run vector and hybrid queries, and make guarded data changes. Compatible hosts can display interactive database views; terminal workflows can export local HTML views. The plugin also includes setup diagnostics, credential hygiene hooks, and Data API examples.

Use your existing Astra CLI profile, project environment, or supported host settings for the local server. An Astra application token is still required by Astra DB; CLI profile reuse avoids entering another copy into the assistant. Hosted access uses the plugin's authorization service and currently asks for an Astra application token. Credentials should be entered through setup or host configuration, not in chat. Read-only mode is available, and destructive operations require confirmation.

JEStats Astra DB Plugin is an unofficial, community-maintained integration. It is not affiliated with, endorsed by, or an official product of DataStax or IBM. Astra DB, DataStax, and IBM are trademarks of their respective owners. JEStats maintains and supports this plugin.

**Category:** Developer tools / Databases

**Keywords:** Astra DB, DataStax, database, vector search, MCP, coding agents

**Suggested first prompts:**

- “Check my Astra connection and explain how my credentials were found.”
- “Show my database's collections and tables, then describe the schema of one collection.”
- “Search this collection for documents similar to my query and explain the results.”

Copy must be rechecked against the final shipped artifact. Do not claim upstream Astra OAuth, tokenless login, automatic database provisioning, verified support on untested hosts, or automatic 24-hour HTML deletion.

OpenAI's public MCP submission also requires explicit `interface.websiteURL`, `supportURL`, `privacyPolicyURL`, and `termsOfServiceURL`. The draft manifest provides the first three. A published terms-of-service page and its `termsOfServiceURL` remain a submission gate; author/homepage fields do not substitute for these URLs. Confirm the publisher's terms before completing that field. [Listing metadata requirements](https://developers.openai.com/plugins/deploy/submission).

## Publisher, support, and policy links

| Field | Proposed public value | Remaining check |
| --- | --- | --- |
| Publisher website | [jestats.io](https://jestats.io) | Confirm the selected contact and product landing experience. |
| Source | [jestatsio/astra-db-plugin](https://github.com/jestatsio/astra-db-plugin) | Public ownership transfer verified 2026-09-29. |
| Support | [GitHub issues](https://github.com/jestatsio/astra-db-plugin/issues) | Issues enabled; define maintainer coverage before submission. |
| Privacy | [Plugin privacy policy](https://github.com/jestatsio/astra-db-plugin/blob/main/docs/privacy.md) | Verify after transfer; reflect local credential files, exported HTML, hosting logs, and any replay store. Use a dedicated rendered policy page if a directory requires it. |
| Security | [Security guide](https://github.com/jestatsio/astra-db-plugin/blob/main/docs/security.md) | Check that the final reporting instructions are actionable. |
| License and attribution | [LICENSE](https://github.com/jestatsio/astra-db-plugin/blob/main/LICENSE), [NOTICE](https://github.com/jestatsio/astra-db-plugin/blob/main/NOTICE) | Resolve upstream toolkit rights before store license attestations. |
| Branding | [Brand specification](branding.md) | Use original JEStats artwork, small-size previews, and a visible unofficial label. |

Repository transfer is complete. Policy and branding edits still require the draft PR to merge before their `main` URLs expose the new copy. The npm package remains [@erichare/astra-mcp](https://www.npmjs.com/package/@erichare/astra-mcp), and installed identifiers remain `astra-db` / `astra-db-marketplace` for compatibility. MCP Registry publication after transfer uses `io.github.jestatsio/astra-mcp`.

## Immediate self-managed distribution

Match the [Screaming Frog reference](https://github.com/jestatsio/screamingfrog-plugin): recognizable JEStats branding, a choose-assistant README/landing page, explicit release status, downloadable artifacts, and precise installation steps. That repository records a development preview, pending host verification, and no performed official directory submissions; it is a distribution reference rather than proof of store acceptance.

| Channel | Artifact/path | Acceptance evidence |
| --- | --- | --- |
| Claude Code | [.claude-plugin marketplace](../.claude-plugin/marketplace.json), plugin `astra-db@astra-db-marketplace` | Install from `jestatsio/astra-db-plugin`, perform first useful query, verify update/uninstall. |
| Codex | [.agents marketplace](../.agents/plugins/marketplace.json), [.codex-plugin manifest](../.codex-plugin/plugin.json) | Add marketplace, install the retained plugin ID, verify skills/hooks/tools and project credential discovery. |
| Claude Desktop | [MCPB manifest](../server/mcpb/manifest.json), release `.mcpb` | Install the built bundle; test CLI/global credentials without a mandatory token form, read-only setup, and removal. |
| IBM Bob | Generated `astra-db-bob.zip`; [Bob guide](bob.md) | Verify MCP configuration, skills, commands, modes, hooks, and uninstall on the supported OS/host versions. Public third-party store submission route remains unverified. |
| Editors and other local hosts | [Setup CLI](../server/src/cli/agents.ts), npm package | Verify each claimed path and preserve existing credential/read-only settings on reinstall. |
| MCP Registry | [server.json](../server/server.json) and matching package `mcpName` | Publish/read back the new namespace and exact version; a registry entry is distinct from a host store listing. |

Publish checksums for release files and retain the source commit, exact npm version, and validation results. Existing 2.0.0 release availability does not establish readiness of the new branding release.

## Official directories and discovery routes

| Route | Current primary instructions | Submission prerequisites and outstanding gates |
| --- | --- | --- |
| Claude plugin directory | [Submission guide](https://claude.com/docs/plugins/submit), [publisher portal](https://claude.ai/directory/manage), [pre-submission checklist](https://claude.com/docs/plugins/pre-submission-checklist) | Paid Claude account and GitHub account with repository push permission; selected plugin folder/ref; public repository before the listing goes live; portal validation, scan, review, and publication. Finish transfer, rights confirmation, exact server pin, final metadata/artwork, and host evidence. The current 1,915-file repository exceeds the 512-file manual-review threshold; prepare a lean reviewed package. Even exactly pinned `npx` installs may require manual review. |
| OpenAI public plugin store | [Current submission workflow](https://developers.openai.com/plugins/deploy/submission), [publisher portal](https://platform.openai.com/plugins), [Claude-plugin adaptation guide](https://developers.openai.com/plugins/guides/submit-claude-plugin), [authentication guidance](https://developers.openai.com/plugins/build/auth) | Current workflow uses a ZIP upload. Verified individual/business publisher; organization owner or Apps Management Write; public HTTPS Streamable HTTP MCP service; domain verification at `/.well-known/openai-apps-challenge`; dedicated accessible sample account, demo video, five positive and three negative test cases; metadata/skills/tool scans, approval, then publication. A local `.mcpb` or stdio-only package is not the normal public MCP route. Finish hosted auth/replay/privacy gates, service operations, test fixture, and publisher verification. |
| Anthropic hosted connector directory | [Connector submission guide](https://claude.com/docs/connectors/building/submission), [publisher portal](https://claude.ai/directory/manage) | Paid Claude account; reachable HTTPS MCP service; working OAuth for private account access; titles and read/write annotations on every tool; populated reviewer account; documentation/privacy/support URLs and icon. MCP Apps need 3–5 PNG screenshots at least 1,000px wide with paired prompt text. Test every tool in Claude or MCP Inspector, complete the policy acknowledgments, and pass portal scans. Community listing and Verified status are separate. Finish hosted authentication/privacy/operations gates; submit this server separately from the plugin. |
| Smithery | [Current Smithery CLI source](https://github.com/arcadeai-labs/smithery-cli), [Smithery](https://smithery.ai) | Authenticate the JEStats namespace, publish a supported public HTTPS endpoint or built `.mcpb`, and verify the listing/install path. [smithery.yaml](../server/smithery.yaml) is legacy stdio configuration with a required token and `@2` range; revise the selected distribution path before submission. |
| Docker MCP Catalog | [Catalog contribution instructions](https://github.com/docker/mcp-registry/blob/main/CONTRIBUTING.md), [Dockerfile](../server/Dockerfile) | Submit a metadata pull request for a Docker-built or self-provided image; build/test the selected path, review secret configuration, and provide maintainer metadata. Approval and catalog publication are separate from building an image. |
| Cursor / VS Code | [Cursor documentation](https://cursor.com/docs), [VS Code MCP documentation](https://code.visualstudio.com/docs/agent-customization/mcp-servers) | Maintain tested install/deep links and explicit environment/profile setup. Verify any separate curated listing opportunity before promising a store submission. |

The general Claude directory portal and inclusion in Anthropic's official Claude Code marketplace are separate routes; [Claude Code publishing guidance](https://code.claude.com/docs/en/plugins/publish) describes partner contact for the latter. For OpenAI, prefer the current ZIP workflow over an older guide's UI wording if they diverge. Recheck intake requirements immediately before submission.

## Review evidence to prepare

Four screenshot candidates are prepared from synthetic AppBridge fixtures at 1,520px width. Pair them with these prompts; capture the final submitted deployment/account again if the reviewer requires live evidence.

| Screenshot | Paired prompt |
| --- | --- |
| [Database overview](../assets/widgets/v2/overview-light.png) | “Show the keyspaces, collections, and tables in my database.” |
| [Collection schema](../assets/widgets/v2/card-dark.png) | “Describe the articles collection and its vector search settings.” |
| [Document explorer](../assets/widgets/v2/explorer-dark.png) | “Browse documents in the articles collection.” |
| [Similarity results](../assets/widgets/v2/similarity-light.png) | “Find articles similar to my query.” |

1. **Identity:** transferred source URL, public publisher identity, distinct original icon, unofficial notice, support/privacy/security links, resolved rights for bundled content.
2. **Artifacts:** one exact version/source commit; package and ZIP contents; checksums; successful release job outputs; npm metadata/provenance; MCP Registry readback. [release.yml](../.github/workflows/release.yml) must stop masking registry failures.
3. **Usability:** host/OS/version records for setup, credential reuse, schema inspection, search, read-only mode, confirmations, reinstall, and uninstall. State which hosts provide embedded views and which use HTML export.
4. **Hosted operations:** working public endpoint and authorization metadata, single-use codes, verified refresh replay protection, expiry/revocation tests, deployment ownership, reviewer sample account, and truthful privacy retention.
5. **Submission:** requested platform-specific tests/demo, validation and scan results, submission reference, review response, and live listing URL. Record those as separate outcomes.

## Publication status record

| Milestone | Status at assessment |
| --- | --- |
| Existing npm/GitHub release | 2.0.0 verified public on 2026-09-29; branded 2.1.0 remains proposed. |
| Existing MCP Registry | `io.github.erichare/astra-mcp` 2.0.0 verified active; new owner namespace not yet published. |
| Repository transfer | Complete: public `jestatsio/astra-db-plugin` verified 2026-09-29; existing release/PR preserved. |
| New branded assets and listing materials | Working draft; final review/build verification required. |
| Upstream toolkit redistribution/license confirmation | Outstanding, as recorded in [NOTICE](../NOTICE). |
| Hosted store readiness | Source/metadata assessment only; authentication fixes and operational verification outstanding. |
| New official store submission / approval / live listing | Not established by this assessment; record evidence for each platform when completed. |
