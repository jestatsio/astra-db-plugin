/**
 * IBM Bob bundle, generated from the plugin's single source of skills:
 *   knowledge skills → .bob/skills/<name>/
 *   workflow skills  → .bob/commands/astra-<name>.md   (/astra-<name>)
 *   persona skills   → custom modes (astra-<name>) with groups read/command/mcp
 *   + rules/astra-db.md, the MCP server, and lifecycle hooks.
 * Merges into existing config between `astra-db` markers and records what it
 * wrote in astra-db.manifest.json so `uninstall` can reverse it exactly.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { strToU8, zipSync } from "fflate";
import { type Assets, filesUnder } from "../assets.js";
import { SERVER_KEY, SERVER_SPEC, mergeMcpEntry } from "./agents.js";
import { editJsonc, readJsonc, readText } from "./fsutil.js";

const BEGIN = "# astra-db:begin (managed by astra-mcp — edits between these markers are overwritten)";
const END = "# astra-db:end";
const READ_TOOLS = [
  "connection_status", "list_databases", "database_overview", "describe_collection", "describe_table", "find",
  "vector_search", "count", "distinct_values", "list_vectorize_providers", "code_examples",
];

export interface SkillDoc {
  name: string;
  description: string;
  kind: "knowledge" | "workflow" | "persona";
  fields: Record<string, string>;
  metadata: Record<string, string>;
  body: string;
  files: Record<string, string>;
}

/** Parse SKILL.md frontmatter (flat keys plus a one-level `metadata:` map). */
export function parseSkill(raw: string): { fields: Record<string, string>; metadata: Record<string, string>; body: string } {
  const text = raw.replace(/\r\n/g, "\n");
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { fields: {}, metadata: {}, body: text };
  const fields: Record<string, string> = {};
  const metadata: Record<string, string> = {};
  let inMetadata = false;
  for (const line of match[1].split("\n")) {
    const nested = line.match(/^\s+([A-Za-z0-9_-]+):\s*(.*)$/);
    if (inMetadata && nested) {
      metadata[nested[1]] = nested[2].replace(/^["']|["']$/g, "");
      continue;
    }
    const top = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!top) continue;
    inMetadata = top[1] === "metadata" && top[2] === "";
    if (!inMetadata) fields[top[1]] = top[2].replace(/^["']|["']$/g, "");
  }
  return { fields, metadata, body: match[2] };
}

export function skillsFromAssets(assets: Assets): SkillDoc[] {
  const all = filesUnder(assets, "skills");
  const names = [...new Set(Object.keys(all).map((p) => p.split("/")[0]))].filter((n) => all[`${n}/SKILL.md`]);
  return names.sort().map((name) => {
    const { fields, metadata, body } = parseSkill(all[`${name}/SKILL.md`]);
    const files = Object.fromEntries(Object.entries(all).filter(([p]) => p.startsWith(`${name}/`)).map(([p, v]) => [p.slice(name.length + 1), v]));
    const kind = (metadata.kind as SkillDoc["kind"]) ?? "knowledge";
    return { name, description: fields.description ?? "", kind, fields, metadata, body, files };
  });
}

const yamlString = (value: string) => JSON.stringify(value);

function indentBlock(text: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return text.split("\n").map((line) => (line ? pad + line : line)).join("\n");
}

export function customModesBlock(personas: SkillDoc[], itemIndent: number): string {
  const lines = [BEGIN];
  for (const p of personas) {
    const groups = (p.metadata["bob-groups"] ?? "read command mcp").split(/[\s,]+/).filter(Boolean);
    const title = p.metadata["bob-name"] ?? `Astra ${p.name.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ")}`;
    const [role, ...rest] = p.body.trim().split(/\n\s*\n/);
    lines.push(
      `- slug: astra-${p.name}`,
      `  name: ${yamlString(title)}`,
      `  roleDefinition: ${yamlString(role.replace(/^#.*\n/, "").trim())}`,
      `  whenToUse: ${yamlString(p.description)}`,
      `  description: ${yamlString(p.description.split(". ")[0])}`,
      `  customInstructions: |-\n${indentBlock(bobLinks(rest.join("\n\n"), []), 4)}`,
      `  groups:\n${groups.map((g) => `    - ${g}`).join("\n")}`,
    );
  }
  lines.push(END);
  return indentBlock(lines.join("\n"), itemIndent);
}

/** Merge our marker block into a custom_modes.yaml text. */
export function mergeCustomModes(existing: string | undefined, personas: SkillDoc[]): string {
  const text = existing?.trim() ? existing : "customModes:\n";
  const markerPattern = /^[ \t]*# astra-db:begin[^\n]*\n[\s\S]*?^[ \t]*# astra-db:end[^\n]*\n?/m;
  const withoutOld = text.replace(markerPattern, "");
  const keyLine = withoutOld.match(/^customModes:[ \t]*(\[\])?[ \t]*$/m);
  if (!keyLine) return `${withoutOld.replace(/\n*$/, "\n")}customModes:\n${customModesBlock(personas, 2)}\n`;
  const after = withoutOld.slice((keyLine.index ?? 0) + keyLine[0].length);
  const firstItem = after.match(/^\n([ \t]*)- /);
  const indent = firstItem ? firstItem[1].length : 2;
  const head = withoutOld.slice(0, keyLine.index).concat("customModes:");
  return `${head}\n${customModesBlock(personas, indent)}${after.startsWith("\n") ? after : `\n${after}`}`.replace(/\n*$/, "\n");
}

/** Rewrite sibling-skill links and Claude slash commands for Bob's layout. */
export function bobLinks(text: string, skills: SkillDoc[]): string {
  let out = text
    .replace(/\.\.\/astra-toolkit\//g, ".bob/skills/astra-toolkit/")
    .replace(/\.\.\/astra-widgets\//g, ".bob/skills/astra-widgets/")
    .replace(/\/astra-db:([a-z-]+)/g, "/astra-$1");
  for (const skill of skills) {
    const target = skill.kind === "workflow" ? `.bob/commands/astra-${skill.name}.md` : skill.kind === "persona" ? ".bob/custom_modes.yaml" : null;
    if (target) out = out.split(`../${skill.name}/SKILL.md`).join(target);
  }
  return out;
}

export function commandFile(skill: SkillDoc, skills: SkillDoc[] = []): string {
  const body = bobLinks(skill.body, skills);
  return `---\ndescription: ${yamlString(skill.description)}\n${skill.fields["argument-hint"] ? `argument-hint: ${yamlString(skill.fields["argument-hint"])}\n` : ""}---\n${body}`;
}

const RULE = `# Astra DB credentials

- Application code reads \`ASTRA_DB_APPLICATION_TOKEN\` and \`ASTRA_DB_API_ENDPOINT\` (and optionally \`ASTRA_DB_KEYSPACE\`) from the environment — typically a git-ignored \`.env\`.
- Never write an \`AstraCS:\` token into source, config, or docs, and never ask the user to paste one into the chat. To connect, the user runs \`npx -y @erichare/astra-mcp login\` in their own terminal.
- Destructive database operations (drops, bulk deletes/updates) need the user's explicit confirmation first.
`;

export interface BobLayout {
  root: string;
  global: boolean;
  skillsDir: string;
  commandsDir: string;
  modesFile: string;
  mcpFile: string;
  rulesDir: string;
  hooksDir: string;
  settingsFile: string;
}

export function bobLayout(root: string, global: boolean): BobLayout {
  if (!global) {
    return {
      root, global, skillsDir: join(root, "skills"), commandsDir: join(root, "commands"), modesFile: join(root, "custom_modes.yaml"),
      mcpFile: join(root, "mcp.json"), rulesDir: join(root, "rules"), hooksDir: join(root, "hooks", "astra-db"), settingsFile: join(root, "settings.json"),
    };
  }
  const mcpCandidates = [join(root, "settings", "mcp.json"), join(root, "mcp_settings.json"), join(root, "mcp.json")];
  return {
    root, global, skillsDir: join(root, "skills"), commandsDir: join(root, "commands"), modesFile: join(root, "settings", "custom_modes.yaml"),
    mcpFile: mcpCandidates.find((p) => existsSync(p)) ?? mcpCandidates[0], rulesDir: join(root, "rules"),
    hooksDir: join(root, "hooks", "astra-db"), settingsFile: join(root, "settings", "settings.json"),
  };
}

export interface BobPlan {
  files: Record<string, string>;
  merges: string[];
}

/** Everything the bundle writes: whole files (ours) plus merges into shared config. */
export function planBob(assets: Assets, layout: BobLayout): BobPlan {
  const skills = skillsFromAssets(assets);
  const files: Record<string, string> = {};
  for (const skill of skills.filter((s) => s.kind === "knowledge")) {
    for (const [path, content] of Object.entries(skill.files)) files[join(layout.skillsDir, skill.name, path)] = content;
  }
  for (const skill of skills.filter((s) => s.kind === "workflow")) {
    files[join(layout.commandsDir, `astra-${skill.name}.md`)] = commandFile(skill, skills);
  }
  files[join(layout.rulesDir, "astra-db.md")] = RULE;
  for (const [path, content] of Object.entries(filesUnder(assets, "hooks"))) {
    if (path.endsWith(".mjs")) files[join(layout.hooksDir, path)] = content;
  }
  return { files, merges: [layout.modesFile, layout.mcpFile, layout.settingsFile] };
}

function hookCommand(layout: BobLayout, script: string): string {
  const path = layout.global ? join(layout.hooksDir, script) : relative(dirname(layout.root), join(layout.hooksDir, script));
  return `node ${JSON.stringify(path)} --host=bob`;
}

export interface BobResult {
  written: string[];
  merged: string[];
  manifest: string;
}

export function installBob(assets: Assets, layout: BobLayout): BobResult {
  const plan = planBob(assets, layout);
  const skills = skillsFromAssets(assets);
  const written: string[] = [];
  for (const [path, content] of Object.entries(plan.files)) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
    written.push(path);
  }

  mkdirSync(dirname(layout.modesFile), { recursive: true });
  writeFileSync(layout.modesFile, mergeCustomModes(readText(layout.modesFile), skills.filter((s) => s.kind === "persona")));

  const existing = readJsonc<Record<string, Record<string, unknown>>>(layout.mcpFile)?.mcpServers?.[SERVER_KEY];
  editJsonc(layout.mcpFile, ["mcpServers", SERVER_KEY], mergeMcpEntry(existing, {
    command: "npx", args: ["-y", SERVER_SPEC], env: { ASTRA_MCP_CLIENT: "bob" }, alwaysAllow: READ_TOOLS, disabled: false,
  }));
  const settings = readJsonc<{ hooks?: Record<string, unknown[]> }>(layout.settingsFile) ?? {};
  const strip = (entries: unknown[] | undefined) => (entries ?? []).filter((e) => !JSON.stringify(e).includes("astra-db"));
  editJsonc(layout.settingsFile, ["hooks", "PreToolUse"], [...strip(settings.hooks?.PreToolUse), {
    matcher: ".*", hooks: [{ type: "command", command: hookCommand(layout, "credential-guard.mjs"), timeout: 10 }],
  }]);
  editJsonc(layout.settingsFile, ["hooks", "SessionStart"], [...strip(settings.hooks?.SessionStart), {
    hooks: [{ type: "command", command: hookCommand(layout, "session-start.mjs"), timeout: 10 }],
  }]);

  const manifest = join(layout.root, "astra-db.manifest.json");
  writeFileSync(manifest, `${JSON.stringify({ version: assets.version, files: written.map((p) => relative(layout.root, p)), merged: plan.merges.map((p) => relative(layout.root, p)) }, null, 2)}\n`);
  return { written, merged: plan.merges, manifest };
}

/** Remove `dir` and its parents while they are empty, stopping at `stop`. */
function pruneEmptyDirs(dir: string, stop: string): void {
  let current = dir;
  while (current.startsWith(stop) && current !== stop) {
    try {
      if (readdirSync(current).length > 0) return;
      rmSync(current, { recursive: true });
    } catch {
      return;
    }
    current = dirname(current);
  }
}

export function uninstallBob(layout: BobLayout): string[] {
  const manifestPath = join(layout.root, "astra-db.manifest.json");
  if (!existsSync(manifestPath)) return [];
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { files: string[] };
  const removed: string[] = [];
  for (const rel of manifest.files) {
    const path = join(layout.root, rel);
    if (existsSync(path)) {
      rmSync(path);
      removed.push(path);
    }
  }
  // Only files the manifest lists are ours; a directory goes only once nothing else is left in it.
  for (const path of removed) pruneEmptyDirs(dirname(path), layout.root);
  const modes = readText(layout.modesFile);
  if (modes !== undefined) writeFileSync(layout.modesFile, modes.replace(/^[ \t]*# astra-db:begin[^\n]*\n[\s\S]*?^[ \t]*# astra-db:end[^\n]*\n?/m, ""));
  if (readJsonc<Record<string, Record<string, unknown>>>(layout.mcpFile)?.mcpServers?.[SERVER_KEY]) editJsonc(layout.mcpFile, ["mcpServers", SERVER_KEY], undefined);
  const settings = readJsonc<{ hooks?: Record<string, unknown[]> }>(layout.settingsFile);
  for (const event of ["PreToolUse", "SessionStart"]) {
    const entries = settings?.hooks?.[event];
    if (entries) editJsonc(layout.settingsFile, ["hooks", event], entries.filter((e) => !JSON.stringify(e).includes("astra-db")));
  }
  rmSync(manifestPath);
  // Drop directories we emptied (never ones the user still has files in).
  for (const dir of [layout.commandsDir, layout.rulesDir, layout.skillsDir, dirname(layout.hooksDir)]) {
    try {
      if (existsSync(dir) && readdirSync(dir).length === 0) rmSync(dir, { recursive: true });
    } catch {
      // leave it
    }
  }
  return removed;
}

/** A zip of the project-layout bundle (release asset): unzip in a project root. */
export function bobZip(assets: Assets): Uint8Array {
  const layout = bobLayout(".bob", false);
  const plan = planBob(assets, layout);
  const skills = skillsFromAssets(assets);
  const entries: Record<string, Uint8Array> = {};
  for (const [path, content] of Object.entries(plan.files)) entries[path.replace(/\\/g, "/")] = strToU8(content);
  entries[".bob/custom_modes.yaml"] = strToU8(mergeCustomModes(undefined, skills.filter((s) => s.kind === "persona")));
  entries[".bob/mcp.json"] = strToU8(`${JSON.stringify({ mcpServers: { [SERVER_KEY]: { command: "npx", args: ["-y", SERVER_SPEC], env: { ASTRA_MCP_CLIENT: "bob" }, alwaysAllow: READ_TOOLS, disabled: false } } }, null, 2)}\n`);
  entries[".bob/settings.json"] = strToU8(`${JSON.stringify({ hooks: {
    PreToolUse: [{ matcher: ".*", hooks: [{ type: "command", command: "node \".bob/hooks/astra-db/credential-guard.mjs\" --host=bob", timeout: 10 }] }],
    SessionStart: [{ hooks: [{ type: "command", command: "node \".bob/hooks/astra-db/session-start.mjs\" --host=bob", timeout: 10 }] }],
  } }, null, 2)}\n`);
  return zipSync(entries, { level: 9 });
}
