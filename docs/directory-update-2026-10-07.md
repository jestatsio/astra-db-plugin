# Directory listing refresh

Prepared 2026-10-07. Publisher: JEStats. Maintainer: Eric Hare.

## Listing copy

**Name:** JEStats Astra DB Plugin

**OpenAI subtitle:** Explore and search Astra DB

**Claude description:** Explore Astra DB with your coding agent: inspect schemas, browse data, run vector and hybrid searches, and make guarded changes. Includes interactive views and Data API examples. An unofficial integration by JEStats.

**Hosted OpenAI description:** Explore Astra DB with JEStats. Inspect live collection and table schemas, browse documents, and search with vector and hybrid queries. Compatible hosts display interactive database views, and Data API examples help you write code against your actual schema.

Connect through the hosted authorization page using an Astra application token. This authorizes the JEStats integration, not an Astra account sign-in. Enter credentials only through the connection page, never in chat. Connections are read-only by default. Writes require a separate grant, and destructive operations require confirmation.

An unofficial, community-maintained integration published by JEStats and maintained by Eric Hare. Not affiliated with or endorsed by DataStax or IBM.

**Starter prompts:**

- Show the collections and tables in my Astra DB database.
- Describe this collection before writing code against it.
- Find documents similar to this query.

Use the original JEStats database icon at `assets/icon-v2.png` and orange `#D9531E`. Keep the installed identifiers `astra-db` and `astra-db-marketplace` and the npm package name `@erichare/astra-mcp`.

## Current observations

- Claude has an existing Astra DB draft. Continuing it validated the current `main` commit `da4660c1027afe120da093285e4ebd9e7e2760b8` and imported the JEStats name and links. The original source label is `erichare/astra-db-plugin`, which GitHub redirects to `jestatsio/astra-db-plugin`. The draft cannot change its repository/path in place.
- Claude validation passed with 12 warnings and 20 policy holds. These include the pinned package launcher, credential discovery, image files, and files the scanner could not inspect. Passing validation does not establish review approval.
- The local plugin's MCP server cannot run in Claude web/mobile. Its native tools are appropriate for Claude Code. Reassess Cowork separately against the portal's user-settings warning. A hosted connector is a separate submission.
- OpenAI has no existing submissions in the selected account. Only Eric Hare's verified individual identity is available. The requested JEStats publisher needs business verification.
- The hosted Astra OAuth discovery endpoint responds. `/mcp` returns HTTP 401 without credentials, as expected. No authenticated end-to-end OAuth/reviewer test was performed in this refresh.

## OpenAI public package

Prepare a separate package around `https://astra-widgets-mcp.vercel.app/mcp`. Do not upload the repository's local plugin unchanged: it contains local launch configuration and hooks that OpenAI's public directory does not accept. Keep the community Codex package with its local credential hooks.

The public package should contain the original JEStats icon, synthetic UI screenshots, hosted-specific instructions, the read-only default, and five positive/three negative review cases. A package draft is not a deployment test or completed review.

## Required inputs before submission

- Verify JEStats as the OpenAI developer identity.
- Review and publish the [draft terms](terms-of-service.md) for J&E Statistical Consulting, LLC. Set their effective date before using the main-branch URL in a submission.
- The maintainer confirmed upstream redistribution permission on 2026-10-07. Retain that permission record alongside the attribution in NOTICE.
- Complete domain verification using the portal's exact challenge value.
- Create a dedicated populated reviewer database/account. Never give reviewers the maintainer's production database, credentials, or real personal data.
- Verify OAuth code exchange, refresh, replay rejection, read-only default, and scoped write behavior on the deployed service.
- Run the review cases and record an accessible demo video.
- Confirm the final privacy declarations and approve the directory terms before submission.

Use the [OpenAI submission workflow](https://developers.openai.com/plugins/deploy/submission) and the [Claude publishing workflow](https://claude.com/docs/directory/publish) as the source of current intake requirements. The older [store listing draft](store-listing.md) remains the historical September assessment.
