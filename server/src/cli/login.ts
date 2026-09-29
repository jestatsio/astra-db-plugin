/**
 * `astra-mcp login`: connect a project (or the user profile) to an Astra database.
 * The token is typed into a hidden terminal prompt (or piped with
 * --token-stdin) — never through an agent's chat.
 */
import { chmodSync, existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, resolve } from "node:path";
import type { AstraGateway, DatabaseInfoLike } from "../astra/gateway.js";
import { toAstraMcpError } from "../astra/errors.js";
import { mergeDotenv } from "../credentials/dotenv.js";
import { type AstraEnvironment, type CliProfileRef, CredentialResolver, astraEnvironment, userCredentialsPath } from "../credentials/resolver.js";
import { clean, looksLikeAstraToken, maskToken } from "../credentials/sanitize.js";
import { gitIgnoreStatus, readText, writeFileEnsured } from "./fsutil.js";
import type { IO } from "./term.js";

export interface LoginOptions {
  dir?: string;
  global?: boolean;
  tokenStdin?: boolean;
  database?: string;
  keyspace?: string;
  endpoint?: string;
  profile?: string;
  astrarc?: string;
  astraEnv?: string;
  env?: NodeJS.ProcessEnv;
  home?: string;
  readStdin?: () => Promise<string>;
}

export interface LoginResult {
  written: string;
  database?: { id: string; name: string };
  endpoint: string;
  keyspace: string;
}

const TOKEN_HINT = "Create one in the Astra console → Settings → Tokens (role: Database Administrator for full access, or a read-only role).";

async function readAllStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

interface TokenChoice {
  token: string;
  astraEnv: AstraEnvironment;
  cliProfile?: CliProfileRef;
}

async function obtainToken(io: IO, options: LoginOptions): Promise<TokenChoice> {
  const explicitCli = clean(options.profile) !== undefined || clean(options.astrarc) !== undefined;
  const manualEnvironment = () => astraEnvironment(options.astraEnv ?? (options.env ?? process.env).ASTRA_ENV);
  if (options.tokenStdin) {
    if (explicitCli) throw new Error("Choose either --token-stdin or an Astra CLI profile (--profile/--astrarc).");
    const token = (await (options.readStdin ?? readAllStdin)()).trim();
    if (!looksLikeAstraToken(token)) throw new Error("stdin did not contain an Astra application token (AstraCS:…).");
    return { token, astraEnv: manualEnvironment() };
  }
  const creds = new CredentialResolver({ env: options.env, cwd: options.dir, home: options.home, profile: options.profile, astrarc: options.astrarc }).resolve();
  const existing = creds.token;
  if (existing && looksLikeAstraToken(existing.value)) {
    const reuse = explicitCli || await io.confirm(`Use the token from ${existing.detail} (${maskToken(existing.value)})?`, true);
    if (reuse) {
      if (creds.cliProfile && options.astraEnv !== undefined) throw new Error("Set ASTRA_ENV in the selected Astra CLI profile; --astra-env is for manually entered tokens.");
      return { token: existing.value, astraEnv: creds.cliProfile ? creds.astraEnv : options.astraEnv ? astraEnvironment(options.astraEnv) : creds.astraEnv, cliProfile: creds.cliProfile };
    }
  }
  if (explicitCli) throw new Error("The selected Astra CLI profile does not contain a valid Astra application token (AstraCS:…).");
  io.info(TOKEN_HINT);
  const token = await io.password("Astra application token (input hidden)", (value) =>
    looksLikeAstraToken(value.trim()) ? undefined : "Expected a token starting with AstraCS:");
  return { token: token.trim(), astraEnv: manualEnvironment() };
}

async function chooseDatabase(io: IO, databases: DatabaseInfoLike[], wanted?: string): Promise<DatabaseInfoLike> {
  const active = databases.filter((d) => d.regions?.[0]?.apiEndpoint);
  if (wanted) {
    const match = active.find((d) => d.name === wanted || d.id === wanted);
    if (!match) throw new Error(`No active database '${wanted}'. Available: ${active.map((d) => d.name).join(", ") || "none"}.`);
    return match;
  }
  if (active.length === 0) {
    throw new Error("This token sees no active databases. Create one at https://astra.datastax.com (or `astra db create`), then run login again.");
  }
  if (active.length === 1) return active[0];
  const id = await io.select("Which database?", active.map((d) => ({
    value: d.id,
    label: d.name,
    hint: `${d.regions[0]?.name ?? ""} · ${d.status.toLowerCase()}`,
  })));
  return active.find((d) => d.id === id) as DatabaseInfoLike;
}

export async function login(io: IO, gateway: AstraGateway, options: LoginOptions = {}): Promise<LoginResult> {
  const dir = resolve(options.dir ?? process.cwd());
  const home = options.home ?? homedir();
  const env = options.env ?? process.env;
  io.intro("Connect Astra DB");
  const { token, astraEnv, cliProfile } = await obtainToken(io, { ...options, dir, home, env });

  let endpoint = clean(options.endpoint);
  let database: DatabaseInfoLike | undefined;
  if (!endpoint) {
    try {
      const databases = await io.spin("Listing your databases", () => gateway.devops(token, astraEnv).listDatabases({ include: "ACTIVE" }));
      database = await chooseDatabase(io, databases, options.database);
      endpoint = database.regions[0].apiEndpoint;
    } catch (err) {
      const e = toAstraMcpError(err);
      if (e.code !== "forbidden" && e.code !== "devops_api_error") throw new Error(`${e.message}${e.hint ? `\n${e.hint}` : ""}`);
      io.warn("This token can't list databases (it is probably scoped to one database).");
      endpoint = await io.text("Data API endpoint", {
        placeholder: "https://<db-id>-<region>.apps.astra.datastax.com",
        validate: (v) => (/^https:\/\//.test(v.trim()) ? undefined : "Paste the https:// endpoint from the database's Overview page"),
      });
    }
  }

  const keyspaces = database?.keyspaces?.length ? database.keyspaces : [];
  let keyspace = clean(options.keyspace);
  if (!keyspace) {
    keyspace = keyspaces.length > 1
      ? await io.select("Which keyspace?", keyspaces.map((k) => ({ value: k, label: k, hint: k === "default_keyspace" ? "default" : undefined })), keyspaces.includes("default_keyspace") ? "default_keyspace" : keyspaces[0])
      : keyspaces[0] ?? "default_keyspace";
  }

  const endpointUrl = (endpoint as string).trim().replace(/\/+$/, "");
  const collections = await io.spin("Checking the connection", async () => {
    try {
      return await gateway.db(token, endpointUrl, keyspace, "astra").listCollections({ keyspace, nameOnly: false });
    } catch (err) {
      const e = toAstraMcpError(err);
      throw new Error(`Could not connect: ${e.message}${e.hint ? `\n${e.hint}` : ""}`);
    }
  });

  const values = {
    ASTRA_DB_APPLICATION_TOKEN: cliProfile ? undefined : token,
    ASTRA_DB_TOKEN: undefined,
    APPLICATION_TOKEN: undefined,
    ASTRA_DB_API_ENDPOINT: endpointUrl,
    ASTRA_DB_KEYSPACE: keyspace,
    ASTRA_PROFILE: cliProfile?.name,
    ASTRARC: cliProfile?.path,
    ASTRA_ENV: cliProfile ? undefined : astraEnv,
  };
  let written: string;
  if (options.global) {
    written = userCredentialsPath(env, home, process.platform);
    writeFileEnsured(written, `${JSON.stringify({
      ...(cliProfile ? { profile: cliProfile.name, astrarc: cliProfile.path } : { token, astraEnv }),
      endpoint: endpointUrl, keyspace, ...(database ? { database: database.name } : {}),
    }, null, 2)}\n`, 0o600);
  } else {
    written = join(dir, ".env");
    writeFileEnsured(written, mergeDotenv(readText(written) ?? "", values), 0o600);
    try {
      chmodSync(written, 0o600);
    } catch {
      // Windows
    }
    const status = gitIgnoreStatus(written);
    if (status === "not-ignored") {
      const gitignore = join(dir, ".gitignore");
      const add = await io.confirm(".env is not git-ignored. Add it to .gitignore?", true);
      if (add) {
        const current = existsSync(gitignore) ? readFileSync(gitignore, "utf8") : "";
        writeFileEnsured(gitignore, `${current}${current && !current.endsWith("\n") ? "\n" : ""}.env\n`);
        io.success("Added .env to .gitignore.");
      } else {
        io.warn("Remember: never commit .env.");
      }
    }
  }

  if (cliProfile) {
    try {
      const active = new CredentialResolver({ env, cwd: dir, home }).resolve();
      if (active.cliProfile?.name !== cliProfile.name || active.cliProfile.path !== cliProfile.path) {
        io.warn(`Saved CLI profile settings are overridden by ${active.token?.detail ?? "other credential settings"} in this project. Clear the higher-priority setting to use the saved profile.`);
      }
    } catch (err) {
      io.warn(`Saved CLI profile settings are overridden by other credential settings: ${toAstraMcpError(err).message}`);
    }
  }

  const where = options.global ? written : relative(process.cwd(), written) || ".env";
  io.note([
    `database  ${database ? `${database.name} (${database.regions[0]?.name})` : new URL(endpointUrl).hostname}`,
    `keyspace  ${keyspace}  ·  ${collections.length} collection(s)`,
    cliProfile ? `profile   ${cliProfile.name} in ${cliProfile.path} (token stays in Astra CLI config)` : `token     ${maskToken(token)}`,
    `Astra env ${astraEnv}`,
    `saved to  ${where}`,
  ].join("\n"), "Connected");
  io.outro(options.global
    ? "Done. Every project without its own .env now uses this database — no restart needed."
    : "Done. Your agent picks this up on its next Astra DB tool call — no restart needed.");
  return { written, database: database ? { id: database.id, name: database.name } : undefined, endpoint: endpointUrl, keyspace };
}
