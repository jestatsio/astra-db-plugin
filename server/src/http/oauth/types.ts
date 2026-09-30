export const SCOPE_READ = "astra:read";
export const SCOPE_WRITE = "astra:write";
export const SCOPES = [SCOPE_READ, SCOPE_WRITE];

export const CODE_TTL = 10 * 60;
export const ACCESS_TTL = 60 * 60;
export const REFRESH_TTL = 30 * 24 * 3600;
export const REFRESH_MAX_TTL = 90 * 24 * 3600;

export interface AstraGrantCreds {
  token: string;
  endpoint?: string;
  keyspace?: string;
}

/** What a user consented to: their Astra credentials, scopes, for which client and resource. */
export interface Grant {
  creds: AstraGrantCreds;
  scope: string[];
  client_id: string;
  /** The protected resource (audience), e.g. https://host/mcp. */
  aud: string;
}

export interface ClientRegistration {
  t: "client";
  client_name: string;
  redirect_uris: string[];
  application_type: "web" | "native";
  iat: number;
}

export interface CodeToken { t: "code"; grant: Grant; redirect_uri: string; code_challenge: string; exp: number }
export interface AccessToken { t: "access"; grant: Grant; exp: number }
/** `fam` names the chain of rotations since consent; replaying any member revokes the chain. */
export interface RefreshToken { t: "refresh"; grant: Grant; exp: number; max: number; fam?: string }

/** Legacy v1.2.x token shapes (aw1), accepted as read-only grants. */
export interface LegacyAccessToken { t: "access"; creds: AstraGrantCreds; exp: number }
export interface LegacyRefreshToken { t: "refresh"; creds: AstraGrantCreds; client_id: string; exp: number }

export interface ResolvedClient {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  /** Where the client identity came from, shown on the consent page. */
  origin: "registered" | "metadata-document";
}

export interface OAuthDeps {
  secrets?: import("../crypto.js").Secrets;
  /** Verify the credentials reach Astra; returns an error message or null. */
  verify: (creds: AstraGrantCreds) => Promise<string | null>;
  /** Fetch a Client ID Metadata Document (injectable for tests). */
  fetchClientMetadata?: (url: string) => Promise<unknown>;
  now?: () => number;
  /** Shared single-use code/refresh storage. Token grants fail with 503 when absent or unavailable. */
  replay?: ReplayStore;
}

/** A shared, expiring set (e.g. Redis): enforces one use per authorization code and refresh token. */
export interface ReplayStore {
  /** Record `key` for `ttlSeconds`; false when it was already recorded. */
  claim(key: string, ttlSeconds: number): Promise<boolean>;
  has(key: string): Promise<boolean>;
}

export function oauthError(error: string, description: string, status = 400): Response {
  return new Response(JSON.stringify({ error, error_description: description }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", "access-control-allow-origin": "*" },
  });
}
