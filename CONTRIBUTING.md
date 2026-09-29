# Contributing

Thanks for helping. Bug reports, fixes, new examples, and documentation are all welcome.

## Setup

You need Node.js 22 (the tests use vitest 5, which needs Node 22.12 or newer; the published server runs on 20+). The example checks also use Python 3, Go, and a JDK.

```bash
git clone https://github.com/jestatsio/astra-db-plugin && cd astra-db-plugin
cd server && npm ci && npm test && cd ..
node --test tests/*.test.mjs
```

To try your working copy in an agent:

```bash
cd server && npm run build
claude --plugin-dir ..                        # Claude Code, with this checkout as the plugin
node dist/cli.js init --dry-run               # see what init would change
```

The Claude Code plugin launches the published package with `npx`. To point it at your build instead, add a local server (`claude mcp add astra-dev -- node "$PWD/dist/cli.js"`) or temporarily edit the `mcpServers` entry in `.claude-plugin/plugin.json`.

## Where things live

| Change | Files |
| --- | --- |
| A tool | `server/src/server/{schemas,tools,summaries}.ts`, `server/src/astra/data/`, `docs/tools.md` |
| A view | `server/ui/src/views/`, `server/ui/styles.css`, and a harness scenario in `server/tests/ui/` |
| Credentials | `server/src/credentials/`, `docs/configuration.md` |
| Hosted / OAuth | `server/src/http/`, `docs/hosted.md` |
| The installer | `server/src/cli/`, `install.sh`, `install.ps1` |
| A skill | `skills/<name>/SKILL.md` |
| Hooks | `hooks/*.mjs`, `tests/hooks.test.mjs` |

[AGENTS.md](AGENTS.md) has the full command list and the project's rules. It's written for coding agents, and it's the quickest overview for people too.

## Before you open a pull request

- `npm run check`, `npm run typecheck`, and `npm test` in `server/`, and `node --test tests/*.test.mjs` at the root. CI also runs the stdio end-to-end test, the Chromium UI harness, the plugin validators, skillsaw (grade A+), and the example syntax checks on Linux, macOS, and Windows.
- If you changed tool output, a description, or a schema: `UPDATE_EVAL_MOCKS=1 npx vitest run tests/evals`, and commit the regenerated `evals/mocks/`.
- Describe user-visible changes under `## Unreleased` in `CHANGELOG.md`.
- Use Conventional Commit messages, for example `fix(cli): keep comments when editing VS Code mcp.json`.
- Never include a real token, even a revoked one.

Releases are cut by the maintainer ([docs/publishing.md](docs/publishing.md)).

## Examples and skill content

`skills/astra-toolkit/` is vendored from [sl-at-ibm/astra-toolkit-skill](https://github.com/sl-at-ibm/astra-toolkit-skill). Content fixes that apply upstream are best proposed there too. Examples must read credentials from the environment; `node scripts/codemod-examples.mjs` rewrites placeholders, and `node scripts/build-examples-index.mjs` refreshes the per-language indexes.

## Security issues

Report them privately; see [SECURITY.md](SECURITY.md).
