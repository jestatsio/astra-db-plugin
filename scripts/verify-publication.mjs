#!/usr/bin/env node
// Read back an exact npm/MCP Registry version before skipping publication or
// announcing a release. Only 404 means absent; auth/network/metadata errors fail.
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout } from "node:timers/promises";
import { REPO_ROOT } from "./lib/versions.mjs";

async function readPublication(url, fetchImpl, requestTimeoutMs) {
  const response = await fetchImpl(url, { redirect: "error", signal: AbortSignal.timeout(requestTimeoutMs) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Publication lookup failed (HTTP ${response.status}): ${url}`);
  const metadata = await response.json();
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) throw new Error(`Publication response has no metadata object: ${url}`);
  return metadata;
}

function requireMatch(actual, expected, field) {
  if (!isDeepStrictEqual(actual, expected)) throw new Error(`Published ${field} does not match this release. Use a new version rather than replacing published metadata.`);
}

function repositoryUrl(repository) {
  if (typeof repository?.url !== "string") throw new Error("Publication repository URL is missing.");
  return repository.url.replace(/^git\+/, "").replace(/\.git\/?$/, "").replace(/\/$/, "");
}

export async function npmPublication(pkg, { fetchImpl = fetch, expectedSha, requestTimeoutMs = 15_000 } = {}) {
  const url = `https://registry.npmjs.org/${encodeURIComponent(pkg.name)}/${encodeURIComponent(pkg.version)}`;
  const published = await readPublication(url, fetchImpl, requestTimeoutMs);
  if (published === null) return "missing";
  for (const field of ["name", "version", "mcpName"]) requireMatch(published[field], pkg[field], `npm ${field}`);
  requireMatch(repositoryUrl(published.repository), repositoryUrl(pkg.repository), "npm repository");
  requireMatch(published.repository.directory, pkg.repository.directory, "npm repository directory");
  if (expectedSha) requireMatch(published.gitHead, expectedSha, "npm source commit");
  return "existing";
}

// The registry omits false booleans that have a schema default of false.
// Compare the public metadata, excluding registry-managed timestamps/$schema.
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([key, v]) => v !== undefined && !(v === false && ["isRequired", "isSecret", "isRepeated"].includes(key)))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => [key, canonical(v)]));
  }
  return value;
}

export async function registryPublication(server, { fetchImpl = fetch, requestTimeoutMs = 15_000 } = {}) {
  const url = `https://registry.modelcontextprotocol.io/v0.1/servers/${encodeURIComponent(server.name)}/versions/${encodeURIComponent(server.version)}`;
  const published = await readPublication(url, fetchImpl, requestTimeoutMs);
  if (published === null) return "missing";
  if (!published.server || typeof published.server !== "object") throw new Error("Registry response has no server metadata.");
  const status = published._meta?.["io.modelcontextprotocol.registry/official"]?.status;
  if (status && status !== "active") throw new Error(`Published registry version is ${status}, not active.`);
  for (const field of ["name", "version", "title", "description", "repository", "websiteUrl", "icons", "packages", "remotes"]) {
    requireMatch(canonical(published.server[field]), canonical(server[field]), `registry ${field}`);
  }
  return "existing";
}

/** Poll only absent records; authentication, connectivity, and identity errors stop immediately. */
export async function waitForPublication(check, {
  timeoutMs, pollIntervalMs, now = Date.now, sleep = setTimeout,
  timeoutMessage = "Publication did not become public before the deadline.",
}) {
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    const state = await check(Math.max(1, Math.min(15_000, deadline - now())));
    if (state === "existing") return state;
    const remaining = deadline - now();
    if (remaining > 0) await sleep(Math.min(pollIntervalMs, remaining));
  }
  throw new Error(timeoutMessage);
}

async function main(args) {
  const [target, ...flags] = args;
  if (!["npm", "registry"].includes(target) || flags.some((flag) => !["--allow-missing", "--wait", "--wait-for-approval"].includes(flag))
    || (flags.includes("--wait-for-approval") && target !== "npm")) {
    throw new Error("usage: verify-publication.mjs <npm|registry> [--allow-missing|--wait|--wait-for-approval]");
  }
  const expected = JSON.parse(readFileSync(join(REPO_ROOT, "server", target === "npm" ? "package.json" : "server.json"), "utf8"));
  const check = target === "npm"
    ? (requestTimeoutMs) => npmPublication(expected, { expectedSha: process.env.GITHUB_SHA, requestTimeoutMs })
    : (requestTimeoutMs) => registryPublication(expected, { requestTimeoutMs });
  if (flags.includes("--wait") || flags.includes("--wait-for-approval")) {
    const approval = flags.includes("--wait-for-approval");
    if (approval) console.error("Waiting up to 20 minutes for a maintainer to approve this npm version with 2FA on npmjs.com.");
    console.log(await waitForPublication(check, {
      timeoutMs: approval ? 20 * 60_000 : 60_000,
      pollIntervalMs: approval ? 30_000 : 10_000,
      timeoutMessage: approval
        ? "Publication did not become public before the deadline. Approve the expected staged package on npmjs.com, then rerun the failed jobs."
        : `Expected ${target} publication ${expected.name}@${expected.version} was not found before the deadline.`,
    }));
    return;
  }
  const state = await check();
  if (state === "missing" && !flags.includes("--allow-missing")) throw new Error(`Expected ${target} publication ${expected.name}@${expected.version} was not found.`);
  console.log(state);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(`publication verification failed: ${err.message}`);
    process.exitCode = 1;
  });
}
