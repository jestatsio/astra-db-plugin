import type { ToolAnnotations } from "@modelcontextprotocol/server";

/** The single MCP Apps UI resource; every visual tool renders into it by `view`. */
export const APP_URI = "ui://astra-db/app.html";

/** JEStats database + statistics glyph, matching assets/icon-v2.svg. */
export const ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="JEStats Astra DB Plugin">' +
  '<rect width="64" height="64" rx="14" fill="#111827"/><g fill="none" stroke="#FAF9F5" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">' +
  '<ellipse cx="24" cy="19" rx="12" ry="5"/><path d="M12 19v24c0 2.8 5.4 5 12 5s12-2.2 12-5V19M12 31c0 2.8 5.4 5 12 5s12-2.2 12-5"/></g>' +
  '<g fill="#D9531E"><rect x="42" y="34" width="4" height="14" rx="2"/><rect x="49" y="25" width="4" height="23" rx="2"/></g>' +
  '<circle cx="44" cy="23" r="2" fill="#FAF9F5"/><path d="M41 52h14" stroke="#FAF9F5" stroke-width="2" stroke-linecap="round"/></svg>';

export const ICONS = [
  { src: `data:image/svg+xml;base64,${Buffer.from(ICON_SVG).toString("base64")}`, mimeType: "image/svg+xml", sizes: ["any"] },
];

export const READ: ToolAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
export const OFFLINE_READ: ToolAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
export const INSERT: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };
export const UPDATE: ToolAnnotations = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true };
export const DELETE: ToolAnnotations = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true };
export const DDL: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true };

/** Tool `_meta` linking a tool to the app shell (MCP Apps; `openai/outputTemplate` for older ChatGPT builds). */
export function appMeta(): Record<string, unknown> {
  return { ui: { resourceUri: APP_URI }, "openai/outputTemplate": APP_URI };
}
