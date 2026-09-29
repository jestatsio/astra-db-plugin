import { json } from "../cors.js";
import { SCOPES, SCOPE_READ } from "./types.js";

export const resourceUrl = (origin: string) => `${origin}/mcp`;

export function protectedResourceMetadata(origin: string): Response {
  return json({
    resource: resourceUrl(origin),
    authorization_servers: [origin],
    bearer_methods_supported: ["header"],
    scopes_supported: SCOPES,
    resource_name: "JEStats Astra DB Plugin (unofficial)",
    resource_documentation: "https://github.com/jestatsio/astra-db-plugin/blob/main/docs/hosted.md",
  });
}

export function authorizationServerMetadata(origin: string): Response {
  return json({
    issuer: origin,
    authorization_endpoint: `${origin}/authorize`,
    token_endpoint: `${origin}/token`,
    registration_endpoint: `${origin}/register`,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: SCOPES,
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
    service_documentation: "https://github.com/jestatsio/astra-db-plugin/blob/main/docs/hosted.md",
  });
}

export function wwwAuthenticate(origin: string, error?: string, description?: string): string {
  const parts = [`Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`, `scope="${SCOPE_READ}"`];
  if (error) parts.push(`error="${error}"`);
  if (description) parts.push(`error_description="${description.replace(/"/g, "'")}"`);
  return parts.join(", ");
}
