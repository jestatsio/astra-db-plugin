import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAstrarc, profileFrom } from "../../src/credentials/astrarc.js";
import { mergeDotenv, parseDotenv } from "../../src/credentials/dotenv.js";
import { CredentialResolver, StaticCredentials, dotenvDirectories, userCredentialsPath } from "../../src/credentials/resolver.js";
import { clean, looksLikeAstraToken, maskToken, parseBool, sanitizeMessage } from "../../src/credentials/sanitize.js";

const TOKEN = "AstraCS:abcdefghijklmnop:0123456789abcdef0123456789abcdef";

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), "astra-creds-"));
  const home = join(root, "home");
  const project = join(home, "code", "app");
  mkdirSync(join(project, ".git"), { recursive: true });
  return { root, home, project };
}

describe("sanitize", () => {
  it("treats empty and unexpanded template values as unset", () => {
    expect(clean(undefined)).toBeUndefined();
    expect(clean("   ")).toBeUndefined();
    expect(clean("${user_config.token}")).toBeUndefined();
    expect(clean("${ASTRA_DB_APPLICATION_TOKEN}")).toBeUndefined();
    expect(clean(" x ")).toBe("x");
  });
  it("masks and recognizes tokens", () => {
    expect(looksLikeAstraToken(TOKEN)).toBe(true);
    expect(looksLikeAstraToken("AstraCS:x")).toBe(false);
    expect(maskToken(TOKEN)).toBe("AstraCS:…cdef");
    expect(maskToken(undefined)).toBe("(none)");
    expect(maskToken("Cassandra:abc123")).toBe("…c123");
  });
  it("parses booleans", () => {
    expect(parseBool("true")).toBe(true);
    expect(parseBool("0")).toBe(false);
    expect(parseBool("${user_config.read_only}")).toBeUndefined();
    expect(parseBool("maybe")).toBeUndefined();
  });
  it("strips tokens and URLs from messages", () => {
    expect(sanitizeMessage(`bad ${TOKEN} at https://abc-us-east-2.apps.astra.datastax.com/api/json`))
      .toBe("bad AstraCS:*** at abc-us-east-2.apps.astra.datastax.com");
  });
});

describe("dotenv", () => {
  it("parses quotes, export, and comments", () => {
    expect(parseDotenv("# c\nexport A=1\nB=\"two words\" # x\nC='3'\nD=4 # trailing\nbad line\nE=")).toEqual({
      A: "1", B: "two words", C: "3", D: "4", E: "",
    });
  });
  it("merges keys in place and appends new ones", () => {
    const merged = mergeDotenv("# keep\nA=1\nB=2\n", { B: "20", C: "has space", A: undefined });
    expect(merged).toBe('# keep\nB=20\n\nC="has space"\n');
    expect(mergeDotenv("", { X: "1" })).toBe("X=1\n");
    expect(mergeDotenv("A=first\nA=second\nB=keep\n", { A: undefined })).toBe("B=keep\n");
  });
  it("round trips a quoted Windows CLI path without interpreting its backslashes as newlines", () => {
    const values = { ASTRARC: "C:\\new\\test team\\work.astrarc", CUSTOM: 'line one\n"quoted"' };
    expect(parseDotenv(mergeDotenv("", values))).toEqual(values);
  });
});

describe("astrarc", () => {
  it("reads profiles", () => {
    const text = "[default]\nASTRA_DB_APPLICATION_TOKEN=AstraCS:one\n\n[dev]\nASTRA_DB_APPLICATION_TOKEN=\"AstraCS:two\"\nASTRA_ENV=dev\n";
    expect(Object.keys(parseAstrarc(text))).toEqual(["default", "dev"]);
    expect(profileFrom(text)).toEqual({ token: "AstraCS:one", environment: undefined });
    expect(profileFrom(text, "dev")).toEqual({ token: "AstraCS:two", environment: "dev" });
    expect(profileFrom(text, "missing")).toBeUndefined();
  });
});

describe("CredentialResolver", () => {
  it("prefers shell env, reports sources, and accepts aliases", () => {
    const { home, project } = sandbox();
    writeFileSync(join(project, ".env"), "ASTRA_DB_APPLICATION_TOKEN=AstraCS:fromdotenvfile\nASTRA_DB_API_ENDPOINT=https://dotenv.example\n");
    const resolver = new CredentialResolver({
      env: { ASTRA_DB_TOKEN: TOKEN, API_ENDPOINT: "https://env.example", CLAUDE_PROJECT_DIR: project },
      cwd: "/", home, platform: "linux",
    });
    const creds = resolver.resolve();
    expect(creds.token).toMatchObject({ value: TOKEN, source: "env", detail: "ASTRA_DB_TOKEN" });
    expect(creds.endpoint).toMatchObject({ value: "https://env.example", source: "env" });
    expect(creds.consulted).toContain(join(project, ".env"));
  });

  it("uses the nearest dotenv (with .env.local winning) up to the git root", () => {
    const { home, project } = sandbox();
    const nested = join(project, "packages", "web");
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(project, ".env"), "ASTRA_DB_APPLICATION_TOKEN=AstraCS:rootrootroot\nASTRA_DB_KEYSPACE=root_ks\n");
    writeFileSync(join(nested, ".env.local"), "ASTRA_DB_KEYSPACE=nested_ks\n");
    const creds = new CredentialResolver({ env: {}, cwd: nested, home, platform: "linux" }).resolve();
    expect(creds.keyspace).toMatchObject({ value: "nested_ks", detail: join(nested, ".env.local") });
    expect(creds.token).toMatchObject({ value: "AstraCS:rootrootroot", source: "dotenv" });
    expect(dotenvDirectories(nested, home)).toEqual([nested, join(project, "packages"), project]);
  });

  it("never climbs into $HOME for non-git projects", () => {
    const { home } = sandbox();
    const loose = join(home, "scratch");
    mkdirSync(loose, { recursive: true });
    writeFileSync(join(home, ".env"), `ASTRA_DB_APPLICATION_TOKEN=${TOKEN}\n`);
    expect(new CredentialResolver({ env: {}, cwd: loose, home, platform: "linux" }).resolve().token).toBeUndefined();
  });

  it("falls back to plugin config, then the user file, then the Astra CLI profile", () => {
    const { home, project } = sandbox();
    const configHome = join(home, ".config");
    mkdirSync(join(configHome, "astra-mcp"), { recursive: true });
    writeFileSync(join(configHome, "astra-mcp", "credentials.json"), JSON.stringify({ endpoint: "https://file.example", keyspace: "file_ks" }));
    writeFileSync(join(home, ".astrarc"), `[default]\nASTRA_DB_APPLICATION_TOKEN=${TOKEN}\n[work]\nASTRA_DB_APPLICATION_TOKEN=AstraCS:workworkwork\nASTRA_ENV=dev\n`);
    const env = { ASTRA_MCP_CONFIG_KEYSPACE: "plugin_ks", ASTRA_MCP_CONFIG_TOKEN: "${user_config.token}" };
    const creds = new CredentialResolver({ env, cwd: project, home, platform: "linux" }).resolve();
    expect(creds.keyspace).toMatchObject({ value: "plugin_ks", source: "plugin-config" });
    expect(creds.endpoint).toMatchObject({ value: "https://file.example", source: "user-file" });
    expect(creds.token).toMatchObject({ value: TOKEN, source: "astra-cli", detail: `${join(home, ".astrarc")} [default]` });
    const work = new CredentialResolver({ env: { ASTRA_PROFILE: "work" }, cwd: project, home, platform: "linux" }).resolve();
    expect(work.token?.value).toBe("AstraCS:workworkwork");
    expect(work.astraEnv).toBe("dev");
  });

  it("re-reads a dotenv file after it changes (no restart needed)", () => {
    const { home, project } = sandbox();
    const resolver = new CredentialResolver({ env: {}, cwd: project, home, platform: "linux" });
    expect(resolver.resolve().token).toBeUndefined();
    const path = join(project, ".env");
    writeFileSync(path, `ASTRA_DB_APPLICATION_TOKEN=${TOKEN}\n`);
    expect(resolver.resolve().token?.value).toBe(TOKEN);
    writeFileSync(path, "ASTRA_DB_APPLICATION_TOKEN=AstraCS:rotatedrotated\n");
    utimesSync(path, new Date(), new Date(Date.now() + 5000));
    expect(resolver.resolve().token?.value).toBe("AstraCS:rotatedrotated");
  });

  it("pairs the Astra environment with the selected token source", () => {
    const { home, project } = sandbox();
    writeFileSync(join(home, ".astrarc"), `[default]\nASTRA_DB_APPLICATION_TOKEN=${TOKEN}\nASTRA_ENV=dev\n`);
    const shell = new CredentialResolver({ env: { ASTRA_DB_TOKEN: "AstraCS:shell-token" }, cwd: project, home }).resolve();
    expect(shell.astraEnv).toBe("prod");
    writeFileSync(join(project, ".env"), "ASTRA_DB_TOKEN=AstraCS:project-token\nASTRA_ENV=test\n");
    expect(new CredentialResolver({ env: {}, cwd: project, home }).resolve().astraEnv).toBe("test");
  });

  it("resolves CLI profile metadata from project and global configuration", () => {
    const { home, project } = sandbox();
    const config = join(home, "work.astrarc");
    writeFileSync(config, `[work]\nASTRA_DB_APPLICATION_TOKEN=${TOKEN}\nASTRA_ENV=dev\n`);
    writeFileSync(join(project, ".env"), `ASTRA_PROFILE=work\nASTRARC=${config}\nASTRA_DB_KEYSPACE=project_ks\n`);
    const projectCreds = new CredentialResolver({ env: {}, cwd: project, home }).resolve();
    expect(projectCreds.token).toMatchObject({ value: TOKEN, source: "astra-cli" });
    expect(projectCreds.cliProfile).toEqual({ name: "work", path: config });
    expect(projectCreds.astraEnv).toBe("dev");
    const userFile = join(home, "credentials.json");
    writeFileSync(userFile, JSON.stringify({ profile: "work", astrarc: config, endpoint: "https://global.example" }));
    const globalCreds = new CredentialResolver({ env: { ASTRA_MCP_CREDENTIALS_FILE: userFile }, cwd: home, home }).resolve();
    expect(globalCreds.cliProfile).toEqual({ name: "work", path: config });
    expect(globalCreds.endpoint?.value).toBe("https://global.example");
    writeFileSync(userFile, JSON.stringify({ token: "AstraCS:global-token" }));
    expect(new CredentialResolver({ env: { ASTRA_MCP_CREDENTIALS_FILE: userFile }, cwd: project, home }).resolve().token?.source).toBe("astra-cli");
  });

  it("switches cached profiles and follows CLI token rotation without a restart", () => {
    const { home, project } = sandbox();
    const config = join(home, ".astrarc");
    writeFileSync(config, `[default]\nASTRA_DB_TOKEN=AstraCS:default-token\n[work]\nASTRA_DB_TOKEN=${TOKEN}\nASTRA_ENV=test\n`);
    const env = { ASTRA_PROFILE: "default" };
    const resolver = new CredentialResolver({ env, cwd: project, home });
    expect(resolver.resolve().token?.value).toBe("AstraCS:default-token");
    env.ASTRA_PROFILE = "work";
    expect(resolver.resolve().token?.value).toBe(TOKEN);
    writeFileSync(config, "[work]\nASTRA_DB_TOKEN=AstraCS:rotated-profile-token\nASTRA_ENV=test\n");
    utimesSync(config, new Date(), new Date(Date.now() + 5000));
    expect(resolver.resolve().token?.value).toBe("AstraCS:rotated-profile-token");
  });

  it("fails closed for explicit missing profiles and config files, while higher-priority tokens win", () => {
    const { home, project } = sandbox();
    writeFileSync(join(home, ".astrarc"), `[default]\nASTRA_DB_TOKEN=${TOKEN}\n`);
    expect(() => new CredentialResolver({ env: { ASTRA_PROFILE: "missing" }, cwd: project, home }).resolve()).toThrow(/profile 'missing'/);
    expect(() => new CredentialResolver({ env: { ASTRARC: join(home, "missing.astrarc") }, cwd: project, home }).resolve()).toThrow(/missing\.astrarc/);
    expect(new CredentialResolver({ env: { ASTRA_PROFILE: "missing", ASTRA_DB_TOKEN: TOKEN }, cwd: project, home }).resolve().token?.value).toBe(TOKEN);
  });

  it("reads switches and environment", () => {
    const { home, project } = sandbox();
    const creds = new CredentialResolver({ env: { ASTRA_MCP_READ_ONLY: "yes", ASTRA_DB_ENVIRONMENT: "HCD" }, cwd: project, home, platform: "linux" }).resolve();
    expect(creds.readOnly).toBe(true);
    expect(creds.environment).toBe("hcd");
  });

  it("locates the user credentials file per platform", () => {
    expect(userCredentialsPath({}, "/h", "linux")).toBe("/h/.config/astra-mcp/credentials.json");
    expect(userCredentialsPath({ XDG_CONFIG_HOME: "/x" }, "/h", "linux")).toBe("/x/astra-mcp/credentials.json");
    expect(userCredentialsPath({ APPDATA: "C:\\Users\\a\\AppData\\Roaming" }, "C:\\Users\\a", "win32")).toBe("C:\\Users\\a\\AppData\\Roaming\\astra-mcp\\credentials.json");
    expect(userCredentialsPath({}, "C:\\Users\\a", "win32")).toBe("C:\\Users\\a\\.config\\astra-mcp\\credentials.json");
    expect(userCredentialsPath({ ASTRA_MCP_CREDENTIALS_FILE: "/custom.json" }, "/h", "linux")).toBe("/custom.json");
  });

  it("StaticCredentials carries request credentials", () => {
    const creds = new StaticCredentials({ token: TOKEN, keyspace: "ks" }).resolve();
    expect(creds.token?.source).toBe("request");
    expect(creds.endpoint).toBeUndefined();
    expect(creds.keyspace?.value).toBe("ks");
  });
});
