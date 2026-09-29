/** `astra-mcp init` / `uninstall`: configure (or unconfigure) every agent in one go. */
import { join } from "node:path";
import { loadAssets } from "../assets.js";
import { AGENTS, ALL_AGENT_IDS, type Action, type AgentId, type Env, bobAgent } from "./agents.js";
import { bobLayout, installBob, planBob, uninstallBob } from "./bob.js";
import type { IO } from "./term.js";

export interface InitOptions {
  agents?: AgentId[];
  project?: boolean;
  dryRun?: boolean;
}

interface Step {
  agent: AgentId;
  label: string;
  actions: Action[];
}

function bobRoot(env: Env, project: boolean): string {
  return project ? join(env.cwd, ".bob") : join(env.home, ".bob");
}

function bobSteps(env: Env, project: boolean, install: boolean): Action[] {
  const layout = bobLayout(bobRoot(env, project), !project);
  if (!install) return [{ describe: `remove the astra-db bundle from ${layout.root}`, apply: () => ({ ok: true, detail: `${uninstallBob(layout).length} file(s) removed` }) }];
  const assets = loadAssets();
  if (!assets) return [{ describe: "Bob bundle", apply: () => ({ ok: false, detail: "this build has no bundled skills" }) }];
  const plan = planBob(assets, layout);
  return [{
    describe: `write ${Object.keys(plan.files).length} files under ${layout.root} and merge ${plan.merges.map((p) => p.replace(`${layout.root}/`, "")).join(", ")}`,
    apply: () => {
      const result = installBob(assets, layout);
      return { ok: true, detail: `${result.written.length} files` };
    },
  }];
}

function planSteps(env: Env, agents: AgentId[], project: boolean, install: boolean): Step[] {
  return agents.map((id) => {
    if (id === "bob") return { agent: id, label: bobAgent.label, actions: bobSteps(env, project, install) };
    const agent = AGENTS.find((a) => a.id === id);
    if (!agent) throw new Error(`unknown agent: ${id} (choose from ${ALL_AGENT_IDS.join(", ")})`);
    return { agent: id, label: agent.label, actions: install ? agent.install(env, { project }) : agent.uninstall(env, { project }) };
  });
}

async function chooseAgents(io: IO, env: Env, requested?: AgentId[]): Promise<AgentId[]> {
  if (requested?.length) return requested;
  const all = [...AGENTS, bobAgent];
  const detected = all.filter((a) => a.detect(env)).map((a) => a.id);
  if (!detected.length) {
    io.warn("No supported agents detected. Pick the ones to configure:");
  }
  return io.multiselect(
    "Configure Astra DB for which agents?",
    all.map((a) => ({ value: a.id, label: a.label, hint: `${detected.includes(a.id) ? "detected · " : ""}${a.what}` })),
    detected,
  );
}

function execute(io: IO, steps: Step[], dryRun: boolean): { ok: number; failed: number } {
  let ok = 0;
  let failed = 0;
  for (const step of steps) {
    for (const action of step.actions) {
      if (dryRun) {
        io.step(`${step.label}: would ${action.describe}`);
        continue;
      }
      let result: { ok: boolean; detail?: string };
      try {
        result = action.apply();
      } catch (err) {
        result = { ok: false, detail: err instanceof Error ? err.message : String(err) };
      }
      if (result.ok) {
        ok += 1;
        io.success(`${step.label}: ${action.describe}${result.detail ? ` — ${result.detail}` : ""}`);
      } else {
        failed += 1;
        io.error(`${step.label}: ${action.describe} failed${result.detail ? ` — ${result.detail}` : ""}`);
      }
    }
  }
  return { ok, failed };
}

export async function init(io: IO, env: Env, options: InitOptions = {}): Promise<{ agents: AgentId[]; failed: number }> {
  io.intro("JEStats Astra DB Plugin · unofficial integration");
  const agents = await chooseAgents(io, env, options.agents);
  if (!agents.length) {
    io.outro("Nothing selected.");
    return { agents, failed: 0 };
  }
  const project = Boolean(options.project);
  const steps = planSteps(env, agents, project, true);
  io.note(steps.flatMap((s) => s.actions.map((a) => `${s.label}: ${a.describe}`)).join("\n"), options.dryRun ? "Plan (dry run)" : "Plan");
  if (!options.dryRun && !(await io.confirm("Apply?", true))) {
    io.outro("No changes made.");
    return { agents, failed: 0 };
  }
  const { failed } = execute(io, steps, Boolean(options.dryRun));
  const editors = agents.filter((a) => ["cursor", "vscode", "windsurf", "gemini"].includes(a));
  if (editors.length) {
    io.info("Tip: add the Astra DB knowledge skill to those agents too: npx skills add jestatsio/astra-db-plugin -s astra-toolkit");
  }
  if (agents.includes("claude-desktop")) {
    io.info("Claude Desktop has no project folder: connect with `npx -y @erichare/astra-mcp login --global`, or install the one-click .mcpb from the GitHub release.");
  }
  return { agents, failed };
}

export async function uninstall(io: IO, env: Env, options: InitOptions = {}): Promise<{ failed: number }> {
  io.intro("Remove Astra DB from your agents");
  const agents = options.agents?.length ? options.agents : ALL_AGENT_IDS.filter((id) => id === "bob" ? bobAgent.detect(env) : AGENTS.find((a) => a.id === id)?.detect(env));
  const steps = planSteps(env, agents, Boolean(options.project), false).filter((s) => s.actions.length);
  if (!steps.length) {
    io.outro("Nothing to remove.");
    return { failed: 0 };
  }
  io.note(steps.flatMap((s) => s.actions.map((a) => `${s.label}: ${a.describe}`)).join("\n"), "Will remove");
  if (!options.dryRun && !(await io.confirm("Remove?", true))) {
    io.outro("No changes made.");
    return { failed: 0 };
  }
  const { failed } = execute(io, steps, Boolean(options.dryRun));
  io.outro("Done. Your .env and credentials files were left in place.");
  return { failed };
}
