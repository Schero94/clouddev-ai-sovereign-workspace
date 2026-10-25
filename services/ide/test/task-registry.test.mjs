import assert from "node:assert/strict";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { createTaskRegistry } from "../src/task-registry.mjs";

const roots = new Set();
const instant = "2026-10-24T12:00:00.000Z";

function makeHome() {
  const home = realpathSync(mkdtempSync(path.join(os.tmpdir(), "clouddev-task-registry-")));
  roots.add(home);
  return home;
}

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.clear();
});

test("persists only non-secret task metadata in the persistent home with private permissions", () => {
  const home = makeHome();
  const registry = createTaskRegistry({ home, now: () => instant, idFactory: () => "task-1" });
  const task = registry.start({
    taskId: "task-1",
    appSessionId: "cloudcli-session-1",
    provider: "codex",
    providerSessionId: null,
    prompt: "must not be saved",
    apiKey: "must not be saved",
  });
  const pathName = path.join(home, ".local/state/clouddev/tasks.json");
  const content = readFileSync(pathName, "utf8");
  assert.equal(statSync(pathName).mode & 0o777, 0o600);
  assert.equal(statSync(path.dirname(pathName)).mode & 0o777, 0o700);
  assert.deepEqual(Object.keys(task).sort(), [
    "appSessionId", "completedAt", "launchMode", "projectPath", "provider", "providerSessionId", "startedAt", "status", "taskId", "tmuxSession", "updatedAt",
  ]);
  assert.equal(task.status, "running");
  assert.equal(content.includes("must not be saved"), false);
  assert.equal(content.includes("apiKey"), false);
  assert.equal(content.includes("prompt"), false);
});

test("marks running records interrupted at boot and exposes only a supported manual CloudCLI resume", () => {
  const home = makeHome();
  const first = createTaskRegistry({ home, now: () => instant, idFactory: () => "task-1" });
  first.start({ taskId: "task-1", appSessionId: "app-1", provider: "codex" });
  first.setProviderSessionId("task-1", "provider-session-1");
  first.start({ taskId: "task-2", appSessionId: "app-2", provider: "claude", providerSessionId: "provider-session-2" });
  first.complete("task-1");

  const afterRestart = createTaskRegistry({ home, now: () => "2026-10-24T13:00:00.000Z" });
  assert.equal(afterRestart.markRunningInterrupted(), 1);
  const tasks = afterRestart.list();
  assert.equal(tasks.find(task => task.taskId === "task-1").status, "completed");
  const interrupted = tasks.find(task => task.taskId === "task-2");
  assert.equal(interrupted.status, "interrupted");
  assert.deepEqual(interrupted.resumeAction, {
    kind: "cloudcli-session",
    sessionId: "provider-session-2",
    provider: "claude",
    userInitiated: true,
  });
});

test("does not claim resumability without a provider session id or for an unknown provider", () => {
  const home = makeHome();
  let id = 0;
  const registry = createTaskRegistry({ home, now: () => instant, idFactory: () => `task-${++id}` });
  registry.start({ appSessionId: "app-1", provider: "codex" });
  registry.start({ appSessionId: "app-2", provider: "unknown", providerSessionId: "session-x" });
  registry.markRunningInterrupted();
  assert.equal(registry.list().every(task => task.resumeAction === null), true);
});

test("rejects symlinked task state instead of following it", () => {
  const home = makeHome();
  const target = path.join(home, "outside.json");
  const state = path.join(home, ".local/state/clouddev/tasks.json");
  const registry = createTaskRegistry({ home, now: () => instant, idFactory: () => "task-1" });
  registry.start({ appSessionId: "app-1", provider: "codex" });
  rmSync(state);
  symlinkSync(target, state);
  assert.throws(() => registry.list(), /symlink/i);
});

test("publishes an atomic public recovery summary with counts only", () => {
  const workspace = makeHome();
  const home = path.join(workspace, "home");
  mkdirSync(home);
  const publicDirectory = path.join(workspace, "public-status");
  const summaryPath = path.join(publicDirectory, "recovery.json");
  const registry = createTaskRegistry({ home, summaryPath, now: () => instant, idFactory: () => "private-task-id" });
  registry.start({
    taskId: "private-task-id",
    appSessionId: "private-app-session-id",
    provider: "codex",
    providerSessionId: "private-provider-session-id",
    projectPath: "/private/project/path",
    prompt: "private prompt text",
    apiKey: "private credential",
  });
  registry.start({ taskId: "private-task-2", appSessionId: "private-app-session-2", provider: "claude" });
  registry.markRunningInterrupted();

  const summary = readFileSync(summaryPath, "utf8");
  assert.deepEqual(JSON.parse(summary), {
    version: 1,
    counts: { total: 2, running: 0, interrupted: 2, completed: 0, failed: 0, other: 0 },
  });
  assert.equal(statSync(path.dirname(summaryPath)).mode & 0o777, 0o755);
  assert.equal(statSync(summaryPath).mode & 0o777, 0o644);
  for (const forbidden of ["private-task-id", "private-app-session-id", "private-provider-session-id", "/private/project/path", "private prompt text", "private credential"]) {
    assert.equal(summary.includes(forbidden), false, `public summary must not contain ${forbidden}`);
  }

  const authoritative = readFileSync(registry.filePath, "utf8");
  assert.match(authoritative, /private-provider-session-id/);
  assert.equal(statSync(registry.filePath).mode & 0o777, 0o600);
  assert.equal(registry.summaryPath, summaryPath);
});

test("refuses symlinked public summary file and parent directories", () => {
  const workspace = makeHome();
  const outside = path.join(workspace, "outside.json");
  writeFileSync(outside, "protected target");
  const fileSummary = path.join(workspace, "file-status", "recovery.json");
  mkdirSync(path.dirname(fileSummary));
  symlinkSync(outside, fileSummary);
  const fileRegistry = createTaskRegistry({ home: path.join(workspace, "file-home"), summaryPath: fileSummary });
  assert.throws(() => fileRegistry.start({ taskId: "task-1", appSessionId: "app-1", provider: "codex" }), /symlink/i);

  const directoryTarget = path.join(workspace, "outside-directory");
  mkdirSync(directoryTarget);
  const symlinkDirectory = path.join(workspace, "linked-status");
  symlinkSync(directoryTarget, symlinkDirectory);
  const directoryRegistry = createTaskRegistry({
    home: path.join(workspace, "directory-home"),
    summaryPath: path.join(symlinkDirectory, "recovery.json"),
  });
  assert.throws(() => directoryRegistry.start({ taskId: "task-2", appSessionId: "app-2", provider: "claude" }), /symlink/i);
  assert.equal(readFileSync(outside, "utf8"), "protected target");
});
