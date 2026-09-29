# Publishing (maintainers)

One version number covers everything: the npm package, both plugin manifests, both marketplaces, the MCP Registry entry, and the Claude Desktop bundle.

The proposed JEStats branding release is scoped in [release-plan.md](release-plan.md), with submission copy and current directory gates in [store-listing.md](store-listing.md). A community marketplace installation does not establish official store approval.

## Ownership migration

After transfer to `jestatsio/astra-db-plugin`, update the existing npm package's trusted publisher to organization `jestatsio`, repository `astra-db-plugin`, workflow `release.yml`, environment `npm`. Keep the npm name `@erichare/astra-mcp` for compatible updates. GitHub OIDC for the MCP Registry proves the repository owner's namespace: the new release uses `io.github.jestatsio/astra-mcp`, matching `mcpName` in `server/package.json`. The existing `io.github.erichare/astra-mcp@2.0.0` listing is a separate published identity.

Before cutting that release, verify the npm trust configuration, Vercel Git integration, environment protection and permissions, and the resulting registry entry. The current release workflow suppresses registry publishing failures; correct that behavior before treating a green workflow as publication proof. [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) · [MCP Registry GitHub Actions publishing](https://modelcontextprotocol.io/registry/github-actions).

The new registry icon points to `main/assets/icon-v2.png`. Make that asset reachable before branch-first registry publication, or select an immutable URL from a published commit that already contains it. Verify the actual URL at release time.

## Cut a release

```bash
node scripts/bump-version.mjs minor        # or major, patch, or an exact 2.1.0
node scripts/check-versions.mjs            # all version locations agree
```

The bump script updates every manifest, the exact server pins in the Claude Code and Codex plugins, and `server/package-lock.json`. It also turns the `## Unreleased` section of `CHANGELOG.md` into `## X.Y.Z — <date>`, and that section becomes the GitHub Release notes. Commit the result.

Then run **Release** (`.github/workflows/release.yml`) in one of two ways:

- **From a branch, before merging** (Actions → Release → *Run workflow*). It publishes whatever version the manifests at that commit carry. This is the safe order: npm has the server before the marketplaces point at it. `prerelease` and `npm_tag` are optional inputs. GitHub only offers *Run workflow* for workflows that already exist on `main`, so this works from the release after 2.0.0 onwards.
- **From a tag:** `git tag v2.1.0 && git push origin v2.1.0`. The tag must match the manifests. A tag build uses the workflow file from the tagged commit, so this also works on a branch that isn't merged yet (that's how 2.0.0 ships). Merge that branch with a merge commit so the tagged commit ends up on `main`.

The workflow:

1. runs the whole CI suite
2. publishes `@erichare/astra-mcp` to npm with provenance, skipping versions that already exist; pre-release versions (`2.1.0-rc.1`) go to the `next` dist-tag, never `latest`
3. installs the published version with `npx` as a smoke test
4. attempts to publish `server/server.json` to the MCP Registry (`io.github.jestatsio/astra-mcp`); verify the entry independently until failure reporting is corrected
5. creates the GitHub Release `vX.Y.Z` with `astra-db-X.Y.Z.mcpb`, a stable `astra-db.mcpb` for `releases/latest/download/`, and `astra-db-bob.zip`

Merge after it succeeds. Claude Code and Codex users get the new version through their plugin marketplaces.

## One-time setup

**npm trusted publishing.** npm can only trust a package that already exists, and since July 2026 it refuses a new package's first publish from a 2FA-bypass token (`EOTP`). So the very first version is published by a maintainer, with 2FA:

1. Push the release tag. CI runs; the npm step fails with `EOTP`, and the jobs after it are skipped.
2. From a checkout of that tag, as the `erichare` npm user:
   ```bash
   git fetch origin --tags && git checkout v2.0.0
   cd server && npm ci
   npm publish --provenance=false   # builds via prepack; asks for your 2FA
   ```
   `--provenance=false` is needed because provenance can only be signed in CI. Later releases have it.
3. Re-run the failed jobs of the Release run. The npm step sees the version exists and skips, then the MCP Registry and GitHub Release jobs run.
4. On npmjs.com, open the package's *Settings → Trusted publishing*, add GitHub Actions with organization `jestatsio`, repository `astra-db-plugin`, workflow `release.yml`, and environment `npm`. Then set publishing access to require 2FA and disallow tokens.
5. Delete any npm token and the `NPM_TOKEN` secret if you created them. From then on, the job authenticates with OIDC and signs provenance.

Create a GitHub environment named `npm` for the Release job (*Settings → Environments*). Required reviewers are a good idea; if you restrict its deployment branches and tags, allow tags matching `v*`.

**MCP Registry.** `mcp-publisher login github-oidc` proves ownership of the `io.github.jestatsio/*` namespace from the transferred repository's workflow OIDC token. The registry checks that `server.json`'s `name` matches `mcpName` in `server/package.json`.

**Hosted server.** See [hosted.md](hosted.md#self-hosting-on-vercel). Vercel deploys `server/` on its own; the release workflow doesn't touch it.

## Directories

| Where | What to submit |
| --- | --- |
| Claude Code plugin directory | The marketplace `jestatsio/astra-db-plugin` (plugin `astra-db`) |
| Anthropic connectors directory | The hosted URL, with [privacy.md](privacy.md) as the privacy policy |
| Smithery | `server/smithery.yaml` (local stdio via npm), or the hosted URL |
| Docker MCP Catalog | `server/Dockerfile`, built from the repository root |
| Cursor and VS Code | The install links in the README |

## Before the first 2.x release

- Confirm the licensing of the vendored `astra-toolkit` examples with the upstream author. They ship inside the npm package and the `.mcpb` for the `code_examples` tool. See [NOTICE](../NOTICE).
- Smoke-test on Windows, and in Codex and Bob, on a real database.
