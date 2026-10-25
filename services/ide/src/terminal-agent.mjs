import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchAgent } from "./ai-cli.mjs";
import { buildServiceEnvironment } from "./service-environment.mjs";
import { createTaskRegistry } from "./task-registry.mjs";

const MODULE_PATH = fileURLToPath(import.meta.url);
const SAFE_TMUX_ENVIRONMENT = ({ source, home }) => buildServiceEnvironment("code-server", {
  source,
  home,
  projectsDirectory: "/workspace/projects",
});

export function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

export function buildTmuxCommand({ nodePath = process.execPath, runnerPath = MODULE_PATH, taskId, provider, args = [] }) {
  if (provider !== "codex" && provider !== "claude") throw new Error("Unsupported terminal agent provider.");
  if (typeof taskId !== "string" || !/^[A-Za-z0-9._:-]{1,256}$/.test(taskId)) throw new Error("Terminal task id is invalid.");
  const command = [nodePath, runnerPath, "run", taskId, provider, ...args];
  if (command.some(value => typeof value !== "string" || /\0/.test(value))) throw new Error("Terminal agent arguments contain an invalid value.");
  return `exec ${command.map(shellQuote).join(" ")}`;
}

function awaitChild(child) {
  if (!child || typeof child.once !== "function") return Promise.reject(new Error("Could not start the tmux client."));
  return new Promise(resolve => {
    child.once("error", () => resolve(1));
    child.once("close", (code, signal) => resolve(signal === "SIGINT" ? 130 : signal === "SIGTERM" ? 143 : Number.isInteger(code) ? code : 1));
  });
}

export async function startAgentInTmux(provider, args = [], {
  home = process.env.HOME,
  cwd = process.cwd(),
  source = process.env,
  taskRegistry = createTaskRegistry({ home }),
  stdin = process.stdin,
  stdout = process.stdout,
  stderr = process.stderr,
  spawnSyncImpl = spawnSync,
  spawnImpl = spawn,
  idFactory = randomUUID,
  nodePath = process.execPath,
  runnerPath = MODULE_PATH,
  tmuxPath = "tmux",
} = {}) {
  if (provider !== "codex" && provider !== "claude") throw new Error("Unsupported terminal agent provider.");
  if (!stdin?.isTTY || !stdout?.isTTY) {
    stderr.write("Run `ai-codex` or `ai-claude` in an interactive IDE terminal so the remote task can survive a client disconnect.\n");
    return { status: 2 };
  }
  if (typeof home !== "string" || !path.isAbsolute(home)) throw new Error("Persistent IDE home is unavailable.");
  const absoluteCwd = path.resolve(cwd);
  if (!existsSync(absoluteCwd) || !statSync(absoluteCwd).isDirectory()) throw new Error("Current project directory is unavailable.");

  const taskId = idFactory();
  if (typeof taskId !== "string" || !/^[A-Za-z0-9._:-]{1,256}$/.test(taskId)) throw new Error("Terminal task id generator returned an invalid id.");
  const tmuxSession = `clouddev-${provider}-${taskId.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 48)}`;
  taskRegistry.start({
    taskId,
    appSessionId: `terminal:${taskId}`,
    provider,
    launchMode: "terminal",
    tmuxSession,
    projectPath: absoluteCwd,
  });

  const environment = SAFE_TMUX_ENVIRONMENT({ source, home });
  const tmuxCommand = buildTmuxCommand({ nodePath, runnerPath, taskId, provider, args });
  let created;
  try {
    created = spawnSyncImpl(tmuxPath, ["new-session", "-d", "-s", tmuxSession, "-c", absoluteCwd, tmuxCommand], {
      cwd: absoluteCwd,
      env: environment,
      stdio: "ignore",
      encoding: "utf8",
    });
  } catch {
    taskRegistry.fail(taskId);
    stderr.write("Could not create a persistent tmux task. Check that tmux is installed and the workspace volume is writable.\n");
    return { status: 1, taskId, tmuxSession };
  }
  if (created?.status !== 0) {
    taskRegistry.fail(taskId);
    stderr.write("Could not create a persistent tmux task. Check that tmux is installed and the workspace volume is writable.\n");
    return { status: 1, taskId, tmuxSession };
  }

  stdout.write(`Task ${taskId} is running in tmux session ${tmuxSession}. If this client disconnects, use \`clouddev-tasks --attach ${taskId}\` to reconnect.\n`);
  let attachChild;
  try {
    attachChild = spawnImpl(tmuxPath, ["attach-session", "-t", tmuxSession], {
      cwd: absoluteCwd,
      env: environment,
      stdio: "inherit",
    });
  } catch {
    stderr.write(`The task may still be running. Reconnect with \`clouddev-tasks --attach ${taskId}\`.\n`);
    return { status: 1, taskId, tmuxSession };
  }
  const status = await awaitChild(attachChild);
  return { status, taskId, tmuxSession };
}

export async function attachTerminalTask(taskId, {
  home = process.env.HOME,
  source = process.env,
  stdin = process.stdin,
  stdout = process.stdout,
  stderr = process.stderr,
  spawnSyncImpl = spawnSync,
  spawnImpl = spawn,
  tmuxPath = "tmux",
} = {}) {
  if (!stdin?.isTTY || !stdout?.isTTY) {
    stderr.write("Run `clouddev-tasks --attach ID` in an interactive IDE terminal.\n");
    return 2;
  }
  const task = createTaskRegistry({ home }).list().find(item => item.taskId === taskId);
  if (!task || task.launchMode !== "terminal" || !task.tmuxSession || task.status !== "running") {
    stderr.write("That terminal task is not currently attachable. Check CloudCLI for manual session resume after it has stopped.\n");
    return 2;
  }
  const environment = SAFE_TMUX_ENVIRONMENT({ source, home });
  const check = spawnSyncImpl(tmuxPath, ["has-session", "-t", task.tmuxSession], { env: environment, stdio: "ignore" });
  if (check?.status !== 0) {
    stderr.write("The tmux task is no longer running. Open CloudCLI and manually resume its provider session if the transcript is indexed.\n");
    return 2;
  }
  const child = spawnImpl(tmuxPath, ["attach-session", "-t", task.tmuxSession], { env: environment, stdio: "inherit" });
  return await awaitChild(child);
}

export async function runTerminalTask(taskId, provider, args = [], {
  home = process.env.HOME,
  cwd = process.cwd(),
  env = process.env,
  taskRegistry = createTaskRegistry({ home }),
  launchAgentImpl = launchAgent,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  const task = taskRegistry.list().find(item => item.taskId === taskId);
  if (!task || task.launchMode !== "terminal" || task.provider !== provider || task.status !== "running") {
    stderr.write("The terminal task is missing from the persistent task registry.\n");
    return 2;
  }
  try {
    const status = await launchAgentImpl(provider, args, { home, cwd, env });
    if (status === 0) taskRegistry.complete(taskId);
    else taskRegistry.fail(taskId);
    return status;
  } catch (error) {
    taskRegistry.fail(taskId);
    const message = error instanceof Error ? error.message : "The provider CLI failed.";
    stderr.write(`${message}\n`);
    return 1;
  }
}

async function main(argv) {
  if (argv[0] === "launch") {
    const [provider, ...args] = argv.slice(1);
    const result = await startAgentInTmux(provider, args);
    return result.status;
  }
  if (argv[0] === "run") {
    const [taskId, provider, ...args] = argv.slice(1);
    return await runTerminalTask(taskId, provider, args);
  }
  if (argv[0] === "attach") {
    return await attachTerminalTask(argv[1]);
  }
  process.stderr.write("Usage: terminal-agent.mjs launch <codex|claude> [args...]\n");
  return 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === MODULE_PATH) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code; }).catch(() => {
    process.stderr.write("CloudDev could not start the terminal agent task.\n");
    process.exitCode = 1;
  });
}
