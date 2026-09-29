import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { AGENTS, type Env, SERVER_SPEC } from "../src/cli/agents.js";
import { bobLayout, installBob } from "../src/cli/bob.js";
import type { Assets } from "../src/assets.js";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "astra-reinstall-"));
  const calls: string[][] = [];
  const env: Env = {
    home: join(root, "home"), cwd: join(root, "project"), platform: "linux", env: {},
    has: (command) => command === "code",
    exec: (_command, args) => { calls.push(args); return { ok: true, stdout: "", stderr: "" }; },
  };
  return { env, calls };
}

const settings = {
  command: "old", args: ["old"], disabled: true, alwaysAllow: [], timeout: 90,
  env: { ASTRA_MCP_READ_ONLY: "1", ASTRA_PROFILE: "analytics", ASTRA_MCP_PROJECT_DIR: "/custom/project", CUSTOM: "keep" },
};

function writeConfig(path: string, key: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ [key]: { "astra-db": settings, other: { command: "keep" } } }));
}

describe("installer preserves connection and permission settings", () => {
  it("keeps Cursor configuration across repeated installation while updating the command", () => {
    const { env } = fixture();
    const path = join(env.home, ".cursor", "mcp.json");
    writeConfig(path, "mcpServers");
    const agent = AGENTS.find((a) => a.id === "cursor")!;
    for (let i = 0; i < 2; i++) for (const action of agent.install(env, { project: false })) expect(action.apply().ok).toBe(true);
    const config = JSON.parse(readFileSync(path, "utf8"));
    expect(config.mcpServers.other).toEqual({ command: "keep" });
    expect(config.mcpServers["astra-db"]).toMatchObject({ ...settings, command: "npx", args: ["-y", SERVER_SPEC], env: { ...settings.env, ASTRA_MCP_CLIENT: "cursor" } });
  });

  it("passes preserved VS Code settings through the successful --add-mcp path", () => {
    const { env, calls } = fixture();
    writeConfig(join(env.home, ".config", "Code", "User", "mcp.json"), "servers");
    const agent = AGENTS.find((a) => a.id === "vscode")!;
    for (const action of agent.install(env, { project: false })) expect(action.apply().ok).toBe(true);
    const entry = JSON.parse(calls[0][1]);
    expect(entry).toMatchObject({ ...settings, name: "astra-db", command: "npx", args: ["-y", SERVER_SPEC], type: "stdio", env: { ...settings.env, ASTRA_MCP_CLIENT: "vscode" } });
  });

  it("retains Bob's disabled state, read-only credentials and permission choices", () => {
    const { env } = fixture();
    const layout = bobLayout(join(env.cwd, ".bob"), false);
    writeConfig(layout.mcpFile, "mcpServers");
    const assets: Assets = { version: "2.1.0", files: {}, catalog: [] };
    installBob(assets, layout);
    installBob(assets, layout);
    const config = JSON.parse(readFileSync(layout.mcpFile, "utf8"));
    expect(config.mcpServers.other).toEqual({ command: "keep" });
    expect(config.mcpServers["astra-db"]).toMatchObject({ ...settings, command: "npx", args: ["-y", SERVER_SPEC], env: { ...settings.env, ASTRA_MCP_CLIENT: "bob" } });
  });
});
