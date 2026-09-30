/** POST /token: authorization_code (PKCE) and refresh_token (rotating) grants. */
import { json } from "../cors.js";
import { fingerprint, nowSeconds, open, pkceMatches, seal } from "../crypto.js";
import {
  ACCESS_TTL, type AccessToken, CODE_TTL, type CodeToken, type Grant, type LegacyAccessToken, type LegacyRefreshToken,
  type OAuthDeps, REFRESH_MAX_TTL, REFRESH_TTL, type RefreshToken, SCOPE_READ, oauthError,
} from "./types.js";

async function issue(grant: Grant, now: number, max: number, deps: OAuthDeps, fam: string = crypto.randomUUID()): Promise<Response> {
  const secrets = deps.secrets as NonNullable<OAuthDeps["secrets"]>;
  const access: AccessToken = { t: "access", grant, exp: now + ACCESS_TTL };
  const refresh: RefreshToken = { t: "refresh", grant, exp: Math.min(now + REFRESH_TTL, max), max, fam };
  return json({
    access_token: await seal(access, secrets),
    token_type: "Bearer",
    expires_in: ACCESS_TTL,
    refresh_token: await seal(refresh, secrets),
    scope: grant.scope.join(" "),
  });
}

function missingTokenStore(): Response {
  return oauthError("temporarily_unavailable", "OAuth token storage is not configured; configure a shared Redis replay store.", 503);
}

/** Claim only after the code and PKCE verifier have passed every validation. */
async function consumeAuthorizationCode(raw: string, code: CodeToken, now: number, deps: OAuthDeps): Promise<Response | null> {
  if (!deps.replay) return missingTokenStore();
  try {
    if (await deps.replay.claim(`ac:${await fingerprint(raw)}`, Math.min(CODE_TTL, code.exp - now))) return null;
    return oauthError("invalid_grant", "Authorization code was already used; restart the connection.");
  } catch {
    return oauthError("temporarily_unavailable", "The token store is unavailable; try again shortly.", 503);
  }
}

/**
 * Each refresh token works once. Presenting a used one means
 * it was copied, so the whole rotation chain is revoked and the user reconnects.
 * Returns an error response, or null to proceed.
 */
async function consumeRefreshToken(raw: string, token: RefreshToken | LegacyRefreshToken, now: number, deps: OAuthDeps, fam: string): Promise<Response | null> {
  if (!deps.replay) return missingTokenStore();
  // Legacy descendants get a fresh 90-day maximum on upgrade; revocation must cover it.
  const chainTtl = "max" in token ? token.max - now : REFRESH_MAX_TTL;
  try {
    if (await deps.replay.has(`fam:${fam}`)) return oauthError("invalid_grant", "This sign-in was revoked; reconnect.");
    if (await deps.replay.claim(`rt:${await fingerprint(raw)}`, token.exp - now)) return null;
    await deps.replay.claim(`fam:${fam}`, chainTtl);
    return oauthError("invalid_grant", "Refresh token was already used, so this sign-in has been revoked; reconnect.");
  } catch {
    return oauthError("temporarily_unavailable", "The token store is unavailable; try again shortly.", 503);
  }
}

export async function handleToken(req: Request, deps: OAuthDeps): Promise<Response> {
  if (!deps.secrets) return oauthError("temporarily_unavailable", "OAuth is not configured on this server.", 503);
  const contentType = req.headers.get("content-type") ?? "";
  let p: Record<string, string>;
  try {
    p = contentType.includes("application/json")
      ? (await req.json()) as Record<string, string>
      : Object.fromEntries(new URLSearchParams(await req.text()).entries());
  } catch {
    return oauthError("invalid_request", "Malformed body.");
  }
  const now = deps.now?.() ?? nowSeconds();

  if (p.grant_type === "authorization_code") {
    const code = p.code ? await open<CodeToken>(p.code, deps.secrets) : null;
    if (code?.t !== "code" || !code.grant) return oauthError("invalid_grant", "Unknown or malformed authorization code.");
    if (code.exp <= now) return oauthError("invalid_grant", "Authorization code expired.");
    if (!Number.isFinite(code.exp) || code.exp > now + CODE_TTL) return oauthError("invalid_grant", "Authorization code has an invalid lifetime.");
    if (p.client_id && p.client_id !== code.grant.client_id) return oauthError("invalid_grant", "client_id mismatch.");
    if (p.redirect_uri && p.redirect_uri !== code.redirect_uri) return oauthError("invalid_grant", "redirect_uri mismatch.");
    if (p.resource && p.resource !== code.grant.aud) return oauthError("invalid_target", "resource mismatch.");
    if (!p.code_verifier || !(await pkceMatches(p.code_verifier, code.code_challenge))) return oauthError("invalid_grant", "PKCE verification failed.");
    const replayed = await consumeAuthorizationCode(p.code, code, now, deps);
    if (replayed) return replayed;
    return issue(code.grant, now, now + REFRESH_MAX_TTL, deps);
  }

  if (p.grant_type === "refresh_token") {
    const token = p.refresh_token ? await open<RefreshToken | LegacyRefreshToken>(p.refresh_token, deps.secrets) : null;
    if (token?.t !== "refresh") return oauthError("invalid_grant", "Unknown or malformed refresh token.");
    if (token.exp <= now) return oauthError("invalid_grant", "Refresh token expired; reconnect.");
    if ("grant" in token && p.client_id && p.client_id !== token.grant.client_id) return oauthError("invalid_grant", "client_id mismatch.");
    // Tokens predating family IDs need a stable ID shared by their migration and replay checks.
    const fam = "fam" in token && token.fam ? token.fam : `upgrade:${await fingerprint(p.refresh_token)}`;
    const replayed = await consumeRefreshToken(p.refresh_token, token, now, deps, fam);
    if (replayed) return replayed;
    if ("grant" in token) return issue(token.grant, now, token.max, deps, fam);
    // v1.2.x (aw1) refresh token: upgrade to a read-only v2 grant.
    const origin = new URL(req.url).origin;
    const grant: Grant = { creds: token.creds, scope: [SCOPE_READ], client_id: token.client_id, aud: `${origin}/mcp` };
    return issue(grant, now, now + REFRESH_MAX_TTL, deps, fam);
  }
  return oauthError("unsupported_grant_type", "Use authorization_code or refresh_token.");
}

/** Validate a sealed access token for this resource: the grant, or null. */
export async function grantFromAccessToken(bearer: string, deps: Pick<OAuthDeps, "secrets" | "now">, resource: string): Promise<Grant | null> {
  if (!deps.secrets) return null;
  const token = await open<AccessToken | LegacyAccessToken>(bearer, deps.secrets);
  const now = deps.now?.() ?? nowSeconds();
  if (token?.t !== "access" || token.exp <= now) return null;
  if ("grant" in token) return token.grant.aud === resource ? token.grant : null;
  return { creds: token.creds, scope: [SCOPE_READ], client_id: "legacy", aud: resource };
}
