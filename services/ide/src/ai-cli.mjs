import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createInterface } from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureCodexGatewayConfig } from "./codex-config.mjs";

export const DEFAULT_BASE_URL = "http://127.0.0.1:20129";
export const API_KEY_ENV = "CLOUDDEV_OMNIROUTE_API_KEY";
const CONFIG_RELATIVE_PATH = ".config/clouddev-ai/gateway.json";
const MODEL_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._:/+-]{0,299}$/;
const AGENTS = new Set(["codex", "claude"]);
const HTTP_INTERNAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function configPath(home) {
  return path.join(home, CONFIG_RELATIVE_PATH);
}

function ensureDirectory(directory, mode) {
  try {
    const current = lstatSync(directory);
    if (current.isSymbolicLink() || !current.isDirectory()) throw new Error("Refusing to use a non-directory in the private config path.");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    mkdirSync(directory, { mode });
  }
}

export function normalizeBaseUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Gateway URL is invalid.");
  }
  const internalRailway = parsed.hostname.endsWith(".railway.internal");
  const internalService = HTTP_INTERNAL_HOSTS.has(parsed.hostname);
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && (internalRailway || internalService))) {
    throw new Error("Gateway URL must use HTTPS except for an internal Railway or local service URL.");
  }
  if (parsed.username || parsed.password) throw new Error("Gateway URL must not contain credentials.");
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("Gateway URL must be a root URL without a path, query, or fragment.");
  }
  return parsed.origin;
}

export function extractChatModelIds(payload) {
  if (!payload || !Array.isArray(payload.data)) return [];
  return [...new Set(payload.data
    .filter(item => item && (item.type === undefined || item.type === "chat"))
    .map(item => item.id)
    .filter(id => typeof id === "string" && MODEL_ID_RE.test(id)))];
}

export function loadGatewayConfig(home = process.env.HOME) {
  if (!home) throw new Error("The persistent home directory is unavailable.");
  const file = configPath(home);
  let metadata;
  try {
    metadata = lstatSync(file);
  } catch (error) {
    if (error?.code === "ENOENT") throw new Error("AI gateway is not configured. Run `ai-setup` in the IDE terminal.");
    throw new Error("Could not read the private gateway config.");
  }
  if (metadata.isSymbolicLink() || !metadata.isFile()) throw new Error("Private gateway config must be a regular file.");
  if ((metadata.mode & 0o777) !== 0o600) throw new Error("Gateway config permissions are too broad. Run `ai-setup` to restore mode 0600.");
  if (typeof process.getuid === "function" && metadata.uid !== process.getuid()) {
    throw new Error("Gateway config must belong to the IDE user. Run `ai-setup` to recreate it.");
  }
  let config;
  try {
    config = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new Error("AI gateway config is invalid. Run `ai-setup` to replace it.");
  }
  if (typeof config.apiKey !== "string" || config.apiKey.length < 16 || /[\r\n\0]/.test(config.apiKey)) {
    throw new Error("AI gateway key is missing from the private config. Run `ai-setup`.");
  }
  if (!config.models || typeof config.models !== "object" || Array.isArray(config.models)) {
    throw new Error("AI model selections are invalid. Run `ai-setup`.");
  }
  for (const [agent, model] of Object.entries(config.models)) {
    if (!AGENTS.has(agent) || (model && (typeof model !== "string" || !MODEL_ID_RE.test(model)))) {
      throw new Error("AI model selections are invalid. Run `ai-setup`.");
    }
  }
  return {
    baseUrl: normalizeBaseUrl(config.baseUrl || DEFAULT_BASE_URL),
    apiKey: config.apiKey,
    models: config.models,
  };
}

export function saveGatewayConfig(home, { baseUrl = DEFAULT_BASE_URL, apiKey, models = {} }) {
  if (!home) throw new Error("The persistent home directory is unavailable.");
  if (typeof apiKey !== "string" || apiKey.length < 16 || /[\r\n\0]/.test(apiKey)) {
    throw new Error("Gateway inference key must contain at least 16 characters.");
  }
  if (!models || typeof models !== "object" || Array.isArray(models)) throw new Error("Model selections must be an object.");
  for (const [agent, model] of Object.entries(models)) {
    if (!AGENTS.has(agent) || (model && (typeof model !== "string" || !MODEL_ID_RE.test(model)))) {
      throw new Error("Model selection is invalid.");
    }
  }

  const root = path.resolve(home);
  const configRoot = path.join(root, ".config");
  const directory = path.join(configRoot, "clouddev-ai");
  ensureDirectory(root, 0o700);
  ensureDirectory(configRoot, 0o700);
  ensureDirectory(directory, 0o700);
  chmodSync(configRoot, 0o700);
  chmodSync(directory, 0o700);

  const target = configPath(root);
  try {
    const current = lstatSync(target);
    if (current.isSymbolicLink() || !current.isFile()) throw new Error("Refusing to replace a non-regular gateway config.");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify({
      version: 1,
      baseUrl: normalizeBaseUrl(baseUrl),
      apiKey,
      models,
    }, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    chmodSync(temporary, 0o600);
    renameSync(temporary, target);
    chmodSync(target, 0o600);
  } catch (error) {
    try { unlinkSync(temporary); } catch { /* The temporary file may already have been renamed. */ }
    throw error;
  }
  return loadGatewayConfig(root);
}

export async function fetchChatModels({ baseUrl, apiKey, fetchImpl = fetch, timeoutMs = 7000, allowEmpty = false }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  timeout.unref?.();
  try {
    const response = await fetchImpl(`${normalizeBaseUrl(baseUrl)}/v1/models?kind=chat`, {
      headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      const status = response.status;
      if (status === 401 || status === 403) throw new Error("OmniRoute rejected the inference key. Create or rotate a scoped inference key in the gateway dashboard.");
      if (status === 404) throw new Error("OmniRoute model catalog endpoint was not found. Check the configured gateway version and URL.");
      throw new Error(`OmniRoute model catalog request failed with HTTP ${status}.`);
    }
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error("OmniRoute returned an invalid model catalog response.");
    }
    const models = extractChatModelIds(payload);
    if (models.length === 0 && !allowEmpty) {
      throw new Error("No chat models are available for this inference key. Add a provider or adjust the key's model access in OmniRoute.");
    }
    return models;
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("OmniRoute did not respond in time. Check the gateway service and private connection.");
    if (error instanceof TypeError) throw new Error("OmniRoute is unreachable. Check the private gateway service and its health.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function safeChildEnvironment(parent, apiKey) {
  const env = {
    PATH: parent.PATH || "/usr/local/bin:/usr/bin:/bin",
    HOME: parent.HOME,
    USER: parent.USER,
    LOGNAME: parent.LOGNAME,
    SHELL: parent.SHELL || "/bin/bash",
    TERM: parent.TERM,
    LANG: parent.LANG || "C.UTF-8",
    LC_ALL: parent.LC_ALL,
    COLORTERM: parent.COLORTERM,
    TMPDIR: parent.TMPDIR,
    XDG_RUNTIME_DIR: parent.XDG_RUNTIME_DIR,
    VSCODE_IPC_HOOK_CLI: parent.VSCODE_IPC_HOOK_CLI,
    [API_KEY_ENV]: apiKey,
  };
  for (const key of ["CODEX_HOME", "CLAUDE_CONFIG_DIR", "OMNIROUTE_CLI_HOME"]) {
    if (parent[key]) env[key] = parent[key];
  }
  for (const [key, value] of Object.entries(env)) if (value === undefined) delete env[key];
  return env;
}

export async function launchAgent(agent, args = [], {
  home = process.env.HOME,
  cwd = process.cwd(),
  env = process.env,
  fetchImpl = fetch,
  spawnImpl = spawn,
  signalSource = process,
} = {}) {
  if (!AGENTS.has(agent)) throw new Error("Unsupported coding agent.");
  if (typeof cwd !== "string" || !path.isAbsolute(cwd)) {
    throw new Error("Current project directory is unavailable.");
  }
  try {
    if (!statSync(cwd).isDirectory()) throw new Error("not a directory");
  } catch {
    throw new Error("Current project directory is unavailable.");
  }
  const config = loadGatewayConfig(home);
  const model = config.models[agent];
  if (!model) throw new Error(`No ${agent === "codex" ? "Codex" : "Claude Code"} model selected. Run \`ai-setup\` to choose one.`);
  const models = await fetchChatModels({ ...config, fetchImpl, allowEmpty: true });
  if (!models.includes(model)) throw new Error(`Selected model '${model}' is no longer available to this inference key. Run \`ai-models\` and then \`ai-setup\`.`);

  const commandArgs = ["run", agent, "--remote", config.baseUrl, "--api-key-env", API_KEY_ENV, "--model", model];
  if (Array.isArray(args) && args.length) commandArgs.push("--", ...args);
  const isolatedDataDirectory = mkdtempSync(path.join(tmpdir(), "clouddev-omniroute-run-"));
  chmodSync(isolatedDataDirectory, 0o700);
  const childEnvironment = safeChildEnvironment(env, config.apiKey);
  childEnvironment.DATA_DIR = isolatedDataDirectory;
  childEnvironment.OMNIROUTE_CLI_SKIP_DEFAULT_DATA_ENV = "1";
  childEnvironment.OMNIROUTE_CLI_SKIP_REPO_ENV = "1";
  let child;
  try {
    child = spawnImpl("omniroute", commandArgs, {
      cwd,
      stdio: "inherit",
      env: childEnvironment,
    });
  } catch {
    rmSync(isolatedDataDirectory, { recursive: true, force: true });
    throw new Error("Could not start the OmniRoute CLI. Check that the pinned CLI is installed.");
  }
  if (!child || typeof child.once !== "function") {
    rmSync(isolatedDataDirectory, { recursive: true, force: true });
    throw new Error("Could not start the OmniRoute CLI. Check that the pinned CLI is installed.");
  }

  return await new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      signalSource.off?.("SIGINT", onSigint);
      signalSource.off?.("SIGTERM", onSigterm);
      try { rmSync(isolatedDataDirectory, { recursive: true, force: true }); } catch { /* Temporary CLI state contains no provider credential. */ }
      callback(value);
    };
    const relay = signal => { if (!child.killed) child.kill(signal); };
    const onSigint = () => relay("SIGINT");
    const onSigterm = () => relay("SIGTERM");
    signalSource.on?.("SIGINT", onSigint);
    signalSource.on?.("SIGTERM", onSigterm);
    child.once("error", () => finish(reject, new Error("Could not start the OmniRoute CLI. Check that the pinned CLI is installed.")));
    child.once("close", (code, signal) => {
      if (signal) return finish(resolve, signal === "SIGINT" ? 130 : signal === "SIGTERM" ? 143 : signal === "SIGHUP" ? 129 : 1);
      finish(resolve, Number.isInteger(code) ? code : 1);
    });
  });
}

export async function status({ home = process.env.HOME, fetchImpl = fetch, stdout = process.stdout, stderr = process.stderr } = {}) {
  let config;
  try { config = loadGatewayConfig(home); }
  catch (error) { stderr.write(`${error.message}\n`); return 1; }
  stdout.write("Gateway config: ready (inference key stored privately and hidden)\n");
  try {
    const models = await fetchChatModels({ ...config, fetchImpl, allowEmpty: true });
    stdout.write("Gateway: authenticated and reachable\n");
    stdout.write(`Chat models available: ${models.length}\n`);
    let actionRequired = models.length === 0;
    for (const agent of ["codex", "claude"]) {
      const selected = config.models[agent];
      const available = selected && models.includes(selected);
      if (!available) actionRequired = true;
      stdout.write(`${agent === "codex" ? "Codex" : "Claude Code"} model: ${available ? selected : "action required"}\n`);
    }
    if (models.length === 0) stdout.write("Action required: add a provider and model in OmniRoute, then run `ai-setup`.\n");
    return actionRequired ? 2 : 0;
  } catch (error) {
    stderr.write(`Gateway: unavailable. ${error.message}\n`);
    return 1;
  }
}

export async function printModels({ home = process.env.HOME, fetchImpl = fetch, stdout = process.stdout, stderr = process.stderr } = {}) {
  try {
    const config = loadGatewayConfig(home);
    const models = await fetchChatModels({ ...config, fetchImpl, allowEmpty: true });
    if (!models.length) stdout.write("No chat models are visible to this inference key. Add a provider or review its model access in OmniRoute.\n");
    else for (const model of models) stdout.write(`${model}\n`);
    return 0;
  } catch (error) {
    stderr.write(`${error.message}\n`);
    return 1;
  }
}

export async function setupInteractive({ home = process.env.HOME, env = process.env, input = process.stdin, stdout = process.stdout, stderr = process.stderr, fetchImpl = fetch } = {}) {
  if (!input.isTTY || !stdout.isTTY) {
    stderr.write("Run `ai-setup` from an interactive IDE terminal.\n");
    return 2;
  }
  let existing = { baseUrl: env.CLOUDDEV_OMNIROUTE_BASE_URL || DEFAULT_BASE_URL, apiKey: "", models: {} };
  try { existing = loadGatewayConfig(home); } catch { /* First setup or a config the operator needs to replace. */ }
  const ask = (prompt, { secret = false, initial = "" } = {}) => new Promise(resolve => {
    if (!secret) {
      const readline = createInterface({ input, output: stdout });
      readline.question(`${prompt}${initial ? ` [${initial}]` : ""}: `, answer => {
        readline.close();
        resolve(answer.trim() || initial);
      });
      return;
    }
    input.setRawMode?.(true);
    input.resume();
    stdout.write(`${prompt}: `);
    let answer = "";
    const onData = chunk => {
      const char = chunk.toString("utf8");
      if (char === "\u0003") {
        cleanup();
        stdout.write("\n");
        resolve(null);
      } else if (char === "\r" || char === "\n") {
        cleanup();
        stdout.write("\n");
        resolve(answer);
      } else if (char === "\u007f" || char === "\b") {
        answer = answer.slice(0, -1);
      } else if (!/[\u0000-\u001f\u007f]/.test(char)) {
        answer += char;
      }
    };
    const cleanup = () => {
      input.off("data", onData);
      input.setRawMode?.(false);
    };
    input.on("data", onData);
  });

  stdout.write("CloudDev AI gateway setup\nThe inference key is stored in your persistent home with mode 0600 and is not displayed.\n\n");
  const baseUrl = await ask("OmniRoute URL", { initial: existing.baseUrl });
  if (baseUrl === null) return 130;
  let normalized;
  try { normalized = normalizeBaseUrl(baseUrl); }
  catch (error) { stderr.write(`${error.message}\n`); return 2; }
  let apiKey = await ask("OmniRoute inference key (input hidden)", { secret: true });
  if (apiKey === null) return 130;
  apiKey = apiKey.trim() || existing.apiKey;
  if (!apiKey) {
    stderr.write("No inference key supplied. Create a scoped inference key in OmniRoute and run `ai-setup` again.\n");
    return 2;
  }
  let models;
  try { models = await fetchChatModels({ baseUrl: normalized, apiKey, fetchImpl, allowEmpty: true }); }
  catch (error) { stderr.write(`${error.message}\n`); return 1; }

  try { ensureCodexGatewayConfig({ codexHome: path.join(home, ".codex"), baseUrl: normalized }); }
  catch { stderr.write("Could not update the private user-level Codex provider config. Check CODEX_HOME permissions.\n"); return 1; }

  if (models.length === 0) {
    try { saveGatewayConfig(home, { baseUrl: normalized, apiKey, models: { codex: "", claude: "" } }); }
    catch { stderr.write("Could not save the private gateway config. Check that the persistent home is writable.\n"); return 1; }
    stdout.write("Inference key saved. No chat models are visible yet. Add a provider and model in OmniRoute, then run `ai-setup` again. Restart the workspace after setup so CloudCLI loads the restricted inference key.\n");
    return 0;
  }

  stdout.write("Models visible to this key:\n");
  for (let index = 0; index < models.length; index += 1) stdout.write(`${index + 1}. ${models[index]}\n`);
  const choose = async (agent, initialModel = "") => {
    const defaultIndex = models.indexOf(initialModel);
    const initial = defaultIndex >= 0 ? String(defaultIndex + 1) : "";
    const choice = await ask(`${agent === "codex" ? "Codex" : "Claude Code"} model number, or blank to leave unconfigured`, { initial });
    if (choice === "") return "";
    if (!/^\d+$/.test(choice) || Number(choice) < 1 || Number(choice) > models.length) return null;
    return models[Number(choice) - 1];
  };
  const codex = await choose("codex", existing.models.codex);
  if (codex === null) { stderr.write("Invalid Codex model selection.\n"); return 2; }
  const claude = await choose("claude", existing.models.claude);
  if (claude === null) { stderr.write("Invalid Claude Code model selection.\n"); return 2; }
  try { saveGatewayConfig(home, { baseUrl: normalized, apiKey, models: { codex, claude } }); }
  catch { stderr.write("Could not save the private gateway config. Check that the persistent home is writable.\n"); return 1; }
  stdout.write("Gateway settings saved. The key was not displayed. Run `ai-status` to verify, then restart the workspace so CloudCLI loads the restricted inference key.\n");
  return 0;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "codex") return launchAgent("codex", args);
  if (command === "claude") return launchAgent("claude", args);
  if (command === "models") return printModels();
  if (command === "setup") return setupInteractive();
  if (command === "status") return status();
  process.stderr.write("Usage: ai-setup | ai-status | ai-models | ai-codex [args...] | ai-claude [args...]\n");
  return 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
