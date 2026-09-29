/**
 * Replay store over a Redis REST API: Vercel KV / Upstash for Redis
 * (KV_REST_API_URL + KV_REST_API_TOKEN, or UPSTASH_REDIS_REST_URL +
 * UPSTASH_REDIS_REST_TOKEN). OAuth token grants require a working shared store.
 */
import type { ReplayStore } from "./types.js";

export function replayStoreFromEnv(env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): ReplayStore | undefined {
  const prefix = env.KV_REST_API_URL || env.KV_REST_API_TOKEN ? "KV_REST_API" : "UPSTASH_REDIS_REST";
  const url = env[`${prefix}_URL`];
  const token = env[`${prefix}_TOKEN`];
  if (!url && !token) return undefined;

  let configurationError: string | undefined;
  if (!url || !token) configurationError = `Configure both ${prefix}_URL and ${prefix}_TOKEN for OAuth token storage.`;
  else {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error("invalid URL");
    } catch {
      configurationError = `${prefix}_URL must be an HTTPS URL without credentials.`;
    }
  }

  const command = async (args: string[]): Promise<unknown> => {
    if (configurationError) throw new Error(configurationError);
    const res = await fetchImpl(url as string, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`token store returned ${res.status}`);
    const body = (await res.json()) as { result?: unknown; error?: string } | null;
    if (!body || typeof body !== "object") throw new Error("token store returned an invalid response");
    if (body.error) throw new Error(`token store: ${body.error}`);
    if (!("result" in body)) throw new Error("token store returned an invalid response");
    return body.result;
  };

  return {
    claim: async (key, ttlSeconds) => {
      const result = await command(["SET", `astra-mcp:${key}`, "1", "NX", "EX", String(Math.max(1, Math.ceil(ttlSeconds)))]);
      if (result !== "OK" && result !== null) throw new Error("token store returned an invalid SET response");
      return result === "OK";
    },
    has: async (key) => {
      const result = await command(["EXISTS", `astra-mcp:${key}`]);
      if (result !== 0 && result !== 1) throw new Error("token store returned an invalid EXISTS response");
      return result === 1;
    },
  };
}
