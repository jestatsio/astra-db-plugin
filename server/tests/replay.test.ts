/** Single-use OAuth grants and their shared Redis REST replay store. */
import { describe, expect, it, vi } from "vitest";
import { type Secrets, b64url, fingerprint, seal } from "../src/http/crypto.js";
import { replayStoreFromEnv } from "../src/http/oauth/replay.js";
import { handleOAuthRequest } from "../src/http/oauth/router.js";
import { CODE_TTL, type CodeToken, type Grant, type OAuthDeps, type RefreshToken, type ReplayStore } from "../src/http/oauth/types.js";
import { ENDPOINT, TOKEN } from "./helpers.js";

const ORIGIN = "https://astra-mcp.test";
const SECRETS: Secrets = { current: "test-secret-current" };
const GRANT: Grant = { creds: { token: TOKEN, endpoint: ENDPOINT }, scope: ["astra:read"], client_id: "c1", aud: `${ORIGIN}/mcp` };

function memoryStore(): ReplayStore & { keys: Set<string>; claims: { key: string; ttl: number }[] } {
  const keys = new Set<string>();
  const claims: { key: string; ttl: number }[] = [];
  return {
    keys,
    claims,
    claim: async (key, ttl) => {
      claims.push({ key, ttl });
      if (keys.has(key)) return false;
      keys.add(key);
      return true;
    },
    has: async (key) => keys.has(key),
  };
}

async function refresh(deps: OAuthDeps, refreshToken: string) {
  const res = await handleOAuthRequest(new Request(`${ORIGIN}/token`, {
    method: "POST",
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: "c1" }),
  }), deps);
  return { status: res.status, body: await res.json() as { refresh_token?: string; error?: string; error_description?: string } };
}

async function firstRefreshToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const token: RefreshToken = { t: "refresh", grant: GRANT, exp: now + 3600, max: now + 7200, fam: "family-1" };
  return seal(token, SECRETS);
}

const NOW = 1000;
const VERIFIER = "test-pkce-verifier".repeat(4);

/** Force URL-alphabet characters in the IV so alternate-alphabet tests are deterministic. */
async function withFixedIv(create: () => Promise<string>): Promise<string> {
  const random = vi.spyOn(crypto, "getRandomValues").mockImplementation(((array: Uint8Array) => array.fill(255)) as typeof crypto.getRandomValues);
  try { return await create(); }
  finally { random.mockRestore(); }
}

function alternateEncodings(token: string): string[] {
  const standardAlphabet = token.replaceAll("-", "+").replaceAll("_", "/");
  expect(standardAlphabet).not.toBe(token);
  return [`${token}=`, `${token}==`, standardAlphabet];
}

async function authorizationCode(exp = NOW + CODE_TTL): Promise<string> {
  const code: CodeToken = {
    t: "code", grant: GRANT, redirect_uri: "https://client.example/cb", exp,
    code_challenge: b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(VERIFIER)))),
  };
  return seal(code, SECRETS);
}

async function exchange(deps: OAuthDeps, code: string, fields: Record<string, string> = {}) {
  const res = await handleOAuthRequest(new Request(`${ORIGIN}/token`, {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "authorization_code", code, code_verifier: VERIFIER, client_id: "c1",
      redirect_uri: "https://client.example/cb", resource: `${ORIGIN}/mcp`, ...fields,
    }),
  }), deps);
  return { status: res.status, body: await res.json() as { access_token?: string; error?: string; error_description?: string } };
}

describe("authorization code replay", () => {
  const base: OAuthDeps = { secrets: SECRETS, verify: async () => null, now: () => NOW };

  it("exchanges a code once and stores only its fingerprint for the remaining lifetime", async () => {
    const replay = memoryStore();
    const code = await authorizationCode(NOW + 120);
    expect((await exchange({ ...base, replay }, code)).status).toBe(200);
    expect(await exchange({ ...base, replay }, code)).toMatchObject({ status: 400, body: { error: "invalid_grant" } });
    expect(replay.claims).toEqual([
      { key: `ac:${await fingerprint(code)}`, ttl: 120 },
      { key: `ac:${await fingerprint(code)}`, ttl: 120 },
    ]);
  });

  it("allows exactly one of two concurrent exchanges", async () => {
    const deps = { ...base, replay: memoryStore() };
    const code = await authorizationCode();
    const results = await Promise.all([exchange(deps, code), exchange(deps, code)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    expect(results.find((r) => r.status === 400)?.body.error).toBe("invalid_grant");
  });

  it("rejects alternate code encodings that would bypass the replay fingerprint", async () => {
    const replay = memoryStore();
    const deps = { ...base, replay };
    const code = await withFixedIv(() => authorizationCode());
    expect((await exchange(deps, code)).status).toBe(200);
    for (const alternate of alternateEncodings(code)) expect((await exchange(deps, alternate)).status).toBe(400);
    expect(replay.claims).toHaveLength(1);
  });

  it("does not consume the code before PKCE and grant bindings are validated", async () => {
    const replay = memoryStore();
    const deps = { ...base, replay };
    const code = await authorizationCode();
    const invalidFields: Record<string, string>[] = [{ code_verifier: "wrong" }, { client_id: "other" }, { redirect_uri: "https://other.example/cb" }, { resource: "https://other.example/mcp" }];
    for (const fields of invalidFields) {
      expect((await exchange(deps, code, fields)).status).toBe(400);
    }
    expect(replay.claims).toHaveLength(0);
    expect((await exchange(deps, code)).status).toBe(200);
  });

  it("rejects expired codes without claiming them", async () => {
    const replay = memoryStore();
    expect(await exchange({ ...base, replay }, await authorizationCode(NOW))).toMatchObject({ status: 400, body: { error: "invalid_grant" } });
    expect(replay.claims).toHaveLength(0);
  });

  it("rejects a code lifetime beyond the supported storage TTL", async () => {
    const replay = memoryStore();
    expect(await exchange({ ...base, replay }, await authorizationCode(NOW + CODE_TTL * 2))).toMatchObject({ status: 400, body: { error: "invalid_grant" } });
    expect(replay.claims).toHaveLength(0);
  });

  it("fails closed when no shared store is configured", async () => {
    expect(await exchange(base, await authorizationCode())).toMatchObject({ status: 503, body: { error: "temporarily_unavailable" } });
  });

  it("fails closed on a store outage and permits retry after recovery", async () => {
    const replay = memoryStore();
    let unavailable = true;
    const deps = { ...base, replay: { ...replay, claim: async (key: string, ttl: number) => {
      if (unavailable) throw new Error("down");
      return replay.claim(key, ttl);
    } } };
    const code = await authorizationCode();
    expect(await exchange(deps, code)).toMatchObject({ status: 503, body: { error: "temporarily_unavailable" } });
    unavailable = false;
    expect((await exchange(deps, code)).status).toBe(200);
  });
});

describe("refresh token replay", () => {
  it("rejects alternate refresh encodings that would bypass single use", async () => {
    const replay = memoryStore();
    const deps: OAuthDeps = { secrets: SECRETS, verify: async () => null, replay };
    const token = await withFixedIv(() => firstRefreshToken());
    expect((await refresh(deps, token)).status).toBe(200);
    for (const alternate of alternateEncodings(token)) expect((await refresh(deps, alternate)).status).toBe(400);
    expect(replay.claims).toHaveLength(1);
  });

  it("with a store: each refresh token works once, and a replay revokes the whole chain", async () => {
    const replay = memoryStore();
    const deps: OAuthDeps = { secrets: SECRETS, verify: async () => null, replay };
    const r1 = await firstRefreshToken();

    const first = await refresh(deps, r1);
    expect(first.status).toBe(200);
    const r2 = first.body.refresh_token!;
    const rotated = await refresh(deps, r2);
    expect(rotated.status).toBe(200);
    const r3 = rotated.body.refresh_token!;
    expect(r3).not.toBe(r2);

    const replayed = await refresh(deps, r1);
    expect(replayed).toMatchObject({ status: 400, body: { error: "invalid_grant" } });
    expect(replayed.body.error_description).toMatch(/already used/);
    expect(replay.keys.has("fam:family-1")).toBe(true);

    // The legitimate holder's newer token is revoked too: they reconnect.
    const next = await refresh(deps, r3);
    expect(next).toMatchObject({ status: 400, body: { error: "invalid_grant" } });
    expect(next.body.error_description).toMatch(/revoked/);
  });

  it("fails closed when no shared store is configured", async () => {
    const deps: OAuthDeps = { secrets: SECRETS, verify: async () => null };
    const r1 = await firstRefreshToken();
    expect(await refresh(deps, r1)).toMatchObject({ status: 503, body: { error: "temporarily_unavailable" } });
  });

  it("fails closed (503) when the store is unreachable, without consuming the token", async () => {
    const broken: ReplayStore = { claim: async () => { throw new Error("down"); }, has: async () => false };
    const res = await refresh({ secrets: SECRETS, verify: async () => null, replay: broken }, await firstRefreshToken());
    expect(res).toMatchObject({ status: 503, body: { error: "temporarily_unavailable" } });
  });
});

describe("Redis REST replay store", () => {
  it("is absent only when no configuration is present", () => {
    expect(replayStoreFromEnv({})).toBeUndefined();
  });

  it("surfaces incomplete configuration instead of mixing credential pairs", async () => {
    let requests = 0;
    const fakeFetch = (async () => { requests++; throw new Error("unexpected request"); }) as typeof fetch;
    const store = replayStoreFromEnv({ KV_REST_API_URL: "https://kv.example", UPSTASH_REDIS_REST_TOKEN: "fake-token" }, fakeFetch)!;
    await expect(store.claim("k", 1)).rejects.toThrow(/KV_REST_API_URL and KV_REST_API_TOKEN/);
    await expect(store.has("k")).rejects.toThrow(/KV_REST_API_URL and KV_REST_API_TOKEN/);
    expect(requests).toBe(0);
  });

  it("rejects malformed or insecure storage URLs without making a request", async () => {
    let requests = 0;
    const fakeFetch = (async () => { requests++; throw new Error("unexpected request"); }) as typeof fetch;
    for (const url of ["not a URL", "http://redis.example", "https://user:password@redis.example"]) {
      const store = replayStoreFromEnv({ KV_REST_API_URL: url, KV_REST_API_TOKEN: "fake-token" }, fakeFetch)!;
      await expect(store.claim("k", 1)).rejects.toThrow(/HTTPS URL without credentials/);
    }
    expect(requests).toBe(0);
  });

  it("rejects malformed Redis replies rather than skipping revocation checks", async () => {
    for (const body of [{}, { result: "unexpected" }, { result: -1 }, null]) {
      const fakeFetch = (async () => new Response(JSON.stringify(body))) as typeof fetch;
      const store = replayStoreFromEnv({ KV_REST_API_URL: "https://kv.example", KV_REST_API_TOKEN: "fake-token" }, fakeFetch)!;
      await expect(store.has("k")).rejects.toThrow(/invalid/);
      await expect(store.claim("k", 1)).rejects.toThrow(/invalid/);
    }
  });

  it("claims with SET NX EX and checks with EXISTS", async () => {
    const sent: { url: string; auth: string | null; body: string[] }[] = [];
    const results: unknown[] = ["OK", null, 1];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      sent.push({ url, auth: new Headers(init.headers).get("authorization"), body: JSON.parse(init.body as string) });
      return new Response(JSON.stringify({ result: results.shift() }));
    }) as unknown as typeof fetch;
    const store = replayStoreFromEnv({ UPSTASH_REDIS_REST_URL: "https://redis.example", UPSTASH_REDIS_REST_TOKEN: "t0k" }, fakeFetch)!;
    expect(await store.claim("rt:abc", 59.2)).toBe(true);
    expect(await store.claim("rt:abc", 59.2)).toBe(false);
    expect(await store.has("fam:f")).toBe(true);
    expect(sent[0]).toEqual({ url: "https://redis.example", auth: "Bearer t0k", body: ["SET", "astra-mcp:rt:abc", "1", "NX", "EX", "60"] });
    expect(sent[2].body).toEqual(["EXISTS", "astra-mcp:fam:f"]);
  });

  it("surfaces store errors", async () => {
    const failing = (async () => new Response(JSON.stringify({ error: "WRONGPASS" }))) as unknown as typeof fetch;
    const store = replayStoreFromEnv({ KV_REST_API_URL: "https://kv.example", KV_REST_API_TOKEN: "x" }, failing)!;
    await expect(store.has("k")).rejects.toThrow(/WRONGPASS/);
    const down = (async () => new Response("nope", { status: 502 })) as unknown as typeof fetch;
    await expect(replayStoreFromEnv({ KV_REST_API_URL: "https://kv.example", KV_REST_API_TOKEN: "x" }, down)!.claim("k", 1)).rejects.toThrow(/502/);
  });
});
