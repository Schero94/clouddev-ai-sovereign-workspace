import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, test } from "node:test";
import { createTaskRegistry } from "../src/task-registry.mjs";
import { installCloudCliTaskHook } from "../src/cloudcli-runtime-hook.mjs";
import { createCloudCliGatewayRefresher } from "../src/cloudcli-gateway-refresh.mjs";
import { saveGatewayConfig } from "../src/ai-cli.mjs";

const cloudCliRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../cloudcli-ui/node_modules/@cloudcli-ai/cloudcli");
const packageAvailable = existsSync(path.join(cloudCliRoot, "package.json"));
const tempRoots = new Set();
const servers = new Set();

function makeHome() {
  const home = realpathSync(mkdtempSync(path.join(os.tmpdir(), "clouddev-cloudcli-refresh-")));
  mkdirSync(path.join(home, ".cloudcli"), { recursive: true, mode: 0o700 });
  mkdirSync(path.join(home, "projects/demo"), { recursive: true, mode: 0o700 });
  writeFileSync(path.join(home, ".cloudcli/auth.db"), "", { mode: 0o600 });
  tempRoots.add(home);
  return home;
}

function withEnvironment(values, body) {
  const previous = new Map(Object.keys(values).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return Promise.resolve().then(body).finally(() => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

afterEach(async () => {
  for (const server of servers) await new Promise(resolve => server.close(() => resolve()));
  servers.clear();
  for (const root of tempRoots) rmSync(root, { recursive: true, force: true });
  tempRoots.clear();
});

test("reloads a post-startup gateway setup before the pinned CloudCLI provider runtime sends its mock request", {
  skip: !packageAvailable ? "Install CloudCLI 1.37.5 for the pinned provider-runtime integration test." : false,
  timeout: 10000,
}, async () => {
  const home = makeHome();
  let mockServer;
  const baseUrl = await new Promise((resolve, reject) => {
    const server = createServer(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = Buffer.concat(chunks).toString("utf8");
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ accepted: true, model: JSON.parse(body).model }));
      (server.requests ??= []).push({
        url: request.url,
        apiKey: request.headers["x-api-key"] ?? request.headers.authorization?.replace(/^Bearer\s+/i, ""),
        body,
      });
    });
    mockServer = server;
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      servers.add(server);
      resolve(`http://127.0.0.1:${server.address().port}`);
    });
  });

  const credentials = {
    HOME: home,
    DATABASE_PATH: path.join(home, ".cloudcli/auth.db"),
    CODEX_HOME: path.join(home, ".codex"),
    OMNIROUTE_API_KEY: undefined,
    ANTHROPIC_AUTH_TOKEN: undefined,
    ANTHROPIC_BASE_URL: undefined,
    RAILWAY_TOKEN: undefined,
    FORGEJO_ADMIN_TOKEN: undefined,
    OMNIROUTE_MASTER_KEY: undefined,
  };

  await withEnvironment(credentials, async () => {
    let database;
    let restoreHook = () => {};
    const originals = new Map();
    try {
      const registryUrl = pathToFileURL(path.join(cloudCliRoot, "dist-server/server/modules/providers/provider.registry.js")).href;
      const runtimeUrl = pathToFileURL(path.join(cloudCliRoot, "dist-server/server/modules/providers/services/provider-runtime.service.js")).href;
      const modelsUrl = pathToFileURL(path.join(cloudCliRoot, "dist-server/server/modules/providers/services/provider-models.service.js")).href;
      const databaseUrl = pathToFileURL(path.join(cloudCliRoot, "dist-server/server/modules/database/index.js")).href;
      const [{ providerRegistry }, { providerRuntimeService }, { providerModelsService }, loadedDatabase] = await Promise.all([
        import(registryUrl),
        import(runtimeUrl),
        import(modelsUrl),
        import(databaseUrl),
      ]);
      database = loadedDatabase;
      await database.initializeDatabase();
      const claudeProvider = providerRegistry.resolveProvider("claude");
      const codexProvider = providerRegistry.resolveProvider("codex");
      originals.set(claudeProvider, claudeProvider.runtime.run);
      originals.set(codexProvider, codexProvider.runtime.run);

      const sessionIds = { claude: "cloudcli-ui-claude-session", codex: "cloudcli-ui-codex-session" };
      for (const providerName of Object.keys(sessionIds)) {
        const sessionId = sessionIds[providerName];
        database.sessionsDb.createAppSession(sessionId, providerName, path.join(home, "projects/demo"), "UI-selected default");
        database.sessionsDb.setSessionModel(sessionId, `stale-${providerName}-model-from-ui`);
      }

      const registry = { startRun() { return null; }, isProcessing() { return false; } };
      const taskRegistry = createTaskRegistry({ home, summaryPath: path.join(home, "public-status/recovery.json") });
      const refreshProviderConfig = createCloudCliGatewayRefresher({ home, env: process.env });
      const receivedResponses = [];
      const mockRun = async (_command, options, _writer, context) => {
        const sessionProvider = database.sessionsDb.getSessionById(options.sessionId)?.provider;
        const resumedModel = await context.resolveResumeModel(options.sessionId, options.model);
        const isClaude = sessionProvider === "claude";
        const response = await fetch(`${process.env.ANTHROPIC_BASE_URL}${isClaude ? "/v1/messages" : "/v1/chat/completions"}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(isClaude
              ? { "x-api-key": process.env.ANTHROPIC_AUTH_TOKEN || process.env.OMNIROUTE_API_KEY }
              : { authorization: `Bearer ${process.env.OMNIROUTE_API_KEY}` }),
          },
          body: JSON.stringify({ model: resumedModel, max_tokens: 8, messages: [{ role: "user", content: "mock only" }] }),
        });
        receivedResponses.push({ provider: sessionProvider, model: resumedModel, sessionModel: database.sessionsDb.getSessionById(options.sessionId)?.model, status: response.status });
        return response.status;
      };
      claudeProvider.runtime.run = mockRun;
      codexProvider.runtime.run = mockRun;
      restoreHook = installCloudCliTaskHook(registry, taskRegistry, {
        providerRegistry,
        providerModelsService,
        refreshProviderConfig,
      });

      assert.equal(process.env.OMNIROUTE_API_KEY, undefined, "CloudCLI started before user setup");
      assert.equal(existsSync(path.join(home, ".config/clouddev-ai/gateway.json")), false);

      saveGatewayConfig(home, {
        baseUrl,
        apiKey: "restricted-mock-inference-key-12345",
        models: { claude: "mock-claude-v1", codex: "mock-codex-v1" },
      });
      chmodSync(path.join(home, ".config/clouddev-ai/gateway.json"), 0o600);

      const result = await providerRuntimeService.run("claude", "A mock request", { model: "stale-claude-model-from-ui", sessionId: sessionIds.claude }, {});
      assert.equal(result, 200);
      const codexResult = await providerRuntimeService.run("codex", "Another mock request", { model: "stale-codex-model-from-ui", sessionId: sessionIds.codex }, {});
      assert.equal(codexResult, 200);
      assert.deepEqual(receivedResponses, [
        { provider: "claude", model: "mock-claude-v1", sessionModel: "mock-claude-v1", status: 200 },
        { provider: "codex", model: "mock-codex-v1", sessionModel: "mock-codex-v1", status: 200 },
      ]);
      assert.deepEqual(mockServer.requests.map(item => item.apiKey), [
        "restricted-mock-inference-key-12345",
        "restricted-mock-inference-key-12345",
      ]);
      assert.equal(process.env.OMNIROUTE_API_KEY, "restricted-mock-inference-key-12345");
      assert.equal(process.env.ANTHROPIC_AUTH_TOKEN, "restricted-mock-inference-key-12345");
      assert.equal(process.env.ANTHROPIC_BASE_URL, baseUrl);
      assert.equal(process.env.RAILWAY_TOKEN, undefined);
      assert.equal(process.env.FORGEJO_ADMIN_TOKEN, undefined);
      assert.equal(process.env.OMNIROUTE_MASTER_KEY, undefined);

      const codexConfig = readFileSync(path.join(home, ".codex/config.toml"), "utf8");
      assert.match(codexConfig, /base_url = "http:\/\/127\.0\.0\.1:\d+\/v1"/);
      assert.match(codexConfig, /env_key = "OMNIROUTE_API_KEY"/);
      assert.equal(codexConfig.includes("restricted-mock-inference-key-12345"), false);

      database.closeConnection();
      await database.initializeDatabase();
      assert.equal((await providerModelsService.resolveSessionModel("claude", { sessionId: sessionIds.claude })).model, "mock-claude-v1");
      assert.equal((await providerModelsService.resolveSessionModel("codex", { sessionId: sessionIds.codex })).model, "mock-codex-v1");
    } finally {
      restoreHook();
      for (const [provider, run] of originals) provider.runtime.run = run;
      database?.closeConnection();
    }
  });
});
