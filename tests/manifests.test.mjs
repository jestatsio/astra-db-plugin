// Plugin manifests (Claude Code, Codex, marketplaces) and skill conventions.
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { REPO_ROOT, exists, frontmatter, read, readJson } from "./helpers.mjs";

const claude = readJson(".claude-plugin/plugin.json");
const codex = readJson(".codex-plugin/plugin.json");
const pin = (manifest) => manifest.mcpServers["astra-db"].args.find((a) => a.startsWith("@erichare/astra-mcp@"));

test("Claude plugin runs the pinned server with userConfig passed as ASTRA_MCP_CONFIG_*", () => {
  assert.equal(claude.name, "astra-db");
  assert.equal(pin(claude), `@erichare/astra-mcp@${claude.version}`);
  const env = claude.mcpServers["astra-db"].env;
  assert.equal(env.ASTRA_MCP_CONFIG_TOKEN, "${user_config.token}");
  assert.ok(!("ASTRA_DB_APPLICATION_TOKEN" in env), "must not clobber a token exported in the shell");
  assert.equal(claude.userConfig.token.sensitive, true);
  assert.equal(claude.userConfig.token.required, false);
  assert.ok(!("hooks" in claude), "Claude Code loads hooks/hooks.json by default; listing it again is a duplicate");
  assert.ok(exists("hooks/hooks.json"));
  for (const key of ["documentationUrl", "supportUrl", "privacyPolicyUrl"]) assert.match(claude[key], /^https:\/\//, key);
  assert.ok(exists("docs/privacy.md"));
  assert.ok(!exists(".mcp.json"), "no root .mcp.json (it would also load as project config for contributors)");
});

test("Codex plugin shares the skills and server; hooks load from the default path", () => {
  assert.equal(codex.name, claude.name);
  assert.equal(codex.version, claude.version);
  assert.equal(codex.skills, "./skills/");
  assert.equal(pin(codex), pin(claude));
  assert.ok(!("hooks" in codex), "Codex loads hooks/hooks.json by default; its validator rejects the key");
  assert.ok(!("cwd" in codex.mcpServers["astra-db"]), "run in the project directory so .env is found");
  assert.ok(codex.mcpServers["astra-db"].env_vars.includes("ASTRA_DB_APPLICATION_TOKEN"));
  for (const key of ["displayName", "shortDescription", "longDescription", "category", "capabilities", "defaultPrompt"]) assert.ok(codex.interface[key], key);
  assert.ok(exists(codex.interface.logo));
});

test("marketplaces point at the repository root", () => {
  const market = readJson(".claude-plugin/marketplace.json");
  assert.equal(market.plugins[0].source, "./");
  assert.equal(market.metadata.version, claude.version);
  const agents = readJson(".agents/plugins/marketplace.json");
  assert.deepEqual(agents.plugins[0].source, { source: "local", path: "./" });
  assert.equal(agents.plugins[0].policy.installation, "AVAILABLE");
});

test("skills: shortcut workflows are user-invoked; personas carry Bob metadata", () => {
  const skills = readdirSync(join(REPO_ROOT, "skills")).filter((s) => exists(`skills/${s}/SKILL.md`));
  assert.deepEqual(skills.sort(), [
    "astra-toolkit", "astra-widgets", "collection", "data-model-review", "data-modeler", "doctor", "explore",
    "migration-helper", "overview", "reviewer", "setup", "similar",
  ]);
  for (const name of ["overview", "collection", "similar", "explore", "data-model-review"]) {
    assert.equal(frontmatter(read(`skills/${name}/SKILL.md`))["disable-model-invocation"], "true", name);
    assert.match(read(`skills/${name}/agents/openai.yaml`), /allow_implicit_invocation: false/, name);
  }
  for (const name of ["setup", "doctor"]) assert.ok(!frontmatter(read(`skills/${name}/SKILL.md`))["disable-model-invocation"], name);
  for (const name of ["reviewer", "data-modeler", "migration-helper"]) {
    assert.match(frontmatter(read(`skills/${name}/SKILL.md`)).metadata, /kind: persona/, name);
  }
  assert.equal(frontmatter(read("skills/reviewer/SKILL.md")).context, "fork");
  for (const skill of skills) {
    const text = read(`skills/${skill}/SKILL.md`);
    assert.doesNotMatch(text, /\$ARGUMENTS|CLAUDE_PLUGIN_ROOT/, `${skill}: harness-specific placeholders`);
    assert.doesNotMatch(text, /collection_card|similarity_search|explore_collection|astra-widgets server/, `${skill}: v1 tool names`);
  }
});

test("hooks are shell-form node commands shared by Claude and Codex", () => {
  const hooks = readJson("hooks/hooks.json").hooks;
  for (const entry of [...hooks.PreToolUse, ...hooks.SessionStart]) {
    for (const hook of entry.hooks) {
      assert.match(hook.command, /^node "\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/[a-z-]+\.mjs"$/);
      assert.ok(!("args" in hook));
    }
  }
});
