#!/usr/bin/env node
// Stage and pack the Claude Desktop MCP Bundle (.mcpb) from the built dist/.
//   node scripts/stage-mcpb.mjs            → dist/astra-db-<version>.mcpb (+ dist/astra-db.mcpb)
import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
if (!existsSync(join(root, "dist/cli.js"))) throw new Error("run `npm run build` first");

const stage = join(root, "dist/mcpb");
rmSync(stage, { recursive: true, force: true });
mkdirSync(join(stage, "server"), { recursive: true });
const manifest = JSON.parse(readFileSync(join(root, "mcpb/manifest.json"), "utf8"));
manifest.version = pkg.version;
writeFileSync(join(stage, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
copyFileSync(join(root, "..", "assets/icon-v2.png"), join(stage, "icon.png"));
copyFileSync(join(root, "dist/cli.js"), join(stage, "server/cli.js"));
copyFileSync(join(root, "dist/assets.json"), join(stage, "server/assets.json"));
if (existsSync(join(root, "THIRD_PARTY_NOTICES.md"))) cpSync(join(root, "THIRD_PARTY_NOTICES.md"), join(stage, "THIRD_PARTY_NOTICES.md"));
cpSync(join(root, "..", "LICENSE"), join(stage, "LICENSE"));

const mcpb = ["-y", "@anthropic-ai/mcpb@2.1.2"];
execFileSync("npx", [...mcpb, "validate", join(stage, "manifest.json")], { stdio: "inherit" });
const out = join(root, `dist/astra-db-${pkg.version}.mcpb`);
execFileSync("npx", [...mcpb, "pack", stage, out], { stdio: "inherit" });
copyFileSync(out, join(root, "dist/astra-db.mcpb"));
console.log(`packed ${out}`);
