import { closeSync, chmodSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";

const DEFAULT_TASK_SUMMARY_PATH = "/workspace/public-status/recovery.json";

function currentTime(now) {
  const value = now();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Task registry clock returned an invalid time.");
  return date.toISOString();
}

function ensureDirectoryPath(directory, mode, message, { enforceMode = true, requirePublicRead = false } = {}) {
  const resolved = path.resolve(directory);
  let current = path.parse(resolved).root;
  const parts = path.relative(current, resolved).split(path.sep).filter(Boolean);
  let createdFinal = false;
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    current = path.join(current, part);
    try {
      const metadata = lstatSync(current);
      if (metadata.isSymbolicLink() || !metadata.isDirectory()) throw new Error(message);
      if (index === parts.length - 1 && requirePublicRead && (metadata.mode & 0o005) !== 0o005) {
        throw new Error("Public task summary directory must be readable and traversable by the launchpad user.");
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      mkdirSync(current, { mode });
      if (index === parts.length - 1) createdFinal = true;
    }
  }
  if (enforceMode || createdFinal) chmodSync(resolved, mode);
}

function ensureParentDirectories(home) {
  const directories = [
    path.resolve(home),
    path.resolve(home, ".local"),
    path.resolve(home, ".local/state"),
    path.resolve(home, ".local/state/clouddev"),
  ];
  for (const directory of directories) ensureDirectoryPath(directory, 0o700, "Task registry refuses symlinked private state directories.");
}

function summarizeStatuses(tasks) {
  const counts = { total: tasks.length, running: 0, interrupted: 0, completed: 0, failed: 0, other: 0 };
  for (const task of tasks) {
    if (Object.hasOwn(counts, task.status)) counts[task.status] += 1;
    else counts.other += 1;
  }
  return { version: 1, counts };
}

function safeIdentifier(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{1,256}$/.test(value)) {
    throw new Error(`Task registry received an invalid ${label}.`);
  }
  return value;
}

function optionalProjectPath(value) {
  if (value == null) return null;
  if (typeof value !== "string" || !path.isAbsolute(value) || /[\r\n\0]/.test(value)) {
    throw new Error("Task registry received an invalid project path.");
  }
  return path.resolve(value);
}

function validateState(state) {
  if (!state || state.version !== 1 || !Array.isArray(state.tasks)) {
    throw new Error("Task registry state has an unsupported format.");
  }
  for (const task of state.tasks) {
    if (!task || typeof task !== "object" || typeof task.taskId !== "string"
      || typeof task.appSessionId !== "string" || typeof task.provider !== "string"
      || !["running", "interrupted", "completed", "failed"].includes(task.status)) {
      throw new Error("Task registry state contains an invalid task record.");
    }
  }
  return state;
}

function createRecord(input, taskId, startedAt) {
  const providerSessionId = input.providerSessionId == null
    ? null
    : safeIdentifier(input.providerSessionId, "provider session id");
  return {
    taskId: safeIdentifier(taskId, "task id"),
    appSessionId: safeIdentifier(input.appSessionId, "CloudCLI session id"),
    provider: safeIdentifier(input.provider, "provider"),
    providerSessionId,
    launchMode: input.launchMode === "terminal" ? "terminal" : "cloudcli",
    tmuxSession: input.tmuxSession == null ? null : safeIdentifier(input.tmuxSession, "tmux session"),
    projectPath: optionalProjectPath(input.projectPath),
    status: "running",
    startedAt,
    updatedAt: startedAt,
    completedAt: null,
  };
}

function userInitiatedResumeAction(task) {
  if (task.status !== "interrupted" || !task.providerSessionId) return null;
  if (task.provider !== "codex" && task.provider !== "claude") return null;
  return {
    kind: "cloudcli-session",
    sessionId: task.providerSessionId,
    provider: task.provider,
    userInitiated: true,
  };
}

export function createTaskRegistry({
  home = process.env.HOME,
  summaryPath,
  now = () => new Date(),
  idFactory = randomUUID,
} = {}) {
  if (typeof home !== "string" || home.length === 0) {
    throw new Error("Task registry requires the persistent user home directory.");
  }

  const resolvedHome = path.resolve(home);
  const filePath = path.join(resolvedHome, ".local/state/clouddev/tasks.json");
  const directory = path.dirname(filePath);
  const fallbackSummaryPath = resolvedHome === "/workspace/home"
    ? DEFAULT_TASK_SUMMARY_PATH
    : path.join(resolvedHome, ".local/state/clouddev/recovery-summary.json");
  const rawSummaryPath = summaryPath
    ?? process.env.CLOUDDEV_TASK_SUMMARY_PATH
    ?? fallbackSummaryPath;
  if (typeof rawSummaryPath !== "string" || !path.isAbsolute(rawSummaryPath)) {
    throw new Error("Task summary path must be absolute.");
  }
  const resolvedSummaryPath = path.resolve(rawSummaryPath);
  const summaryDirectory = path.dirname(resolvedSummaryPath);
  const privateSummaryPath = resolvedSummaryPath === resolvedHome || resolvedSummaryPath.startsWith(`${resolvedHome}${path.sep}`);

  function readState() {
    ensureParentDirectories(resolvedHome);
    try {
      const metadata = lstatSync(filePath);
      if (metadata.isSymbolicLink() || !metadata.isFile()) {
        throw new Error("Task registry refuses a symlink or non-file state path.");
      }
      if ((metadata.mode & 0o077) !== 0) {
        throw new Error("Task registry file permissions must be mode 0600.");
      }
      return validateState(JSON.parse(readFileSync(filePath, "utf8")));
    } catch (error) {
      if (error?.code === "ENOENT") return { version: 1, tasks: [] };
      throw error;
    }
  }

  function writeState(state) {
    ensureParentDirectories(resolvedHome);
    const content = `${JSON.stringify(validateState(state), null, 2)}\n`;
    const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
    let descriptor;
    try {
      descriptor = openSync(temporaryPath, "wx", 0o600);
      writeSync(descriptor, content, null, "utf8");
      fsyncSync(descriptor);
      closeSync(descriptor);
      descriptor = undefined;
      renameSync(temporaryPath, filePath);
      chmodSync(filePath, 0o600);
    } catch (error) {
      if (descriptor !== undefined) closeSync(descriptor);
      try { unlinkSync(temporaryPath); } catch { /* The temp file may already be renamed. */ }
      throw error;
    }
    writeSummary(state);
  }

  function writeSummary(state) {
    ensureDirectoryPath(
      summaryDirectory,
      privateSummaryPath ? 0o700 : 0o755,
      "Task summary refuses symlinked or non-directory public status paths.",
      { enforceMode: privateSummaryPath, requirePublicRead: !privateSummaryPath },
    );
    try {
      const existing = lstatSync(resolvedSummaryPath);
      if (existing.isSymbolicLink() || !existing.isFile()) {
        throw new Error("Task summary refuses a symlink or non-file public status path.");
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }

    const content = `${JSON.stringify(summarizeStatuses(state.tasks))}\n`;
    const temporaryPath = `${resolvedSummaryPath}.${randomUUID()}.tmp`;
    let descriptor;
    try {
      descriptor = openSync(temporaryPath, "wx", 0o644);
      writeSync(descriptor, content, null, "utf8");
      fsyncSync(descriptor);
      closeSync(descriptor);
      descriptor = undefined;
      renameSync(temporaryPath, resolvedSummaryPath);
      chmodSync(resolvedSummaryPath, 0o644);
    } catch (error) {
      if (descriptor !== undefined) closeSync(descriptor);
      try { unlinkSync(temporaryPath); } catch { /* The temp file may already be renamed. */ }
      throw error;
    }
  }

  function update(taskId, updater) {
    const state = readState();
    const index = state.tasks.findIndex(task => task.taskId === taskId);
    if (index < 0) return null;
    const updated = updater({ ...state.tasks[index] });
    state.tasks[index] = updated;
    writeState(state);
    return { ...updated };
  }

  return Object.freeze({
    filePath,
    summaryPath: resolvedSummaryPath,

    start(input = {}) {
      const state = readState();
      const taskId = safeIdentifier(input.taskId ?? idFactory(), "task id");
      if (state.tasks.some(task => task.taskId === taskId)) {
        throw new Error("Task registry task id already exists.");
      }
      const task = createRecord(input, taskId, currentTime(now));
      state.tasks.push(task);
      writeState(state);
      return { ...task };
    },

    setProviderSessionId(taskId, providerSessionId) {
      const safeTaskId = safeIdentifier(taskId, "task id");
      const safeSessionId = safeIdentifier(providerSessionId, "provider session id");
      return update(safeTaskId, task => ({ ...task, providerSessionId: safeSessionId, updatedAt: currentTime(now) }));
    },

    complete(taskId) {
      const timestamp = currentTime(now);
      return update(safeIdentifier(taskId, "task id"), task => ({
        ...task,
        status: "completed",
        completedAt: timestamp,
        updatedAt: timestamp,
      }));
    },

    fail(taskId) {
      const timestamp = currentTime(now);
      return update(safeIdentifier(taskId, "task id"), task => ({ ...task, status: "failed", updatedAt: timestamp }));
    },

    remove(taskId) {
      const state = readState();
      const nextTasks = state.tasks.filter(task => task.taskId !== safeIdentifier(taskId, "task id"));
      if (nextTasks.length === state.tasks.length) return false;
      state.tasks = nextTasks;
      writeState(state);
      return true;
    },

    markRunningInterrupted() {
      const state = readState();
      const timestamp = currentTime(now);
      let interrupted = 0;
      state.tasks = state.tasks.map(task => {
        if (task.status !== "running") return task;
        interrupted += 1;
        return { ...task, status: "interrupted", updatedAt: timestamp };
      });
      writeState(state);
      return interrupted;
    },

    list() {
      return readState().tasks.map(task => ({ ...task, resumeAction: userInitiatedResumeAction(task) }));
    },
  });
}
