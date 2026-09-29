import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { describe, expect, it } from "vitest";
import { assertPublicHost, resolveMetadataClient } from "../src/http/oauth/cimd.js";
import { type Secrets, open, pkceMatches, seal } from "../src/http/crypto.js";
import { createHttpHandler, credentialsFromRequest } from "../src/http/handler.js";
import { handleOAuthRequest } from "../src/http/oauth/router.js";
import type { OAuthDeps } from "../src/http/oauth/types.js";
import { createFakeState, fakeGateway } from "./fake.js";
import { ENDPOINT, TOKEN } from "./helpers.js";

const ORIGIN = "https://astra-mcp.test";
const SECRETS: Secrets = { current: "test-secret-current" };

function handler() {
  const state = createFakeState();
  return { state, fetchMcp: createHttpHandler({ secrets: SECRETS, gateway: fakeGateway(state) }) };
}

async function httpClient(
  fetchMcp: (req: Request) => Promise<Response>,
  headers: Record<string, string>,
  mode: "legacy" | "auto" | { pin: string } = "auto",
  elicit?: (params: Record<string, unknown>) => Record<string, unknown>,
) {
  const transport = new StreamableHTTPClientTransport(new URL(`${ORIGIN}/mcp`), {
    requestInit: { headers },
    fetch: (url: string | URL | Request, init?: RequestInit) => fetchMcp(new Request(url as string, init)),
  });
  const client = new Client({ name: "http-test", version: "1" }, {
    versionNegotiation: { mode } as never,
    capabilities: elicit ? { elicitation: { form: {} } } : {},
  });
  if (elicit) client.setRequestHandler("elicitation/create", async (request) => elicit(request.params as Record<string, unknown>) as never);
  await client.connect(transport);
  return client;
}

describe("hosted MCP endpoint", () => {
  it("rejects unauthenticated requests with a resource-metadata challenge", async () => {
    const { fetchMcp } = handler();
    const res = await fetchMcp(new Request(`${ORIGIN}/mcp`, { method: "POST", body: "{}" }));
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain(`resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource"`);
    expect(res.headers.get("access-control-expose-headers")).toContain("www-authenticate");
    const bad = await fetchMcp(new Request(`${ORIGIN}/mcp`, { method: "POST", body: "{}", headers: { authorization: "Bearer aw2.x.y.z" } }));
    expect(bad.status).toBe(401);
    const preflight = await fetchMcp(new Request(`${ORIGIN}/mcp`, { method: "OPTIONS" }));
    expect(preflight.status).toBe(204);
  });

  it("parses raw bearer credentials; writes only with the opt-in header", () => {
    const read = credentialsFromRequest(new Request(`${ORIGIN}/mcp?endpoint=${encodeURIComponent(ENDPOINT)}&keyspace=ks`, { headers: { authorization: `Bearer ${TOKEN}` } }));
    expect(read).toMatchObject({ creds: { token: TOKEN, endpoint: ENDPOINT, keyspace: "ks" }, scopes: ["astra:read"] });
    const write = credentialsFromRequest(new Request(`${ORIGIN}/mcp`, { headers: { authorization: `Bearer ${TOKEN}`, "x-astra-allow-writes": "true" } }));
    expect(write?.scopes).toContain("astra:write");
    expect(credentialsFromRequest(new Request(`${ORIGIN}/mcp`))).toBeNull();
  });

  it("refuses request endpoints outside Astra's domains", async () => {
    const { fetchMcp } = handler();
    const res = await fetchMcp(new Request(`${ORIGIN}/mcp`, {
      method: "POST", body: "{}", headers: { authorization: `Bearer ${TOKEN}`, "x-astra-endpoint": "https://169.254.169.254" },
    }));
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("Astra Data API endpoint");
  });

  for (const mode of ["legacy", "auto"] as const) {
    it(`serves read-only tools to raw bearer callers (${mode} era)`, async () => {
      const { fetchMcp } = handler();
      const client = await httpClient(fetchMcp, { authorization: `Bearer ${TOKEN}`, "x-astra-endpoint": ENDPOINT }, mode);
      const { tools } = await client.listTools();
      expect(tools).toHaveLength(11);
      expect(JSON.stringify(tools.find((t) => t.name === "find")!.inputSchema)).not.toContain("html_file");
      const r = await client.callTool({ name: "describe_collection", arguments: { collection: "articles" } });
      expect((r.structuredContent as { view: string }).view).toBe("collection");
      await client.close();
    });
  }

  it("serves write tools with X-Astra-Allow-Writes and confirms drops via multi-round-trip elicitation", async () => {
    const { fetchMcp, state } = handler();
    const headers = { authorization: `Bearer ${TOKEN}`, "x-astra-endpoint": ENDPOINT, "x-astra-allow-writes": "true" };
    const prompts: string[] = [];
    const client = await httpClient(fetchMcp, headers, { pin: "2026-07-28" }, (params) => {
      prompts.push(String(params.message));
      return { action: "accept", content: { confirm: "plain" } };
    });
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(18);
    const r = await client.callTool({ name: "drop", arguments: { kind: "collection", name: "plain" } });
    expect(r.structuredContent).toMatchObject({ operation: "dropCollection", status: "ok" });
    expect(prompts[0]).toContain("Type \"plain\" to confirm");
    expect(state.keyspaces.get("default_keyspace")!.collections.has("plain")).toBe(false);
    await client.close();
  });

  it("without elicitation support, modern clients get confirmation_required", async () => {
    const { fetchMcp } = handler();
    const client = await httpClient(fetchMcp, { authorization: `Bearer ${TOKEN}`, "x-astra-endpoint": ENDPOINT, "x-astra-allow-writes": "true" }, { pin: "2026-07-28" });
    const r = await client.callTool({ name: "delete", arguments: { name: "articles", filter: {}, many: true } });
    expect(r.isError).toBe(true);
    expect(r.structuredContent).toMatchObject({ error: { code: "confirmation_required" } });
    await client.close();
  });
});

describe("OAuth authorization server", () => {
  const verified: unknown[] = [];
  const replayKeys = new Set<string>();
  const deps: OAuthDeps = {
    secrets: SECRETS,
    replay: {
      claim: async (key) => {
        if (replayKeys.has(key)) return false;
        replayKeys.add(key);
        return true;
      },
      has: async (key) => replayKeys.has(key),
    },
    verify: async (creds) => {
      verified.push(creds);
      return creds.token === TOKEN ? null : "Astra rejected the token.";
    },
    fetchClientMetadata: async (url) => ({ client_id: url, client_name: "Metadata Client", redirect_uris: ["https://client.example/cb"] }),
  };
  const oauth = (path: string, init?: RequestInit) => handleOAuthRequest(new Request(`${ORIGIN}${path}`, init), deps);

  it("publishes discovery metadata with CIMD, iss, and both scopes", async () => {
    const prm = await (await oauth("/.well-known/oauth-protected-resource")).json();
    expect(prm).toMatchObject({ resource: `${ORIGIN}/mcp`, authorization_servers: [ORIGIN], scopes_supported: ["astra:read", "astra:write"] });
    const as = await (await oauth("/.well-known/oauth-authorization-server")).json();
    expect(as).toMatchObject({
      issuer: ORIGIN, client_id_metadata_document_supported: true, authorization_response_iss_parameter_supported: true,
      code_challenge_methods_supported: ["S256"],
    });
  });

  async function authorize(clientId: string, redirectUri: string, form: Record<string, string>) {
    const verifier = "v".repeat(64);
    const challenge = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))).toString("base64url");
    const query = new URLSearchParams({
      client_id: clientId, redirect_uri: redirectUri, response_type: "code", code_challenge: challenge,
      code_challenge_method: "S256", state: "st", scope: "astra:read astra:write", resource: `${ORIGIN}/mcp`,
    });
    const page = await oauth(`/authorize?${query}`);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("Allow writes");
    expect(page.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    const body = new URLSearchParams({ ...Object.fromEntries(query), token: TOKEN, endpoint: ENDPOINT, action: "allow", ...form });
    const res = await oauth("/authorize", { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded" } });
    return { res, verifier };
  }

  it("runs DCR → consent (with writes) → code → tokens → MCP → refresh rotation", async () => {
    const reg = await oauth("/register", { method: "POST", body: JSON.stringify({ client_name: "Claude", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] }) });
    expect(reg.status).toBe(201);
    const { client_id } = await reg.json() as { client_id: string };

    const { res, verifier } = await authorize(client_id, "https://claude.ai/api/mcp/auth_callback", { allow_writes: "on" });
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location")!);
    expect(location.searchParams.get("iss")).toBe(ORIGIN);
    expect(location.searchParams.get("state")).toBe("st");
    const code = location.searchParams.get("code")!;

    const tokenRes = await oauth("/token", {
      method: "POST",
      body: new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: verifier, client_id, redirect_uri: "https://claude.ai/api/mcp/auth_callback", resource: `${ORIGIN}/mcp` }),
    });
    const tokens = await tokenRes.json() as { access_token: string; refresh_token: string; scope: string; expires_in: number };
    expect(tokens).toMatchObject({ scope: "astra:read astra:write", expires_in: 3600 });
    expect(tokens.access_token.startsWith("aw2.")).toBe(true);

    const { fetchMcp } = handler();
    const client = await httpClient(fetchMcp, { authorization: `Bearer ${tokens.access_token}` });
    expect((await client.listTools()).tools).toHaveLength(18);
    await client.close();

    const refreshed = await (await oauth("/token", { method: "POST", body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id }) })).json() as typeof tokens;
    expect(refreshed.refresh_token).not.toBe(tokens.refresh_token);
    expect(refreshed.scope).toBe("astra:read astra:write");

    const badVerifier = await oauth("/token", { method: "POST", body: new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: "nope" }) });
    expect(badVerifier.status).toBe(400);
  });

  it("issues read-only grants unless writes are ticked, and rejects tokens minted for another resource", async () => {
    const reg = await (await oauth("/register", { method: "POST", body: JSON.stringify({ redirect_uris: ["https://c.example/cb"] }) })).json() as { client_id: string };
    const { res, verifier } = await authorize(reg.client_id, "https://c.example/cb", {});
    const code = new URL(res.headers.get("location")!).searchParams.get("code")!;
    const tokens = await (await oauth("/token", { method: "POST", body: new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: verifier }) })).json() as { access_token: string; scope: string };
    expect(tokens.scope).toBe("astra:read");
    const { fetchMcp } = handler();
    const client = await httpClient(fetchMcp, { authorization: `Bearer ${tokens.access_token}` });
    expect((await client.listTools()).tools).toHaveLength(11);
    await client.close();
    const other = createHttpHandler({ secrets: SECRETS, gateway: fakeGateway(createFakeState()) });
    const res2 = await other(new Request("https://elsewhere.test/mcp", { method: "POST", body: "{}", headers: { authorization: `Bearer ${tokens.access_token}` } }));
    expect(res2.status).toBe(401);
  });

  it("accepts Client ID Metadata Documents and shows their host", async () => {
    const clientId = "https://client.example/oauth/client.json";
    const { res } = await authorize(clientId, "https://client.example/cb", {});
    expect(res.status).toBe(302);
    const resolved = await resolveMetadataClient("https://other.example/c.json", async (url) => ({ client_id: url, redirect_uris: ["https://other.example/cb"] }));
    expect(resolved).toMatchObject({ client_name: "other.example", origin: "metadata-document" });
    await expect(resolveMetadataClient("https://evil.example/c.json", async () => ({ client_id: "https://other", redirect_uris: ["x"] }))).rejects.toThrow(/does not match/);
    await expect(assertPublicHost("localhost")).rejects.toThrow();
    await expect(assertPublicHost("10.0.0.5")).rejects.toThrow();
    await expect(assertPublicHost("169.254.169.254")).rejects.toThrow();
  });

  it("re-renders the consent page for bad credentials and supports deny", async () => {
    const reg = await (await oauth("/register", { method: "POST", body: JSON.stringify({ redirect_uris: ["https://c.example/cb"] }) })).json() as { client_id: string };
    const bad = await authorize(reg.client_id, "https://c.example/cb", { token: "AstraCS:wrongwrongwrong" });
    expect(bad.res.status).toBe(400);
    expect(await bad.res.text()).toContain("Astra rejected the token.");
    const offsite = await authorize(reg.client_id, "https://c.example/cb", { endpoint: "https://evil.example" });
    expect(offsite.res.status).toBe(400);
    expect(await offsite.res.text()).toContain("apps.astra.datastax.com");
    const deny = await authorize(reg.client_id, "https://c.example/cb", { action: "deny" });
    expect(new URL(deny.res.headers.get("location")!).searchParams.get("error")).toBe("access_denied");
  });

  it("validates registrations and authorize requests", async () => {
    expect((await oauth("/register", { method: "POST", body: JSON.stringify({ redirect_uris: ["http://evil.example/cb"] }) })).status).toBe(400);
    const native = await oauth("/register", { method: "POST", body: JSON.stringify({ application_type: "native", redirect_uris: ["com.example.app:/cb"] }) });
    expect(native.status).toBe(201);
    expect((await oauth("/register", { method: "POST", body: "not json" })).status).toBe(400);
    expect((await oauth("/authorize?client_id=garbage&redirect_uri=x")).status).toBe(400);
    const reg = await (await oauth("/register", { method: "POST", body: JSON.stringify({ redirect_uris: ["https://c.example/cb"] }) })).json() as { client_id: string };
    const noPkce = await oauth(`/authorize?${new URLSearchParams({ client_id: reg.client_id, redirect_uri: "https://c.example/cb", response_type: "code" })}`);
    expect(new URL(noPkce.headers.get("location")!).searchParams.get("error")).toBe("invalid_request");
    expect((await oauth("/nope")).status).toBe(404);
    expect((await oauth("/token", { method: "POST", body: new URLSearchParams({ grant_type: "password" }) })).status).toBe(400);
  });

  it("keeps v1.2 (aw1) tokens working as read-only grants", async () => {
    // Recreate a v1.2.x token: AES-GCM with key = SHA-256(secret).
    const key = await crypto.subtle.importKey("raw", await crypto.subtle.digest("SHA-256", new TextEncoder().encode(SECRETS.current)), "AES-GCM", false, ["encrypt"]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const payload = { t: "access", creds: { token: TOKEN, endpoint: ENDPOINT }, exp: Math.floor(Date.now() / 1000) + 600 };
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(payload))));
    const legacy = `aw1.${Buffer.from(iv).toString("base64url")}.${Buffer.from(ct).toString("base64url")}`;
    const { fetchMcp } = handler();
    const client = await httpClient(fetchMcp, { authorization: `Bearer ${legacy}` });
    expect((await client.listTools()).tools).toHaveLength(11);
    await client.close();
  });
});

describe("crypto", () => {
  it("accepts canonical aw1/aw2 tokens and refuses encoding aliases", async () => {
    const payload = { a: 1 };
    const key = await crypto.subtle.importKey("raw", await crypto.subtle.digest("SHA-256", new TextEncoder().encode(SECRETS.current)), "AES-GCM", false, ["encrypt"]);
    const iv = new Uint8Array(12).fill(255);
    const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(payload))));
    const legacy = `aw1.${Buffer.from(iv).toString("base64url")}.${Buffer.from(cipher).toString("base64url")}`;
    const current = await seal(payload, SECRETS);
    for (const token of [legacy, current]) {
      expect(await open(token, SECRETS)).toEqual(payload);
      for (const suffix of ["=", "==", " ", "!"]) expect(await open(`${token}${suffix}`, SECRETS)).toBeNull();
      const parts = token.split(".");
      parts[1] += "=";
      expect(await open(parts.join("."), SECRETS)).toBeNull();
      // Ciphertext's last base64url symbol has two unused bits; aliases decode to the same bytes.
      const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
      const finalIndex = alphabet.indexOf(token.at(-1)!);
      expect(finalIndex % 4).toBe(0);
      expect(await open(`${token.slice(0, -1)}${alphabet[finalIndex + 1]}`, SECRETS)).toBeNull();
    }
    expect(await open(legacy.replaceAll("_", "/"), SECRETS)).toBeNull();
  });

  it("seals, opens, rotates secrets, and rejects tampering", async () => {
    const sealed = await seal({ a: 1 }, SECRETS);
    expect(await open(sealed, SECRETS)).toEqual({ a: 1 });
    expect(await open(sealed, { current: "new-secret", previous: SECRETS.current })).toEqual({ a: 1 });
    expect(await open(sealed, { current: "other" })).toBeNull();
    expect(await open(`${sealed.slice(0, -2)}xx`, SECRETS)).toBeNull();
    expect(await open("garbage", SECRETS)).toBeNull();
  });
  it("checks PKCE S256", async () => {
    const verifier = "abc";
    const challenge = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))).toString("base64url");
    expect(await pkceMatches(verifier, challenge)).toBe(true);
    expect(await pkceMatches("nope", challenge)).toBe(false);
  });
});
