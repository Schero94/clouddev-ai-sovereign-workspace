import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";
import { createTaskRegistry } from "../src/task-registry.mjs";
import { buildTmuxCommand } from "../src/terminal-agent.mjs";
import { formatTaskList } from "../src/list-tasks.mjs";
import { createCloudCliGatewayRefresher } from "../src/cloudcli-gateway-refresh.mjs";
import { installCloudCliTaskHook } from "../src/cloudcli-runtime-hook.mjs";

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultCloudCliRoot = path.join(serviceRoot, "cloudcli-ui/node_modules/@cloudcli-ai/cloudcli");
const cloudCliRoot = process.env.CLOUDDEV_CLOUDCLI_PACKAGE_ROOT || defaultCloudCliRoot;
const packageAvailable = existsSync(path.join(cloudCliRoot, "package.json"));
const tmuxAvailable = spawnSync("tmux", ["-V"], { encoding: "utf8" }).status === 0;

function makeHome() {
  const home = realpathSync(mkdtempSync(path.join(os.tmpdir(), "clouddev-cloudcli-runtime-")));
  mkdirSync(path.join(home, ".cloudcli"), { recursive: true, mode: 0o700 });
  mkdirSync(path.join(home, ".codex/sessions/2026/10/24"), { recursive: true, mode: 0o700 });
  mkdirSync(path.join(home, ".claude/projects/demo"), { recursive: true, mode: 0o700 });
  mkdirSync(path.join(home, "project"), { recursive: true, mode: 0o700 });
  return home;
}

function withEnvironment(values, body) {
  const previous = new Map(Object.keys(values).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) process.env[key] = value;
  return Promise.resolve().then(body).finally(() => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

async function waitForFile(filePath, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(filePath)) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error("Detached mock provider did not write its transcript artifact in time.");
}

test("CloudCLI run recovery and tmux-disconnected provider transcripts use the pinned upstream session indexers", {
  skip: !packageAvailable ? "Install the exact CloudCLI package to run upstream integration checks." : false,
}, async () => {
  const home = makeHome();
  const databasePath = path.join(home, ".cloudcli/auth.db");
  const tmuxRoot = path.join(home, "tmux");
  mkdirSync(tmuxRoot, { mode: 0o700 });
  const tmuxSocket = `clouddev-test-${process.pid}`;
  const tmuxEnv = { HOME: home, TMUX_TMPDIR: tmuxRoot, PATH: process.env.PATH || "/usr/bin:/bin" };
  const tmux = args => spawnSync("tmux", ["-L", tmuxSocket, "-f", "/dev/null", ...args], {
    env: tmuxEnv,
    encoding: "utf8",
    stdio: "ignore",
  });

  try {
    await withEnvironment({ HOME: home, DATABASE_PATH: databasePath }, async () => {
      const manifest = JSON.parse(readFileSync(path.join(cloudCliRoot, "package.json"), "utf8"));
      assert.equal(manifest.version, "1.37.5");
      const registryUrl = pathToFileURL(path.join(cloudCliRoot, "dist-server/server/modules/websocket/services/chat-run-registry.service.js")).href;
      const { chatRunRegistry } = await import(registryUrl);
      const databaseUrl = pathToFileURL(path.join(cloudCliRoot, "dist-server/server/modules/database/index.js")).href;
      const database = await import(databaseUrl);
      await database.initializeDatabase();
      chatRunRegistry.clearAll();
      const cloudCliTasks = createTaskRegistry({ home, idFactory: () => "cloudcli-task-1" });
      const providerRegistryUrl = pathToFileURL(path.join(cloudCliRoot, "dist-server/server/modules/providers/provider.registry.js")).href;
      const providerModelsUrl = pathToFileURL(path.join(cloudCliRoot, "dist-server/server/modules/providers/services/provider-models.service.js")).href;
      const [{ providerRegistry }, { providerModelsService }] = await Promise.all([
        import(providerRegistryUrl),
        import(providerModelsUrl),
      ]);
      const refreshProviderConfig = createCloudCliGatewayRefresher({ home });
      const restoreHook = installCloudCliTaskHook(chatRunRegistry, cloudCliTasks, {
        idFactory: () => "cloudcli-task-1",
        providerRegistry,
        providerModelsService,
        refreshProviderConfig,
      });
      try {
        const run = chatRunRegistry.startRun({
          appSessionId: "cloudcli-app-session-1",
          provider: "codex",
          providerSessionId: null,
          userId: "single-user",
          connection: { readyState: 3, send() { throw new Error("closed websocket must not receive data"); } },
        });
        assert.ok(run);
        run.writer.send({ kind: "session_created", sessionId: "provider-session-1" });
        run.writer.send({ kind: "text", text: "provider still working after browser disconnect" });
        assert.equal(chatRunRegistry.isProcessing("cloudcli-app-session-1"), true);
        assert.equal(cloudCliTasks.list()[0].status, "running");
        assert.equal(cloudCliTasks.list()[0].providerSessionId, "provider-session-1");
        run.writer.sendComplete({ exitCode: 0 });
        assert.equal(cloudCliTasks.list()[0].status, "completed");
      } finally {
        chatRunRegistry.clearAll();
        restoreHook();
      }

      if (!tmuxAvailable) return;

      const projectPath = path.join(home, "project");
      const taskRegistry = createTaskRegistry({ home, idFactory: () => "terminal-task-1" });
      taskRegistry.start({
        taskId: "terminal-task-1",
        appSessionId: "terminal:terminal-task-1",
        provider: "codex",
        launchMode: "terminal",
        tmuxSession: "clouddev-codex-terminal-task-1",
        projectPath,
      });

      const codexSessionId = "codex-tmux-session-1";
      const transcriptPath = path.join(home, ".codex/sessions/2026/10/24", `rollout-${codexSessionId}.jsonl`);
      const mockRunnerPath = path.join(home, "mock-codex-runner.mjs");
      writeFileSync(mockRunnerPath, [
        'import { mkdirSync, writeFileSync } from "node:fs";',
        'import path from "node:path";',
        'const [, , mode, taskId, provider, transcript, project] = process.argv;',
        'if (mode !== "run" || provider !== "codex" || !taskId) process.exit(2);',
        'mkdirSync(path.dirname(transcript), { recursive: true, mode: 0o700 });',
        'writeFileSync(transcript, JSON.stringify({ type: "session_meta", payload: { id: "codex-tmux-session-1", cwd: project, thread_source: "user", source: "cli" } }) + "\\n");',
        'setInterval(() => {}, 1000);',
      ].join("\n"), { mode: 0o600 });
      const command = buildTmuxCommand({
        nodePath: process.execPath,
        runnerPath: mockRunnerPath,
        taskId: "terminal-task-1",
        provider: "codex",
        args: [transcriptPath, projectPath],
      });
      const created = tmux(["new-session", "-d", "-s", "clouddev-codex-terminal-task-1", "-c", projectPath, command]);
      assert.equal(created.status, 0, "tmux must start the remote task detached from its client");
      await waitForFile(transcriptPath);
      assert.equal(tmux(["has-session", "-t", "clouddev-codex-terminal-task-1"]).status, 0,
        "the task remains alive after the client that created it exits");

      const { sessionSynchronizerService } = await import(pathToFileURL(path.join(cloudCliRoot, "dist-server/server/modules/providers/services/session-synchronizer.service.js")).href);
      const { sessionsDb } = database;
      const sync = await sessionSynchronizerService.synchronizeProviderFile("codex", transcriptPath);
      const indexed = sessionsDb.getSessionByProviderSessionId(codexSessionId);
      assert.equal(sync.indexed, true);
      assert.equal(sync.sessionId, codexSessionId);
      assert.equal(indexed?.project_path, projectPath);
      assert.equal(indexed?.jsonl_path, transcriptPath);

      assert.equal(tmux(["kill-session", "-t", "clouddev-codex-terminal-task-1"]).status, 0);
      const afterRestart = createTaskRegistry({ home });
      assert.equal(afterRestart.markRunningInterrupted(), 1);
      const interrupted = afterRestart.list().find(task => task.taskId === "terminal-task-1");
      assert.equal(interrupted.status, "interrupted");
      assert.equal(interrupted.resumeAction, null, "no provider session id is fabricated from the tmux id");
      const instructions = formatTaskList([interrupted]);
      assert.match(instructions, /open CloudCLI and select the recent codex session/);
      assert.doesNotMatch(instructions, /automatic replay|automatic resume/i);
      assert.equal(tmux(["has-session", "-t", "clouddev-codex-terminal-task-1"]).status, 1,
        "restart recovery does not automatically replay the command");
      database.closeConnection();
    });
  } finally {
    tmux(["kill-server"]);
    rmSync(home, { recursive: true, force: true });
  }
});
