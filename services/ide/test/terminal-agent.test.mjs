import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { createTaskRegistry } from "../src/task-registry.mjs";
import { buildTmuxCommand, startAgentInTmux, runTerminalTask } from "../src/terminal-agent.mjs";

const roots = new Set();

function makeHome() {
  const home = realpathSync(mkdtempSync(path.join(os.tmpdir(), "clouddev-terminal-agent-")));
  roots.add(home);
  return home;
}

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.clear();
});

test("builds a safely quoted detached tmux task command", () => {
  const command = buildTmuxCommand({
    nodePath: "/usr/bin/node",
    runnerPath: "/opt/clouddev-ide/src/terminal-agent.mjs",
    taskId: "task-1",
    provider: "codex",
    args: ["--model", "openai/mock", "text with spaces", "'; touch /tmp/should-not-run; '"] ,
  });
  assert.match(command, /^exec '/);
  assert.ok(command.includes("'text with spaces'"));
  assert.ok(command.includes("'\\''; touch /tmp/should-not-run; '\\''"));
  assert.equal(command.includes("RAILWAY_TOKEN"), false);
});

test("records the task before attaching, then leaves it running when the client detaches", async () => {
  const home = makeHome();
  const cwd = path.join(home, "project");
  mkdirSync(cwd);
  const taskRegistry = createTaskRegistry({ home, idFactory: () => "task-1" });
  let newSession;
  let attach;
  const result = await startAgentInTmux("codex", ["--version"], {
    home,
    cwd,
    taskRegistry,
    source: {
      HOME: home,
      PATH: "/usr/local/bin:/usr/bin:/bin",
      RAILWAY_TOKEN: "must-not-inherit",
      FORGEJO_ADMIN_TOKEN: "must-not-inherit",
      OMNIROUTE_MASTER_KEY: "must-not-inherit",
      CODE_SERVER_PASSWORD: "must-not-inherit",
      OMNIROUTE_API_KEY: "must-not-inherit",
    },
    stdin: { isTTY: true },
    stdout: { isTTY: true, write() {} },
    stderr: { write() {} },
    spawnSyncImpl: (command, args, options) => {
      newSession = { command, args, options };
      return { status: 0, error: undefined };
    },
    spawnImpl: (command, args, options) => {
      attach = { command, args, options };
      const child = new EventEmitter();
      queueMicrotask(() => child.emit("close", 0, null));
      return child;
    },
  });
  assert.equal(result.status, 0);
  assert.equal(newSession.command, "tmux");
  assert.equal(newSession.args[0], "new-session");
  assert.equal(attach.args[0], "attach-session");
  assert.equal(newSession.options.env.RAILWAY_TOKEN, undefined);
  assert.equal(newSession.options.env.FORGEJO_ADMIN_TOKEN, undefined);
  assert.equal(newSession.options.env.OMNIROUTE_MASTER_KEY, undefined);
  assert.equal(newSession.options.env.OMNIROUTE_API_KEY, undefined);
  const task = taskRegistry.list()[0];
  assert.equal(task.status, "running");
  assert.equal(task.launchMode, "terminal");
  assert.equal(task.tmuxSession, result.tmuxSession);
  assert.equal(task.projectPath, cwd);
});

test("refuses to launch detached provider tasks without an interactive terminal", async () => {
  const home = makeHome();
  const taskRegistry = createTaskRegistry({ home });
  let started = false;
  const errorOutput = [];
  const result = await startAgentInTmux("claude", [], {
    home,
    taskRegistry,
    stdin: { isTTY: false },
    stdout: { isTTY: false },
    stderr: { write(value) { errorOutput.push(value); } },
    spawnSyncImpl: () => { started = true; return { status: 0 }; },
  });
  assert.equal(result.status, 2);
  assert.equal(started, false);
  assert.equal(taskRegistry.list().length, 0);
  assert.match(errorOutput.join(""), /interactive IDE terminal/);
});

test("marks terminal tasks completed only when the provider command exits", async () => {
  const home = makeHome();
  const taskRegistry = createTaskRegistry({ home, idFactory: () => "task-1" });
  taskRegistry.start({
    taskId: "task-1",
    appSessionId: "terminal:task-1",
    provider: "claude",
    launchMode: "terminal",
    tmuxSession: "clouddev-claude-task-1",
    projectPath: home,
  });
  const result = await runTerminalTask("task-1", "claude", ["--version"], {
    home,
    taskRegistry,
    launchAgentImpl: async () => 0,
    stdout: { write() {} },
    stderr: { write() {} },
  });
  assert.equal(result, 0);
  assert.equal(taskRegistry.list()[0].status, "completed");
});

test("runs the provider CLI from the tracked project's working directory", async () => {
  const home = makeHome();
  const project = path.join(home, "projects/mock-app");
  mkdirSync(project, { recursive: true });
  const taskRegistry = createTaskRegistry({ home, idFactory: () => "task-project-cwd" });
  taskRegistry.start({
    taskId: "task-project-cwd",
    appSessionId: "terminal:task-project-cwd",
    provider: "codex",
    launchMode: "terminal",
    tmuxSession: "clouddev-codex-task-project-cwd",
    projectPath: project,
  });
  let capturedCwd;
  const result = await runTerminalTask("task-project-cwd", "codex", ["--help"], {
    home,
    cwd: project,
    taskRegistry,
    launchAgentImpl: async (_agent, _args, options) => {
      capturedCwd = options.cwd;
      return 0;
    },
    stdout: { write() {} },
    stderr: { write() {} },
  });

  assert.equal(result, 0);
  assert.equal(capturedCwd, project);
  assert.equal(taskRegistry.list()[0].status, "completed");
});
