import assert from "node:assert/strict";
import { test } from "node:test";
import { npmPublication, registryPublication, waitForPublication } from "../scripts/verify-publication.mjs";

const pkg = {
  name: "@erichare/astra-mcp", version: "2.1.0", mcpName: "io.github.jestatsio/astra-mcp",
  repository: { type: "git", url: "git+https://github.com/jestatsio/astra-db-plugin.git", directory: "server" },
};
const server = {
  name: pkg.mcpName, version: pkg.version, title: "JEStats Astra DB Plugin", description: "Unofficial Astra DB integration.",
  repository: { url: "https://github.com/jestatsio/astra-db-plugin", source: "github", subfolder: "server" },
  websiteUrl: "https://github.com/jestatsio/astra-db-plugin",
  icons: [{ src: "https://example.test/icon.png", mimeType: "image/png", sizes: ["512x512"] }],
  packages: [{
    registryType: "npm", identifier: pkg.name, version: pkg.version, transport: { type: "stdio" },
    environmentVariables: [{ name: "ASTRA_DB_APPLICATION_TOKEN", isSecret: true, isRequired: false }],
  }],
  remotes: [{ type: "streamable-http", url: "https://example.test/mcp" }],
};
const respond = (value, status = 200) => async () => new Response(JSON.stringify(value), { status });
const registryResponse = (value = server) => ({
  server: value,
  _meta: { "io.modelcontextprotocol.registry/official": { status: "active", updatedAt: "2026-09-29T00:00:00Z" } },
});

test("npm lookup encodes the exact package/version and accepts matching publication metadata", async () => {
  const fetchImpl = async (url, options) => {
    assert.equal(url, "https://registry.npmjs.org/%40erichare%2Fastra-mcp/2.1.0");
    assert.equal(options.redirect, "error");
    assert.ok(options.signal);
    return new Response(JSON.stringify({ ...pkg, gitHead: "release-head" }));
  };
  assert.equal(await npmPublication(pkg, { fetchImpl, expectedSha: "release-head" }), "existing");
});

test("only a 404 is an absent publication; HTTP and network failures fail closed", async () => {
  for (const check of [npmPublication.bind(null, pkg), registryPublication.bind(null, server)]) {
    assert.equal(await check({ fetchImpl: respond({}, 404) }), "missing");
    for (const status of [401, 403, 429, 500]) {
      await assert.rejects(check({ fetchImpl: respond({}, status) }), new RegExp(`HTTP ${status}`));
    }
    await assert.rejects(check({ fetchImpl: async () => { throw new Error("offline"); } }), /offline/);
    await assert.rejects(check({ fetchImpl: async () => new Response("not JSON") }), /JSON/i);
    for (const malformed of [null, [], "missing"]) {
      await assert.rejects(check({ fetchImpl: respond(malformed) }), /metadata object/);
    }
  }
});

test("npm reruns reject a different namespace, owner, directory, version, package, or release commit", async () => {
  const variants = [
    { ...pkg, mcpName: "io.github.erichare/astra-mcp" },
    { ...pkg, repository: { ...pkg.repository, url: "git+https://github.com/erichare/astra-db-plugin.git" } },
    { ...pkg, repository: { ...pkg.repository, directory: "other" } },
    { ...pkg, version: "2.0.0" },
    { ...pkg, name: "@other/astra-mcp" },
    { ...pkg, gitHead: "different-head" },
  ];
  for (const published of variants) {
    await assert.rejects(npmPublication(pkg, { fetchImpl: respond(published), expectedSha: "release-head" }), /does not match/);
  }
});

test("npm repository URL spelling is normalized without allowing a different owner", async () => {
  const published = { ...pkg, repository: { ...pkg.repository, url: "https://github.com/jestatsio/astra-db-plugin" } };
  assert.equal(await npmPublication(pkg, { fetchImpl: respond(published) }), "existing");
});

test("registry lookup verifies the exact version and tolerates omitted false schema defaults", async () => {
  const published = structuredClone(server);
  delete published.packages[0].environmentVariables[0].isRequired;
  const fetchImpl = async (url) => {
    assert.equal(url, "https://registry.modelcontextprotocol.io/v0.1/servers/io.github.jestatsio%2Fastra-mcp/versions/2.1.0");
    return new Response(JSON.stringify(registryResponse(published)));
  };
  assert.equal(await registryPublication(server, { fetchImpl }), "existing");
});

test("registry reruns reject changed package identity, transport, ownership, branding, or endpoint", async () => {
  for (const mutate of [
    (s) => { s.name = "io.github.erichare/astra-mcp"; },
    (s) => { s.version = "2.0.0"; },
    (s) => { s.repository.url = "https://github.com/erichare/astra-db-plugin"; },
    (s) => { s.packages[0].identifier = "@other/astra-mcp"; },
    (s) => { s.packages[0].version = "2.0.0"; },
    (s) => { s.packages[0].transport.type = "sse"; },
    (s) => { s.packages[0].environmentVariables[0].isRequired = true; },
    (s) => { s.title = "Official Astra DB"; },
    (s) => { s.icons[0].src = "https://example.test/old.png"; },
    (s) => { s.remotes[0].url = "https://other.test/mcp"; },
  ]) {
    const published = structuredClone(server);
    mutate(published);
    await assert.rejects(registryPublication(server, { fetchImpl: respond(registryResponse(published)) }), /does not match/);
  }
});

test("registry verification rejects malformed or withdrawn records", async () => {
  await assert.rejects(registryPublication(server, { fetchImpl: respond({}) }), /server/i);
  const withdrawn = registryResponse();
  withdrawn._meta["io.modelcontextprotocol.registry/official"].status = "deleted";
  await assert.rejects(registryPublication(server, { fetchImpl: respond(withdrawn) }), /active/);
});

test("approval polling waits for public identity and never accepts a lookup error", async () => {
  let elapsed = 0;
  let lookups = 0;
  const clock = { timeoutMs: 100, pollIntervalMs: 30, now: () => elapsed, sleep: async (ms) => { elapsed += ms; } };
  assert.equal(await waitForPublication(async (budget) => {
    assert.ok(budget > 0 && budget <= 100);
    return ++lookups === 3 ? "existing" : "missing";
  }, clock), "existing");
  assert.equal(elapsed, 60);
  await assert.rejects(waitForPublication(async () => { throw new Error("HTTP 403"); }, clock), /HTTP 403/);
  assert.equal(elapsed, 60);
});

test("approval polling has a bounded deadline", async () => {
  let elapsed = 0;
  await assert.rejects(waitForPublication(async () => "missing", {
    timeoutMs: 100, pollIntervalMs: 30, now: () => elapsed, sleep: async (ms) => { elapsed += ms; },
  }), /deadline/);
  assert.equal(elapsed, 100);
});
