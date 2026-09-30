/**
 * The agents `init` can configure. Claude Code and Codex install the full
 * plugin through their marketplaces; editors and desktop apps get an MCP
 * server entry merged into their JSON config; Bob gets a generated bundle.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { editJsonc, onPath, readJsonc, readText, run } from "./fsutil.js";

export const MARKETPLACE_REPO = "jestatsio/astra-db-plugin";
export const PLUGIN_ID = "astra-db@astra-db-marketplace";
export const SERVER_KEY = "astra-db";
export const SERVER_SPEC = "@erichare/astra-mcp@2";

export type AgentId = "claude-code" | "codex" | "cursor" | "vscode" | "windsurf" | "claude-desktop" | "gemini" | "bob";

export interface Env {
  home: string;
  cwd: string;
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  /** Replaceable for tests: runs an agent's CLI. */
  exec: (command: string, args: string[]) => { ok: boolean; stdout: string; stderr: string };
  has: (command: string) => boolean;
}

export function defaultEnv(overrides: Partial<Env> = {}): Env {
  return {
    home: overrides.home ?? process.env.HOME ?? process.env.USERPROFILE ?? "",
    cwd: overrides.cwd ?? process.cwd(),
    platform: overrides.platform ?? process.platform,
    env: overrides.env ?? process.env,
    exec: overrides.exec ?? ((command, args) => run(command, args)),
    has: overrides.has ?? onPath,
  };
}

export interface Action {
  /** Human description shown in plans and dry runs. */
  describe: string;
  apply(): { ok: boolean; detail?: string };
}

export interface Agent {
  id: AgentId;
  label: string;
  /** Short note about what gets installed. */
  what: string;
  detect(env: Env): boolean;
  install(env: Env, options: { project: boolean }): Action[];
  uninstall(env: Env, options: { project: boolean }): Action[];
  /** Is it configured already? (doctor) */
  status(env: Env, options: { project: boolean }): "configured" | "legacy" | "missing" | "unknown";
}

/** The stdio MCP entry most JSON-configured clients understand. */
export function mcpEntry(platform: NodeJS.Platform, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const base = platform === "win32"
    ? { command: "cmd", args: ["/c", "npx", "-y", SERVER_SPEC] }
    : { command: "npx", args: ["-y", SERVER_SPEC] };
  return { ...base, ...extra };
}

function isLegacyEntry(value: unknown): boolean {
  const text = JSON.stringify(value ?? "");
  return text.includes("@datastax/astra-db-mcp") || text.includes("server/dist/index.js") || text.includes("astra-widgets");
}

/** Agents configured by merging an MCP entry into a JSON(C) file. */
function jsonAgent(spec: {
  id: AgentId;
  label: string;
  key: "mcpServers" | "servers";
  userPath: (env: Env) => string;
  projectPath?: (env: Env) => string;
  detect: (env: Env) => boolean;
  entry: (env: Env) => Record<string, unknown>;
  what?: string;
}): Agent {
  const pathFor = (env: Env, project: boolean) => (project && spec.projectPath ? spec.projectPath(env) : spec.userPath(env));
  return {
    id: spec.id,
    label: spec.label,
    what: spec.what ?? `MCP server entry in ${spec.key}`,
    detect: spec.detect,
    install(env, { project }) {
      const path = pathFor(env, project);
      const actions: Action[] = [];
      const existing = readJsonc<Record<string, Record<string, unknown>>>(path)?.[spec.key] ?? {};
      for (const legacy of ["astra-widgets"]) {
        if (existing[legacy]) {
          actions.push({ describe: `remove legacy "${legacy}" from ${path}`, apply: () => ({ ok: editJsonc(path, [spec.key, legacy], undefined).changed }) });
        }
      }
      actions.push({
        describe: `set "${SERVER_KEY}" in ${path}${isLegacyEntry(existing[SERVER_KEY]) ? " (replacing the legacy entry)" : ""}`,
        apply: () => {
          editJsonc(path, [spec.key, SERVER_KEY], spec.entry(env));
          return { ok: true, detail: path };
        },
      });
      return actions;
    },
    uninstall(env, { project }) {
      const path = pathFor(env, project);
      const servers = readJsonc<Record<string, Record<string, unknown>>>(path)?.[spec.key];
      if (!servers?.[SERVER_KEY]) return [];
      return [{ describe: `remove "${SERVER_KEY}" from ${path}`, apply: () => ({ ok: editJsonc(path, [spec.key, SERVER_KEY], undefined).changed }) }];
    },
    status(env, { project }) {
      try {
        const servers = readJsonc<Record<string, Record<string, unknown>>>(pathFor(env, project))?.[spec.key];
        const entry = servers?.[SERVER_KEY];
        if (!entry && !servers?.["astra-widgets"]) return "missing";
        return !entry || isLegacyEntry(entry) ? "legacy" : "configured";
      } catch {
        return "unknown";
      }
    },
  };
}

function claudeDesktopConfig(env: Env): string {
  if (env.platform === "darwin") return join(env.home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  if (env.platform === "win32") return join(env.env.APPDATA ?? join(env.home, "AppData", "Roaming"), "Claude", "claude_desktop_config.json");
  return join(env.env.XDG_CONFIG_HOME ?? join(env.home, ".config"), "Claude", "claude_desktop_config.json");
}

function vscodeUserDir(env: Env): string {
  if (env.platform === "darwin") return join(env.home, "Library", "Application Support", "Code", "User");
  if (env.platform === "win32") return join(env.env.APPDATA ?? join(env.home, "AppData", "Roaming"), "Code", "User");
  return join(env.env.XDG_CONFIG_HOME ?? join(env.home, ".config"), "Code", "User");
}

const claudeCode: Agent = {
  id: "claude-code",
  label: "Claude Code",
  what: "plugin: skills, hooks, MCP server (via the plugin marketplace)",
  detect: (env) => env.has("claude"),
  install(env) {
    return [
      {
        describe: `claude plugin marketplace add ${MARKETPLACE_REPO}`,
        apply: () => {
          const r = env.exec("claude", ["plugin", "marketplace", "add", MARKETPLACE_REPO]);
          // Already registered is fine.
          return { ok: r.ok || /already/i.test(r.stderr + r.stdout), detail: r.stderr.trim() || undefined };
        },
      },
      {
        describe: `claude plugin install ${PLUGIN_ID}`,
        apply: () => {
          const r = env.exec("claude", ["plugin", "install", PLUGIN_ID]);
          return { ok: r.ok || /already installed/i.test(r.stderr + r.stdout), detail: r.stderr.trim() || undefined };
        },
      },
    ];
  },
  uninstall(env) {
    return [{ describe: `claude plugin uninstall ${PLUGIN_ID}`, apply: () => ({ ok: env.exec("claude", ["plugin", "uninstall", PLUGIN_ID]).ok }) }];
  },
  status(env) {
    if (!env.has("claude")) return "unknown";
    const r = env.exec("claude", ["plugin", "list"]);
    if (!r.ok) return "unknown";
    return r.stdout.includes("astra-db") ? "configured" : "missing";
  },
};

const codex: Agent = {
  id: "codex",
  label: "OpenAI Codex",
  what: "plugin: skills, hooks, MCP server (via the plugin marketplace)",
  detect: (env) => env.has("codex"),
  install(env) {
    return [
      {
        describe: `codex plugin marketplace add ${MARKETPLACE_REPO}`,
        apply: () => {
          const r = env.exec("codex", ["plugin", "marketplace", "add", MARKETPLACE_REPO]);
          return { ok: r.ok || /already/i.test(r.stderr + r.stdout), detail: r.stderr.trim() || undefined };
        },
      },
      {
        describe: `codex plugin add ${PLUGIN_ID}`,
        apply: () => {
          const r = env.exec("codex", ["plugin", "add", PLUGIN_ID]);
          if (r.ok || /already/i.test(r.stderr + r.stdout)) return { ok: true };
          // Older Codex without plugins: fall back to a plain MCP server entry.
          const mcp = env.exec("codex", ["mcp", "add", SERVER_KEY, "--", "npx", "-y", SERVER_SPEC]);
          return { ok: mcp.ok, detail: mcp.ok ? "installed as an MCP server (this Codex has no plugin support)" : r.stderr.trim() };
        },
      },
    ];
  },
  uninstall(env) {
    return [{
      describe: `codex plugin remove ${PLUGIN_ID}`,
      apply: () => {
        const r = env.exec("codex", ["plugin", "remove", PLUGIN_ID]);
        if (r.ok) return { ok: true };
        return { ok: env.exec("codex", ["mcp", "remove", SERVER_KEY]).ok };
      },
    }];
  },
  status(env) {
    const config = readText(join(env.env.CODEX_HOME ?? join(env.home, ".codex"), "config.toml"));
    if (config === undefined) return env.has("codex") ? "missing" : "unknown";
    return /astra-db/.test(config) ? "configured" : "missing";
  },
};

const cursor = jsonAgent({
  id: "cursor",
  label: "Cursor",
  key: "mcpServers",
  userPath: (env) => join(env.home, ".cursor", "mcp.json"),
  projectPath: (env) => join(env.cwd, ".cursor", "mcp.json"),
  detect: (env) => existsSync(join(env.home, ".cursor")) || env.has("cursor"),
  entry: (env) => mcpEntry(env.platform, { env: { ASTRA_MCP_PROJECT_DIR: "${workspaceFolder}", ASTRA_MCP_CLIENT: "cursor" } }),
});

const vscode: Agent = (() => {
  const base = jsonAgent({
    id: "vscode",
    label: "VS Code (Copilot)",
    key: "servers",
    userPath: (env) => join(vscodeUserDir(env), "mcp.json"),
    projectPath: (env) => join(env.cwd, ".vscode", "mcp.json"),
    detect: (env) => env.has("code") || existsSync(vscodeUserDir(env)),
    entry: (env) => ({ type: "stdio", ...mcpEntry(env.platform), env: { ASTRA_MCP_PROJECT_DIR: "${workspaceFolder}", ASTRA_MCP_CLIENT: "vscode" } }),
  });
  return {
    ...base,
    install(env, options) {
      if (options.project || !env.has("code")) return base.install(env, options);
      const entry = { name: SERVER_KEY, type: "stdio", ...mcpEntry(env.platform), env: { ASTRA_MCP_PROJECT_DIR: "${workspaceFolder}", ASTRA_MCP_CLIENT: "vscode" } };
      return [{
        describe: "code --add-mcp (user profile)",
        apply: () => {
          const r = env.exec("code", ["--add-mcp", JSON.stringify(entry)]);
          if (r.ok) return { ok: true };
          return base.install(env, options).reduce((acc, action) => (acc.ok ? action.apply() : acc), { ok: true } as { ok: boolean; detail?: string });
        },
      }];
    },
  };
})();

const windsurf = jsonAgent({
  id: "windsurf",
  label: "Windsurf",
  key: "mcpServers",
  userPath: (env) => join(env.home, ".codeium", "windsurf", "mcp_config.json"),
  detect: (env) => existsSync(join(env.home, ".codeium", "windsurf")),
  entry: (env) => mcpEntry(env.platform, { env: { ASTRA_MCP_CLIENT: "windsurf" } }),
});

const claudeDesktop = jsonAgent({
  id: "claude-desktop",
  label: "Claude Desktop",
  key: "mcpServers",
  userPath: claudeDesktopConfig,
  detect: (env) => existsSync(join(claudeDesktopConfig(env), "..")),
  entry: (env) => mcpEntry(env.platform, { env: { ASTRA_MCP_CLIENT: "claude-desktop" } }),
  what: "MCP server entry (credentials from `astra-mcp login --global`; or install the .mcpb bundle)",
});

const gemini = jsonAgent({
  id: "gemini",
  label: "Gemini CLI",
  key: "mcpServers",
  userPath: (env) => join(env.home, ".gemini", "settings.json"),
  projectPath: (env) => join(env.cwd, ".gemini", "settings.json"),
  detect: (env) => env.has("gemini") || existsSync(join(env.home, ".gemini")),
  entry: (env) => mcpEntry(env.platform, { env: { ASTRA_MCP_CLIENT: "gemini" } }),
});

/** Bob is handled by bob.ts; this entry only carries metadata for init/doctor. */
export const bobAgent: Omit<Agent, "install" | "uninstall" | "status"> = {
  id: "bob",
  label: "IBM Bob",
  what: "bundle: skills, /astra-* commands, custom modes, rules, hooks, MCP server",
  detect: (env) => existsSync(join(env.home, ".bob")) || existsSync(join(env.cwd, ".bob")) || env.has("bob"),
};

export const AGENTS: Agent[] = [claudeCode, codex, cursor, vscode, windsurf, claudeDesktop, gemini];

export const ALL_AGENT_IDS: AgentId[] = [...AGENTS.map((a) => a.id), "bob"];
