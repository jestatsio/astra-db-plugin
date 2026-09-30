import { readFileSync } from "node:fs";

declare const __ASTRA_MCP_VERSION__: string | undefined;

function fromPackageJson(): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version?: string };
    return pkg.version ?? "0.0.0-dev";
  } catch {
    return "0.0.0-dev";
  }
}

/** The package version, injected by esbuild at build time (package.json when running from source). */
export const VERSION: string = typeof __ASTRA_MCP_VERSION__ === "string" ? __ASTRA_MCP_VERSION__ : fromPackageJson();

export const PACKAGE_NAME = "@erichare/astra-mcp";
export const SERVER_NAME = "astra-db";
export const WEBSITE_URL = "https://github.com/jestatsio/astra-db-plugin";
