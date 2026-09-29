import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { loadAssets } from "../src/assets.js";
import { type Env, SERVER_SPEC, mcpEntry } from "../src/cli/agents.js";
import { bobLayout, bobZip, installBob, mergeCustomModes, parseSkill, uninstallBob, type SkillDoc } from "../src/cli/bob.js";
import { doctor, formatChecks } from "../src/cli/doctor.js";
import { editJsonc } from "../src/cli/fsutil.js";
import { init, uninstall } from "../src/cli/init.js";
import { login } from "../src/cli/login.js";
import { scriptedIO } from "../src/cli/term.js";
import { createFakeState, fakeGateway } from "./fake.js";
import { TOKEN } from "./helpers.js";

function sandbox(options: { commands?: string[] } = {}) {
  const root = mkdtempSync(join(tmpdir(), "astra-cli-"));
  const home = join(root, "home");
  const cwd = join(root, "project");
  mkdirSync(home, { recursive: true });
  mkdirSync(cwd, { recursive: true });
  const calls: string[] = [];
  const env: Env = {
    home, cwd, platform: "linux", env: {},
    exec: (command, args) => {
      calls.push([command, ...args].join(" "));
      return { ok: true, stdout: "", stderr: "" };
    },
    has: (command) => (options.commands ?? []).includes(command),
  };
  return { root, home, cwd, env, calls };
}

const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));

describe("init / uninstall", () => {
  it("installs plugins via agent CLIs and MCP entries into JSON configs", async () => {
    const { env, calls, home } = sandbox({ commands: ["claude", "codex"] });
    const io = scriptedIO([], { yes: true });
    const result = await init(io, env, { agents: ["claude-code", "codex", "cursor", "windsurf", "claude-desktop", "gemini"] });
    expect(result.failed).toBe(0);
    expect(calls).toEqual([
      "claude plugin marketplace add jestatsio/astra-db-plugin",
      "claude plugin install astra-db@astra-db-marketplace",
      "codex plugin marketplace add jestatsio/astra-db-plugin",
      "codex plugin add astra-db@astra-db-marketplace",
    ]);
    expect(json(join(home, ".cursor/mcp.json")).mcpServers["astra-db"]).toMatchObject({ command: "npx", args: ["-y", SERVER_SPEC], env: { ASTRA_MCP_PROJECT_DIR: "${workspaceFolder}" } });
    expect(json(join(home, ".codeium/windsurf/mcp_config.json")).mcpServers["astra-db"].args).toEqual(["-y", SERVER_SPEC]);
    expect(json(join(home, ".config/Claude/claude_desktop_config.json")).mcpServers["astra-db"]).toBeTruthy();
    expect(json(join(home, ".gemini/settings.json")).mcpServers["astra-db"]).toBeTruthy();
    expect(io.lines.some((l) => l.includes("npx skills add jestatsio/astra-db-plugin"))).toBe(true);
  });

  it("writes project-level VS Code config, preserving comments, replacing legacy entries, with a backup", async () => {
    const { env, cwd } = sandbox();
    const path = join(cwd, ".vscode/mcp.json");
    mkdirSync(join(cwd, ".vscode"));
    writeFileSync(path, '{\n  // my servers\n  "servers": {\n    "other": { "command": "x" },\n    "astra-db": { "command": "npx", "args": ["-y", "@datastax/astra-db-mcp"] }\n  }\n}\n');
    await init(scriptedIO([], { yes: true }), env, { agents: ["vscode"], project: true });
    const text = readFileSync(path, "utf8");
    expect(text).toContain("// my servers");
    expect(text).toContain('"other"');
    expect(text).toContain(SERVER_SPEC);
    expect(text).not.toContain("@datastax/astra-db-mcp");
    expect(existsSync(`${path}.bak-astra`)).toBe(true);
  });

  it("dry-run changes nothing; declining the plan changes nothing", async () => {
    const { env, home } = sandbox();
    await init(scriptedIO([], { yes: true }), env, { agents: ["cursor"], dryRun: true });
    expect(existsSync(join(home, ".cursor/mcp.json"))).toBe(false);
    await init(scriptedIO([false]), env, { agents: ["cursor"] });
    expect(existsSync(join(home, ".cursor/mcp.json"))).toBe(false);
  });

  it("uninstall removes our entries and nothing else", async () => {
    const { env, home, calls } = sandbox({ commands: ["claude"] });
    const cursor = join(home, ".cursor/mcp.json");
    mkdirSync(join(home, ".cursor"), { recursive: true });
    writeFileSync(cursor, JSON.stringify({ mcpServers: { keep: { command: "y" } } }));
    await init(scriptedIO([], { yes: true }), env, { agents: ["cursor", "claude-code"] });
    expect(json(cursor).mcpServers["astra-db"]).toBeTruthy();
    await uninstall(scriptedIO([], { yes: true }), env, { agents: ["cursor", "claude-code"] });
    expect(json(cursor).mcpServers).toEqual({ keep: { command: "y" } });
    expect(calls).toContain("claude plugin uninstall astra-db@astra-db-marketplace");
  });

  it("uses cmd /c npx on Windows and rejects invalid JSON configs", () => {
    expect(mcpEntry("win32")).toMatchObject({ command: "cmd", args: ["/c", "npx", "-y", SERVER_SPEC] });
    const dir = mkdtempSync(join(tmpdir(), "astra-bad-"));
    writeFileSync(join(dir, "bad.json"), "{ nope");
    expect(() => editJsonc(join(dir, "bad.json"), ["a"], 1)).toThrow(/not valid JSON/);
  });
});

describe("IBM Bob bundle", () => {
  const persona: SkillDoc = {
    name: "reviewer", description: "Reviews Astra DB code. Use when …", kind: "persona", fields: {},
    metadata: { kind: "persona", "bob-groups": "read command mcp" },
    body: "# Reviewer\n\nYou review Data API code.\n\nRead ../astra-toolkit/SKILL.md first.", files: {},
  };

  it("parses skill frontmatter with a metadata map", () => {
    const parsed = parseSkill("---\nname: x\ndescription: \"d\"\nmetadata:\n  kind: persona\n  bob-groups: read mcp\n---\nBody");
    expect(parsed).toEqual({ fields: { name: "x", description: "d" }, metadata: { kind: "persona", "bob-groups": "read mcp" }, body: "Body" });
    // A Windows checkout or editor may hand us CRLF.
    const crlf = parseSkill("---\r\nname: x\r\ndescription: \"d\"\r\nmetadata:\r\n  kind: persona\r\n---\r\nBody");
    expect(crlf).toEqual({ fields: { name: "x", description: "d" }, metadata: { kind: "persona" }, body: "Body" });
  });

  it("merges custom modes between markers, keeping user modes and indentation", () => {
    const existing = "customModes:\n- slug: mine\n  name: Mine\n";
    const merged = mergeCustomModes(existing, [persona]);
    expect(merged).toContain("- slug: mine");
    expect(merged).toContain("- slug: astra-reviewer");
    expect(merged).toContain("    - mcp");
    expect(merged).toContain(".bob/skills/astra-toolkit/SKILL.md");
    const again = mergeCustomModes(merged, [persona]);
    expect(again.match(/astra-db:begin/g)).toHaveLength(1);
    expect(mergeCustomModes(undefined, [persona])).toMatch(/^customModes:\n {2}# astra-db:begin/);
  });

  it("installs into a project .bob and uninstalls exactly", () => {
    const assets = loadAssets();
    expect(assets).toBeTruthy();
    const { cwd } = sandbox();
    const layout = bobLayout(join(cwd, ".bob"), false);
    mkdirSync(layout.root, { recursive: true });
    writeFileSync(layout.mcpFile, JSON.stringify({ mcpServers: { mine: { command: "z" } } }));
    const result = installBob(assets!, layout);
    expect(existsSync(join(layout.skillsDir, "astra-toolkit/SKILL.md"))).toBe(true);
    expect(existsSync(join(layout.rulesDir, "astra-db.md"))).toBe(true);
    expect(json(layout.mcpFile).mcpServers).toMatchObject({ mine: { command: "z" }, "astra-db": { alwaysAllow: expect.arrayContaining(["find"]) } });
    expect(JSON.stringify(json(layout.settingsFile))).toContain("--host=bob");
    expect(existsSync(result.manifest)).toBe(true);
    uninstallBob(layout);
    expect(existsSync(join(layout.skillsDir, "astra-toolkit"))).toBe(false);
    expect(json(layout.mcpFile).mcpServers).toEqual({ mine: { command: "z" } });
  });

  it("uninstall keeps files the user added inside installed directories", () => {
    const { cwd } = sandbox();
    const layout = bobLayout(join(cwd, ".bob"), false);
    installBob(loadAssets()!, layout);
    const notes = join(layout.skillsDir, "astra-toolkit", "my-notes.md");
    const hook = join(layout.hooksDir, "custom.mjs");
    writeFileSync(notes, "mine");
    writeFileSync(hook, "// mine");
    uninstallBob(layout);
    expect(readFileSync(notes, "utf8")).toBe("mine");
    expect(readFileSync(hook, "utf8")).toBe("// mine");
    expect(existsSync(join(layout.skillsDir, "astra-toolkit", "SKILL.md"))).toBe(false);
    expect(existsSync(join(layout.skillsDir, "astra-widgets"))).toBe(false);
    expect(existsSync(join(layout.hooksDir, "credential-guard.mjs"))).toBe(false);
  });

  it("builds a release zip", () => {
    const files = unzipSync(bobZip(loadAssets()!));
    expect(Object.keys(files)).toEqual(expect.arrayContaining([".bob/skills/astra-toolkit/SKILL.md", ".bob/mcp.json", ".bob/custom_modes.yaml", ".bob/settings.json", ".bob/rules/astra-db.md"]));
    expect(strFromU8(files[".bob/mcp.json"])).toContain(SERVER_SPEC);
  });
});

describe("login", () => {
  it("lists databases, writes a private .env, and git-ignores it", async () => {
    const { cwd, home } = sandbox();
    execFileSync("git", ["init", "-q"], { cwd });
    const state = createFakeState();
    const io = scriptedIO(["default_keyspace", true]);
    const result = await login(io, fakeGateway(state), { dir: cwd, home, env: {}, tokenStdin: true, readStdin: async () => `${TOKEN}\n` });
    expect(result).toMatchObject({ database: { name: "prod-db" }, keyspace: "default_keyspace" });
    const envText = readFileSync(join(cwd, ".env"), "utf8");
    expect(envText).toContain(`ASTRA_DB_APPLICATION_TOKEN=${TOKEN}`);
    expect(envText).toContain("ASTRA_DB_API_ENDPOINT=https://11111111-1111-1111-1111-111111111111-us-east-2.apps.astra.datastax.com");
    if (process.platform !== "win32") expect(statSync(join(cwd, ".env")).mode & 0o777).toBe(0o600);
    expect(readFileSync(join(cwd, ".gitignore"), "utf8")).toContain(".env");
    expect(io.lines.join("\n")).not.toContain(TOKEN);
  });

  it("saves to the user credentials file with --global and rejects non-tokens", async () => {
    const { cwd, home } = sandbox();
    const state = createFakeState();
    const env = { XDG_CONFIG_HOME: join(home, ".config") };
    await login(scriptedIO([]), fakeGateway(state), { dir: cwd, home, env, global: true, tokenStdin: true, readStdin: async () => TOKEN });
    expect(json(join(home, ".config/astra-mcp/credentials.json"))).toMatchObject({ token: TOKEN, database: "prod-db" });
    await expect(login(scriptedIO([]), fakeGateway(state), { dir: cwd, home, env, tokenStdin: true, readStdin: async () => "nope" })).rejects.toThrow(/AstraCS/);
  });

  it("falls back to a manual endpoint for database-scoped tokens", async () => {
    const { cwd, home } = sandbox();
    const state = createFakeState();
    state.failures.set("listDatabases", Object.assign(new Error("nope"), { name: "DevOpsAPIResponseError", status: 403 }));
    const io = scriptedIO(["https://db-us-east-2.apps.astra.datastax.com", false]);
    const result = await login(io, fakeGateway(state), { dir: cwd, home, env: {}, tokenStdin: true, readStdin: async () => TOKEN });
    expect(result.endpoint).toBe("https://db-us-east-2.apps.astra.datastax.com");
  });
});

describe("doctor", () => {
  it("reports credentials, live checks, and fixes", async () => {
    const { env, cwd } = sandbox();
    writeFileSync(join(cwd, ".env"), `ASTRA_DB_APPLICATION_TOKEN=${TOKEN}\nASTRA_DB_API_ENDPOINT=https://11111111-1111-1111-1111-111111111111-us-east-2.apps.astra.datastax.com\n`);
    const checks = await doctor(fakeGateway(createFakeState()), { env, agents: false });
    const byId = Object.fromEntries(checks.map((c) => [c.id, c]));
    expect(byId.token.status).toBe("ok");
    expect(byId.token.detail).not.toContain("testtesttest");
    expect(byId["data-api"]).toMatchObject({ status: "ok", detail: expect.stringContaining("2 collection(s)") });
    expect(formatChecks(checks)).toContain("✓ Token");

    const empty = sandbox();
    const missing = await doctor(fakeGateway(createFakeState()), { env: empty.env, agents: false });
    expect(missing.find((c) => c.id === "token")).toMatchObject({ status: "fail", fix: expect.stringContaining("login") });
  });
});
