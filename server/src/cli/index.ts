/**
 * astra-mcp — the Astra DB MCP server and its setup CLI.
 *
 *   astra-mcp                 serve over stdio (when stdin is not a terminal)
 *   astra-mcp init            configure Claude Code, Codex, Cursor, VS Code, Bob, …
 *   astra-mcp login           connect a project (.env) or your profile (--global)
 *   astra-mcp doctor          diagnose credentials, connectivity, and agent setup
 *   astra-mcp uninstall       remove the agent configuration again
 *   astra-mcp bob-bundle      write the IBM Bob bundle as a zip
 */
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { loadAssets } from "../assets.js";
import { createGateway } from "../astra/gateway.js";
import { VERSION } from "../version.js";
import { ALL_AGENT_IDS, type AgentId, defaultEnv } from "./agents.js";
import { bobZip } from "./bob.js";
import { doctor, formatChecks } from "./doctor.js";
import { init, uninstall } from "./init.js";
import { login } from "./login.js";
import { serve } from "./serve.js";
import { CancelledError, terminalIO } from "./term.js";

const HELP = `astra-mcp ${VERSION} — unofficial Astra DB integration by JEStats

Usage
  npx -y @erichare/astra-mcp <command> [options]

Commands
  init        Configure your agents (Claude Code, Codex, Cursor, VS Code, Windsurf,
              Claude Desktop, Gemini CLI, IBM Bob), then connect a database
  login       Connect a database: writes ASTRA_DB_* to ./.env (or your profile with --global)
  doctor      Check credentials, connectivity, .env hygiene, and agent setup
  uninstall   Remove what init configured (keeps .env and credentials)
  serve       Run the MCP server over stdio (the default when piped)
  bob-bundle  Write the IBM Bob bundle zip (--out astra-db-bob.zip)

Options
  --agents a,b      init/uninstall only these: ${ALL_AGENT_IDS.join(", ")}
  --project         write project-level config (.cursor/, .vscode/, .bob/) instead of user-level
  --dry-run         show what would change
  --yes, -y         accept defaults without prompting
  --no-login        init: skip the login step
  --global          login: save to your user profile instead of ./.env
  --token-stdin     login: read the token from stdin (CI)
  --database NAME   login: pick this database (name or id)
  --keyspace NAME   login: use this keyspace
  --endpoint URL    login: use this Data API endpoint (database-scoped tokens)
  --read-only       serve: hide write tools
  --json            doctor: machine-readable output
  --version, -v     print the version

Docs: https://github.com/jestatsio/astra-db-plugin`;

function parse(argv: string[]) {
  return parseArgs({
    args: argv,
    allowPositionals: true,
    strict: false,
    options: {
      agents: { type: "string" },
      project: { type: "boolean" },
      "dry-run": { type: "boolean" },
      yes: { type: "boolean", short: "y" },
      "no-login": { type: "boolean" },
      global: { type: "boolean" },
      "token-stdin": { type: "boolean" },
      database: { type: "string" },
      keyspace: { type: "string" },
      endpoint: { type: "string" },
      dir: { type: "string" },
      "read-only": { type: "boolean" },
      json: { type: "boolean" },
      out: { type: "string" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });
}

function agentList(value: unknown): AgentId[] | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const ids = value.split(",").map((s) => s.trim()).filter(Boolean) as AgentId[];
  const unknown = ids.filter((id) => !ALL_AGENT_IDS.includes(id));
  if (unknown.length) throw new Error(`unknown agent(s): ${unknown.join(", ")} — choose from ${ALL_AGENT_IDS.join(", ")}`);
  return ids;
}

export async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parse(argv);
  const command = positionals[0];
  if (values.version) {
    console.log(VERSION);
    return 0;
  }
  if (values.help || command === "help") {
    console.log(HELP);
    return 0;
  }
  if (!command) {
    if (process.stdin.isTTY) {
      console.log(HELP);
      return 0;
    }
    serve({ readOnly: Boolean(values["read-only"]) });
    return -1;
  }

  const io = terminalIO({ yes: Boolean(values.yes) });
  const gateway = createGateway(VERSION, { devopsUrl: process.env.ASTRA_MCP_DEVOPS_URL });
  const env = defaultEnv();
  try {
    switch (command) {
      case "serve":
        serve({ readOnly: Boolean(values["read-only"]) });
        return -1;
      case "init": {
        const result = await init(io, env, { agents: agentList(values.agents), project: Boolean(values.project), dryRun: Boolean(values["dry-run"]) });
        if (!values["dry-run"] && !values["no-login"] && result.agents.length && io.interactive) {
          if (await io.confirm("Connect a database now?", true)) {
            await login(io, gateway, { global: result.agents.includes("claude-desktop") && !values.project ? await io.confirm("Save for all projects (user profile) instead of this project's .env?", false) : false });
          } else {
            io.outro("Later: npx -y @erichare/astra-mcp login");
          }
        } else if (!values["dry-run"]) {
          io.outro("Next: npx -y @erichare/astra-mcp login");
        }
        return result.failed ? 1 : 0;
      }
      case "login":
        await login(io, gateway, {
          dir: values.dir as string | undefined,
          global: Boolean(values.global),
          tokenStdin: Boolean(values["token-stdin"]),
          database: values.database as string | undefined,
          keyspace: values.keyspace as string | undefined,
          endpoint: values.endpoint as string | undefined,
        });
        return 0;
      case "doctor": {
        const checks = await doctor(gateway, { env });
        if (values.json) console.log(JSON.stringify(checks, null, 2));
        else console.log(formatChecks(checks));
        return checks.some((c) => c.status === "fail") ? 1 : 0;
      }
      case "uninstall": {
        const result = await uninstall(io, env, { agents: agentList(values.agents), project: Boolean(values.project), dryRun: Boolean(values["dry-run"]) });
        return result.failed ? 1 : 0;
      }
      case "bob-bundle": {
        const assets = loadAssets();
        if (!assets) throw new Error("this build has no bundled skills");
        const out = (values.out as string | undefined) ?? "astra-db-bob.zip";
        writeFileSync(out, bobZip(assets));
        console.log(`wrote ${out}`);
        return 0;
      }
      default:
        console.error(`unknown command: ${command}\n\n${HELP}`);
        return 2;
    }
  } catch (err) {
    if (err instanceof CancelledError) {
      io.outro("Cancelled — nothing changed.");
      return 130;
    }
    io.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

main(process.argv.slice(2)).then((code) => {
  if (code >= 0) process.exit(code);
});
