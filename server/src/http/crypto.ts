/**
 * Stateless sealed tokens (AES-256-GCM, Web Crypto). Tokens carry the user's
 * Astra credentials, so they are encrypted — not merely signed.
 *
 *   aw2.<kid>.<iv>.<ciphertext>   current: key = HKDF-SHA256(secret, info "astra-mcp/aw2"), kid = key fingerprint
 *   aw1.<iv>.<ciphertext>         legacy (v1.2.x): key = SHA-256(secret); still accepted for reading
 *
 * Rotation: set ASTRA_MCP_AUTH_SECRET to the new secret and keep the old one in
 * ASTRA_MCP_AUTH_SECRET_PREVIOUS until outstanding tokens expire.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function fromB64url(text: string): Uint8Array<ArrayBuffer> {
  const buf = Buffer.from(text, "base64url");
  return new Uint8Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

/** One textual encoding per byte sequence, so aliases cannot bypass replay fingerprints. */
function isCanonicalB64url(value: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(value) && Buffer.from(value, "base64url").toString("base64url") === value;
}

async function sha256(data: Uint8Array | string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", typeof data === "string" ? enc.encode(data) : new Uint8Array(data)));
}

interface Key {
  kid: string;
  key: CryptoKey;
}

const keyCache = new Map<string, Promise<Key>>();

function deriveV2(secret: string): Promise<Key> {
  const cached = keyCache.get(`v2|${secret}`);
  if (cached) return cached;
  const promise = (async () => {
    const base = await crypto.subtle.importKey("raw", enc.encode(secret), "HKDF", false, ["deriveBits"]);
    const bits = new Uint8Array(await crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt: enc.encode("astra-mcp"), info: enc.encode("astra-mcp/aw2") }, base, 256));
    const kid = b64url((await sha256(bits)).slice(0, 6));
    const key = await crypto.subtle.importKey("raw", bits, "AES-GCM", false, ["encrypt", "decrypt"]);
    return { kid, key };
  })();
  keyCache.set(`v2|${secret}`, promise);
  return promise;
}

async function legacyKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", new Uint8Array(await sha256(secret)), "AES-GCM", false, ["decrypt"]);
}

export interface Secrets {
  current: string;
  previous?: string;
}

export function secretsFromEnv(env: NodeJS.ProcessEnv = process.env): Secrets | undefined {
  const current = env.ASTRA_MCP_AUTH_SECRET || env.ASTRA_WIDGETS_AUTH_SECRET;
  if (!current) return undefined;
  return { current, previous: env.ASTRA_MCP_AUTH_SECRET_PREVIOUS || undefined };
}

export async function seal(payload: unknown, secrets: Secrets): Promise<string> {
  const { kid, key } = await deriveV2(secrets.current);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(payload))));
  return `aw2.${kid}.${b64url(iv)}.${b64url(ciphertext)}`;
}

/** The payload, or null for anything malformed, tampered, or sealed with an unknown secret. */
export async function open<T>(token: string, secrets: Secrets): Promise<T | null> {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (!parts.slice(1).every(isCanonicalB64url)) return null;
  try {
    if (parts[0] === "aw2" && parts.length === 4) {
      for (const secret of [secrets.current, secrets.previous]) {
        if (!secret) continue;
        const { kid, key } = await deriveV2(secret);
        if (kid !== parts[1]) continue;
        const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64url(parts[2]) }, key, fromB64url(parts[3]));
        return JSON.parse(dec.decode(plain)) as T;
      }
      return null;
    }
    if (parts[0] === "aw1" && parts.length === 3) {
      for (const secret of [secrets.current, secrets.previous]) {
        if (!secret) continue;
        try {
          const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64url(parts[1]) }, await legacyKey(secret), fromB64url(parts[2]));
          return JSON.parse(dec.decode(plain)) as T;
        } catch {
          // try the next secret
        }
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function isSealedToken(token: string): boolean {
  return token.startsWith("aw2.") || token.startsWith("aw1.");
}

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** PKCE S256: base64url(sha256(verifier)) === challenge */
export async function pkceMatches(verifier: string, challenge: string): Promise<boolean> {
  return b64url(await sha256(verifier)) === challenge;
}

/** Short, non-reversible fingerprint of a secret value (cache keys). */
export async function fingerprint(value: string): Promise<string> {
  return b64url((await sha256(value)).slice(0, 12));
}
