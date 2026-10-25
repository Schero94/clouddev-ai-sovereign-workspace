import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ideSource = pathToFileURL("/opt/clouddev-ide/src/ai-cli.mjs").href;
const { launchAgent, saveGatewayConfig } = await import(ideSource);

async function readInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new Error("The mock agent test input is invalid."); }
}

const input = await readInput();
if (typeof input.apiKey !== "string" || input.apiKey.length < 16
  || input.baseUrl !== "http://127.0.0.1:20129"
  || input.models?.codex !== "clouddevcodex/mock-model"
  || input.models?.claude !== "clouddevclaude/mock-model") {
  throw new Error("The mock agent test received invalid gateway settings.");
}

const home = mkdtempSync(path.join(os.tmpdir(), "clouddev-mock-agent-home-"));
const project = path.join(home, "projects", "mock-agent");
mkdirSync(project, { recursive: true, mode: 0o700 });
const environment = {
  PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin",
  HOME: home,
  USER: "coder",
  LOGNAME: "coder",
  SHELL: "/bin/bash",
  TERM: "xterm-256color",
  LANG: "C.UTF-8",
  CODEX_HOME: path.join(home, ".codex"),
  CLAUDE_CONFIG_DIR: path.join(home, ".claude"),
  OMNIROUTE_CLI_HOME: path.join(home, ".config/omniroute"),
  TMPDIR: "/tmp",
};
saveGatewayConfig(home, {
  baseUrl: input.baseUrl,
  apiKey: input.apiKey,
  models: input.models,
});

const prompts = {
  codex: "Respond with the exact text CLOUDDEV_MOCK_LLM_OK and do not call tools.",
  claude: "Respond with the exact text CLOUDDEV_MOCK_LLM_OK and do not call tools.",
};

function jsonlFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) return [];
    if (entry.isDirectory()) return jsonlFiles(entryPath);
    return entry.isFile() && entry.name.endsWith(".jsonl") ? [entryPath] : [];
  });
}

async function runAgent(agent) {
  let stdout = "";
  let stderr = "";
  let childEnvironment;
  let childArguments;
  const model = input.models[agent];
  const args = agent === "codex"
    ? ["exec", "--skip-git-repo-check", "--sandbox", "read-only", "--json", "-"]
    : ["--print", "--output-format", "text", "--permission-mode", "plan", prompts[agent]];
  const exitCode = await launchAgent(agent, args, {
    home,
    cwd: project,
    env: environment,
    signalSource: { on() {}, off() {} },
    spawnImpl(command, commandArgs, options) {
      childArguments = commandArgs;
      childEnvironment = options.env;
      const child = spawn(command, commandArgs, {
        ...options,
        stdio: ["pipe", "pipe", "pipe"],
      });
      const timeout = setTimeout(() => child.kill("SIGTERM"), 45_000);
      timeout.unref();
      child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
      child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
      child.once("close", () => clearTimeout(timeout));
      if (agent === "codex") child.stdin.end(prompts[agent]);
      else child.stdin.end();
      return child;
    },
  });
  const receivedMockResponse = /CLOUDDEV_MOCK_LLM_OK/.test(`${stdout}\n${stderr}`);
  const safeDiagnostic = `${stderr}\n${stdout}`
    .replaceAll(input.apiKey, "<redacted>")
    .replace(/(?:Bearer\s+|CLOUDDEV_OMNIROUTE_API_KEY=)[A-Za-z0-9._-]+/gi, "<credential-redacted>")
    .replace(/(?:sk-|oma_live_)[A-Za-z0-9_-]{8,}/g, "<credential-redacted>")
    .trim()
    .slice(0, 300);
  assert.ok(exitCode === 0 && receivedMockResponse,
    `The pinned ${agent} CLI mock request failed (exit=${exitCode}, marker=${receivedMockResponse}): ${safeDiagnostic || "no diagnostic output"}`);
  assert.ok(childEnvironment && typeof childEnvironment.CLOUDDEV_OMNIROUTE_API_KEY === "string");
  assert.equal(childArguments.some(argument => argument.includes(input.apiKey)), false,
    "The inference key must not be copied into process arguments.");
  for (const secretName of ["RAILWAY_TOKEN", "FORGEJO_ADMIN_TOKEN", "OMNIROUTE_MASTER_KEY", "CODE_SERVER_PASSWORD"]) {
    assert.equal(childEnvironment[secretName], undefined, `The ${agent} process must not receive ${secretName}.`);
  }
    const modelIndex = childArguments.indexOf("--model");
    assert.ok(modelIndex >= 0, `The pinned OmniRoute ${agent} runner must receive an explicit model selection.`);
    assert.equal(childArguments[modelIndex + 1], model,
      `The pinned OmniRoute ${agent} runner must use the configured model.`);
  return { agent, exitCode, receivedMockResponse, providerKeyInArguments: false };
}

try {
  const metricsBefore = await (await fetch("http://clouddev-mock-llm:18080/__test/metrics", {
    signal: AbortSignal.timeout(5000),
  })).json();
  const results = [];
  for (const agent of ["codex", "claude"]) results.push(await runAgent(agent));
  const metricsAfter = await (await fetch("http://clouddev-mock-llm:18080/__test/metrics", {
    signal: AbortSignal.timeout(5000),
  })).json();
  assert.ok(metricsAfter.completionRequests > metricsBefore.completionRequests,
    "The real Codex CLI must forward a request to the mock provider.");
  assert.ok(metricsAfter.messageRequests > metricsBefore.messageRequests,
    "The real Claude Code CLI must forward an Anthropic Messages request to the mock provider.");
  assert.equal(metricsAfter.lastModel, "mock-model",
    "OmniRoute must translate the selected provider model ID to the mock endpoint's registered model name.");

  const previousHome = process.env.HOME;
  const previousDatabasePath = process.env.DATABASE_PATH;
  const databasePath = path.join(home, ".cloudcli/auth.db");
  mkdirSync(path.dirname(databasePath), { recursive: true, mode: 0o700 });
  process.env.HOME = home;
  process.env.DATABASE_PATH = databasePath;
  try {
    const cloudCliRoot = "/opt/clouddev-ide/cloudcli-ui/node_modules/@cloudcli-ai/cloudcli";
    const databaseModule = await import(pathToFileURL(path.join(cloudCliRoot, "dist-server/server/modules/database/index.js")).href);
    const { sessionSynchronizerService } = await import(pathToFileURL(path.join(cloudCliRoot, "dist-server/server/modules/providers/services/session-synchronizer.service.js")).href);
    const originalConsoleLog = console.log;
    try {
      console.log = () => {};
      await databaseModule.initializeDatabase();
    } finally {
      console.log = originalConsoleLog;
    }

    for (const [provider, directory] of [
      ["codex", path.join(home, ".codex/sessions")],
      ["claude", path.join(home, ".claude/projects")],
    ]) {
      const transcripts = jsonlFiles(directory);
      assert.ok(transcripts.length > 0, `The real ${provider} CLI must persist a provider-native transcript.`);
      let synchronized = null;
      for (const transcript of transcripts) {
        const result = await sessionSynchronizerService.synchronizeProviderFile(provider, transcript);
        if (result?.indexed === true) { synchronized = { ...result, transcript }; break; }
      }
      assert.ok(synchronized, `CloudCLI must index the real ${provider} CLI session from the shared home.`);
      const session = databaseModule.sessionsDb.getSessionByProviderSessionId(synchronized.sessionId);
      assert.equal(session?.project_path, project,
        `CloudCLI must associate the ${provider} session with the same project directory.`);
      assert.equal(session?.jsonl_path, synchronized.transcript,
        `CloudCLI must point to the persisted ${provider} transcript in the shared home.`);
    }
    const logBeforeClose = console.log;
    try {
      console.log = () => {};
      databaseModule.closeConnection();
    } finally {
      console.log = logBeforeClose;
    }
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    if (previousDatabasePath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = previousDatabasePath;
  }
  process.stdout.write(`${JSON.stringify({
    results,
    providerMetrics: {
      completionRequests: metricsAfter.completionRequests - metricsBefore.completionRequests,
      messageRequests: metricsAfter.messageRequests - metricsBefore.messageRequests,
      lastModel: metricsAfter.lastModel,
    },
    sessionIndex: { codex: true, claude: true, projectPathShared: true },
  })}\n`);
} finally {
  rmSync(home, { recursive: true, force: true });
}
