# JEStats branding

Public name: **JEStats Astra DB Plugin**. Publisher: **JEStats**, linked to [jestats.io](https://jestats.io). The plugin is an unofficial, community-maintained integration for Astra DB. It is not affiliated with, endorsed by, or an official product of DataStax or IBM. Astra DB, DataStax, and IBM names identify compatibility; their trademarks belong to their owners.

The palette follows the live JEStats website's Elementor global theme, inspected on 2026-09-29: charcoal `#111827`, cream `#FAF9F5`, warm neutral `#E8E3DA`, orange `#D9531E`, and muted text `#4B5563`. Use the darker orange `#B64013` for small text on cream, and cream text on charcoal for high contrast. Use system font fallbacks so no external font request is needed; the site's Plus Jakarta Sans can be used when available locally.

The original database glyph is adapted into a database and ascending statistics mark. It contains no Astra, DataStax, IBM, or host vendor logo. The square icon should remain legible at small sizes; the banner pairs the product name with a visible unofficial label. The Screaming Frog plugin uses an earlier teal/mint palette; this draft follows the current website while keeping the shared JEStats publisher identity.

Assets:

- [Icon source](../assets/icon-v2.svg), [512px PNG](../assets/icon-v2.png)
- [README banner source](../assets/banner-v2.svg), [PNG preview](../assets/banner-v2.png)

Use the new icon in plugin manifests, MCP server metadata, the Claude Desktop bundle, and the hosted consent page. Keep the existing `astra-db` plugin/tool IDs and `astra-db-marketplace` marketplace ID so command names and installed integrations remain compatible. The npm package remains `@erichare/astra-mcp` for this draft; repository ownership and public publisher branding are independent of the npm scope.

The earlier `icon.svg`, `icon.png`, and `banner.svg` remain as legacy assets. The new artwork is native SVG, adapted from the repository's editable original glyph, with deterministic PNG exports.
