import { createTaskRegistry } from "./task-registry.mjs";
import { attachTerminalTask } from "./terminal-agent.mjs";

export function formatTaskList(tasks) {
  if (tasks.length === 0) return "No tracked CloudCLI runs.\n";
  const rows = tasks.map(task => {
    const providerSession = task.providerSessionId ? `provider session ${task.providerSessionId}` : "provider session not recorded";
    const action = task.status === "running" && task.launchMode === "terminal" && task.tmuxSession
      ? `reconnect with: clouddev-tasks --attach ${task.taskId}`
      : task.status === "interrupted" && task.resumeAction
        ? `manual resume in CloudCLI UI: ${task.resumeAction.sessionId}`
        : task.status === "interrupted"
          ? `open CloudCLI and select the recent ${task.provider} session for ${task.projectPath || "this workspace"}`
          : task.status;
    const project = task.projectPath ? `  project ${task.projectPath}` : "";
    return `${task.taskId}  ${task.provider}  ${task.status}  ${providerSession}${project}\n  ${action}`;
  });
  return `${rows.join("\n")}\n`;
}

export async function printTaskList({ home = process.env.HOME, stdout = process.stdout, args = process.argv.slice(2) } = {}) {
  if (args[0] === "--attach") return await attachTerminalTask(args[1], { home });
  if (args.length > 0) throw new Error("Use `clouddev-tasks` or `clouddev-tasks --attach ID`.");
  const registry = createTaskRegistry({ home });
  stdout.write(formatTaskList(registry.list()));
  return 0;
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  try {
    const result = await printTaskList();
    if (Number.isInteger(result)) process.exitCode = result;
  } catch {
    process.stderr.write("CloudDev could not read the private task registry. Check the persistent home permissions.\n");
    process.exitCode = 1;
  }
}
