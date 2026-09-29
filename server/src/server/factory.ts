/** Builds a fully configured Astra DB McpServer (one per stdio connection or HTTP request). */
import { McpServer } from "@modelcontextprotocol/server";
import type { AstraConnections } from "../astra/connection.js";
import { type ExampleEntry, loadCatalog } from "../examples/search.js";
import { SERVER_NAME, VERSION, WEBSITE_URL } from "../version.js";
import { instructions } from "./instructions.js";
import { ICONS } from "./meta.js";
import { registerPrompts } from "./prompts.js";
import { registerResources } from "./resources.js";
import { registerTools } from "./tools.js";

export interface AstraServerOptions {
  connections: AstraConnections;
  mode: "stdio" | "http";
  /** Writes allowed for this connection (false: read-only mode, or hosted without astra:write). */
  allowWrites: boolean;
  examples?: () => ExampleEntry[] | null;
  htmlDir?: string;
}

export function createAstraServer(options: AstraServerOptions): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, title: "JEStats Astra DB Plugin", version: VERSION, websiteUrl: WEBSITE_URL, icons: ICONS },
    {
      instructions: instructions({ allowWrites: options.allowWrites, hosted: options.mode === "http" }),
      capabilities: { tools: { listChanged: false }, resources: { listChanged: false }, prompts: { listChanged: false }, completions: {} },
    },
  );
  registerTools({
    server,
    connections: options.connections,
    mode: options.mode,
    allowWrites: options.allowWrites,
    examples: options.examples ?? loadCatalog,
    htmlDir: options.htmlDir,
  });
  registerResources(server, options.connections);
  registerPrompts(server, options.connections);
  return server;
}
