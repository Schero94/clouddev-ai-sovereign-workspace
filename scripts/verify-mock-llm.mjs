import assert from "node:assert/strict";
import { readFileSync, lstatSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseEnvText } from "./verify-local-utils.mjs";
import { resolveManagementUrl } from "../tests/mock-llm/management-url.mjs";

const repositoryDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(repositoryDirectory, ".env");
const mockNodeSpecs = [
  {
    id: "openai-compatible-chat-clouddev-codex-e2e",
    name: "CloudDev mock Codex provider",
    prefix: "clouddevcodex",
    suffix: "clouddev-codex-e2e",
    type: "openai-compatible",
    apiType: "chat",
    model: "clouddevcodex/mock-model",
  },
  {
    id: "anthropic-compatible-clouddev-claude-e2e",
    name: "CloudDev mock Claude provider",
    prefix: "clouddevclaude",
    suffix: "clouddev-claude-e2e",
    type: "anthropic-compatible",
    model: "clouddevclaude/mock-model",
  },
];
const mockNodeIds = new Set(mockNodeSpecs.map(node => node.id));
const mockConnectionNames = new Set(mockNodeSpecs.map(node => node.name));
const mockKeyName = "CloudDev mock integration key";
const mockProviderKey = "clouddev-test-mock-key";
const mockBaseUrl = "http://clouddev-mock-llm:18080/v1";
const workspaceOrigin = "http://localhost:8080";
const workspaceDashboardUrl = "http://localhost:8080/omniroute/";
const privateRouterUrl = "http://127.0.0.1:20129";
const baseComposeArgs = ["compose", "-f", "docker-compose.yml"];
const integrationComposeArgs = [...baseComposeArgs, "-f", "docker-compose.mock.yml", "--profile", "integration"];
const mockAgentRunnerPath = path.join(repositoryDirectory, "tests/mock-llm/run-agents.mjs");
const mockRouterProbePath = path.join(repositoryDirectory, "tests/mock-llm/probe-router.mjs");
const sensitiveValues = new Set(["clouddev-test-mock-key"]);
const keepMockProvider = process.env.CLOUDDEV_KEEP_MOCK_PROVIDER === "1";
const mobileGatewayHome = process.env.CLOUDDEV_MOCK_HOME || "";

function readLocalEnvironment() {
  const metadata = lstatSync(envPath);
  if (metadata.isSymbolicLink() || !metadata.isFile() || (metadata.mode & 0o077) !== 0) {
    throw new Error("Local test environment must be a mode-0600 regular file.");
  }
  return parseEnvText(readFileSync(envPath, "utf8"));
}

function run(command, args, { input, stdio } = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryDirectory,
    encoding: "utf8",
    input,
    stdio,
    env: { ...process.env, CI: "1" },
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    let diagnostic = `${result.stderr || ""}\n${result.stdout || ""}`
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(0, 16)
      .join(" ")
      .replace(/clouddev-test-mock-key/g, "<redacted>")
      .replace(/(?:Bearer\s+)[A-Za-z0-9._-]{8,}/gi, "Bearer <redacted>")
      .replace(/(password|secret|token|api[_-]?key)(\s*[:=]\s*)[^,\s"']+/gi, "$1$2<redacted>")
      .slice(0, 1800);
    for (const value of sensitiveValues) diagnostic = diagnostic.replaceAll(value, "<redacted>");
    throw new Error(`Local mock integration command failed: ${command}${diagnostic ? ` (${diagnostic})` : ""}.`);
  }
  return result.stdout ?? "";
}

function compose(args, options, integration = false) {
  const prefix = integration ? integrationComposeArgs : baseComposeArgs;
  return run("docker", [...prefix, ...args], options);
}

async function parseResponse(response, label) {
  let payload;
  try { payload = await response.json(); }
  catch { throw new Error(`${label} returned invalid JSON (HTTP ${response.status}).`); }
  if (!response.ok) {
    const message = typeof payload?.error === "string"
      ? payload.error
      : typeof payload?.error?.message === "string" ? payload.error.message : "request rejected";
    throw new Error(`${label} failed with HTTP ${response.status}: ${message.slice(0, 180)}`);
  }
  return payload;
}

async function main() {
  const env = readLocalEnvironment();
  if (keepMockProvider && !/^\/workspace\/home\/\.local\/state\/clouddev\/mobile-test-[A-Za-z0-9._-]{8,128}$/.test(mobileGatewayHome)) {
    throw new Error("Retaining a mock provider requires an isolated CloudDev mobile-test home directory.");
  }
  // The normal local verification owns image builds. This gate requires that
  // stack and adds only a disposable mock provider container.
  compose(["exec", "-T", "clouddev-ide", "node", "/opt/clouddev-ide/src/healthcheck.mjs"]);
  let workspaceCookie = "";
  let routerCookie = "";
  let cookie = "";
  const nodeIds = [];
  const connectionIds = [];
  let apiKeyId;
  let containerId = "";
  let mockContainerStarted = false;
  let mockRunnerInstalled = false;
  const requestManagement = async (route, { method = "GET", body } = {}) => {
    const response = await fetch(resolveManagementUrl(workspaceDashboardUrl, route), {
      method,
      headers: {
        origin: workspaceOrigin,
        cookie,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30_000),
    });
    return parseResponse(response, `OmniRoute ${method} ${route}`);
  };

  try {
    compose(["up", "-d", "--build", "--wait", "--wait-timeout", "90", "clouddev-mock-llm"], undefined, true);
    mockContainerStarted = true;

    containerId = compose(["ps", "-q", "clouddev-ide"]).trim();
    if (!/^[a-f0-9]{12,64}$/i.test(containerId)) throw new Error("The local workspace container is unavailable.");
    run("docker", ["cp", mockAgentRunnerPath, `${containerId}:/tmp/clouddev-mock-agent-runner.mjs`]);
    run("docker", ["cp", mockRouterProbePath, `${containerId}:/tmp/clouddev-mock-router-probe.mjs`]);
    run("docker", ["exec", containerId, "chown", "1000:1000", "/tmp/clouddev-mock-agent-runner.mjs"]);
    run("docker", ["exec", containerId, "chown", "1000:1000", "/tmp/clouddev-mock-router-probe.mjs"]);
    mockRunnerInstalled = true;

    const workspaceLogin = await fetch(new URL("/auth/login", workspaceOrigin), {
      method: "POST",
      headers: { origin: workspaceOrigin, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ password: env.CODE_SERVER_PASSWORD, returnTo: "/omniroute/" }).toString(),
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    if (workspaceLogin.status !== 303) {
      throw new Error(`CloudDev workspace sign-in failed with HTTP ${workspaceLogin.status}.`);
    }
    const workspaceSetCookie = workspaceLogin.headers.get("set-cookie") ?? "";
    workspaceCookie = workspaceSetCookie.split(";")[0];
    if (!workspaceCookie.startsWith("clouddev_workspace_session=") || workspaceCookie.length < 40
      || !/;\s*HttpOnly/i.test(workspaceSetCookie) || !/;\s*SameSite=Strict/i.test(workspaceSetCookie)) {
      throw new Error("CloudDev did not issue the expected protected workspace session cookie.");
    }

    const loginUrl = new URL("api/auth/login", workspaceDashboardUrl);
    const login = await fetch(loginUrl, {
      method: "POST",
      headers: { origin: workspaceOrigin, cookie: workspaceCookie, "content-type": "application/json" },
      body: JSON.stringify({ password: env.INITIAL_PASSWORD }),
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    const loginPayload = await parseResponse(login, "OmniRoute local dashboard login");
    if (loginPayload.success !== true) throw new Error("OmniRoute local dashboard login was not accepted.");
    const setCookie = login.headers.get("set-cookie") ?? "";
    routerCookie = setCookie.split(";")[0];
    if (!routerCookie.startsWith("auth_token=") || routerCookie.length < 32) {
      throw new Error("OmniRoute did not issue its dashboard session cookie.");
    }
    cookie = `${workspaceCookie}; ${routerCookie}`;

    // Remove only resources this test names, so a previous interrupted run is repeatable.
    const existingKeys = await requestManagement("/api/keys");
    for (const key of existingKeys.keys ?? []) {
      if (key.name === mockKeyName) await requestManagement(`/api/keys/${encodeURIComponent(key.id)}`, { method: "DELETE" });
    }
    const existingConnections = await requestManagement("/api/providers");
    for (const connection of existingConnections.connections ?? []) {
      if (mockNodeIds.has(connection.provider) || mockConnectionNames.has(connection.name)) {
        await requestManagement(`/api/providers/${encodeURIComponent(connection.id)}`, { method: "DELETE" });
      }
    }
    const existingNodes = await requestManagement("/api/provider-nodes");
    for (const node of existingNodes.nodes ?? []) {
      if (mockNodeIds.has(node.id)) await requestManagement(`/api/provider-nodes/${encodeURIComponent(node.id)}`, { method: "DELETE" });
    }

    for (const spec of mockNodeSpecs) {
      const nodeBody = {
        name: spec.name,
        prefix: spec.prefix,
        type: spec.type,
        baseUrl: mockBaseUrl,
        providerIdSuffix: spec.suffix,
        ...(spec.apiType ? { apiType: spec.apiType } : {}),
      };
      const nodeResult = await requestManagement("/api/provider-nodes", { method: "POST", body: nodeBody });
      const nodeId = nodeResult.node?.id;
      assert.equal(nodeId, spec.id, "OmniRoute must register the documented custom compatible-provider node.");
      nodeIds.push(nodeId);

      const connectionResult = await requestManagement("/api/providers", {
        method: "POST",
        body: { provider: nodeId, name: spec.name, apiKey: mockProviderKey },
      });
      const connectionId = connectionResult.connection?.id;
      assert.match(connectionId ?? "", /^[0-9a-f-]{36}$/i, "OmniRoute must create a distinct mock provider connection.");
      connectionIds.push(connectionId);

      const syncResult = await requestManagement(`/api/providers/${encodeURIComponent(connectionId)}/sync-models?mode=import&quiet=1`, {
        method: "POST",
        body: {},
      });
      assert.equal(syncResult.ok, true, "The mock provider model catalog must sync through the management API.");
    }

    const modelIds = mockNodeSpecs.map(spec => spec.model);
    const createdKey = await requestManagement("/api/keys", {
      method: "POST",
      body: {
        name: mockKeyName,
        modelAccessMode: "restricted",
        allowedModels: modelIds,
        allowedConnections: connectionIds,
        noLog: true,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
    });
    apiKeyId = createdKey.id;
    const inferenceKey = createdKey.key;
    sensitiveValues.add(inferenceKey);
    assert.equal(typeof inferenceKey, "string");
    assert.ok(inferenceKey.length >= 16);

    if (keepMockProvider) {
      const saveConfigScript = [
        'import { lstatSync } from "node:fs";',
        'import { saveGatewayConfig } from "/opt/clouddev-ide/src/ai-cli.mjs";',
        'const chunks=[];for await(const chunk of process.stdin)chunks.push(chunk);',
        'const value=JSON.parse(Buffer.concat(chunks).toString("utf8"));',
        'const metadata=lstatSync(value.home);',
        'if(metadata.isSymbolicLink()||!metadata.isDirectory()||(metadata.mode&0o077)!==0)throw new Error("Test home permissions are invalid.");',
        'saveGatewayConfig(value.home,{baseUrl:value.baseUrl,apiKey:value.apiKey,models:value.models});',
        'process.stdout.write("Temporary mobile-test gateway config saved.\\n");',
      ].join("\n");
      compose(["exec", "-T", "-u", "1000:1000", "clouddev-ide", "node", "--input-type=module", "-e", saveConfigScript], {
        input: JSON.stringify({
          home: mobileGatewayHome,
          baseUrl: privateRouterUrl,
          apiKey: inferenceKey,
          models: { codex: modelIds[0], claude: modelIds[1] },
        }),
      });
    }

    const probeOutput = compose(["exec", "-T", "-u", "1000:1000", "clouddev-ide", "node", "/tmp/clouddev-mock-router-probe.mjs"], {
      input: JSON.stringify({ apiKey: inferenceKey, models: { codex: modelIds[0], claude: modelIds[1] } }),
    });
    const probe = JSON.parse(probeOutput);
    assert.equal(probe.anonymousStatus, 401);
    assert.deepEqual(probe.modelsListed, { codex: true, claude: true });
    assert.equal(probe.openAIChatRouted, true);
    assert.equal(probe.openAIStreamRouted, true);
    assert.equal(probe.anthropicMessagesRouted, true);
    assert.equal(probe.anthropicStreamRouted, true);

    const agentOutput = compose(["exec", "-T", "-u", "1000:1000", "clouddev-ide", "node", "/tmp/clouddev-mock-agent-runner.mjs"], {
      input: JSON.stringify({ apiKey: inferenceKey, baseUrl: privateRouterUrl, models: { codex: modelIds[0], claude: modelIds[1] } }),
    });
    const agents = JSON.parse(agentOutput);
    assert.deepEqual(agents.results.map(result => result.agent), ["codex", "claude"]);
    assert.ok(agents.results.every(result => result.exitCode === 0 && result.receivedMockResponse));
    assert.deepEqual(agents.sessionIndex, { codex: true, claude: true, projectPathShared: true });
    assert.ok(agents.providerMetrics.completionRequests > 0);
    assert.ok(agents.providerMetrics.messageRequests > 0);
    assert.equal(agents.providerMetrics.lastModel, "mock-model");

    process.stdout.write(`Mock integration passed: restricted model catalog, anonymous inference denial, OpenAI chat and streaming, Anthropic Messages and streaming, plus live Codex and Claude Code CLI requests through OmniRoute${keepMockProvider ? "; temporary mobile-test gateway state retained" : ""}.\n`);
  } finally {
    if (workspaceCookie) {
      if (!keepMockProvider) {
        if (apiKeyId) await requestManagement(`/api/keys/${encodeURIComponent(apiKeyId)}`, { method: "DELETE" }).catch(() => {});
        for (const connectionId of connectionIds.reverse()) {
          await requestManagement(`/api/providers/${encodeURIComponent(connectionId)}`, { method: "DELETE" }).catch(() => {});
        }
        for (const nodeId of nodeIds.reverse()) {
          await requestManagement(`/api/provider-nodes/${encodeURIComponent(nodeId)}`, { method: "DELETE" }).catch(() => {});
        }
      }
      if (routerCookie) await fetch(new URL("api/auth/logout", workspaceDashboardUrl), {
        method: "POST",
        headers: { origin: workspaceOrigin, cookie },
        signal: AbortSignal.timeout(5000),
      }).catch(() => {});
      await fetch(new URL("/auth/logout", workspaceOrigin), {
        method: "POST",
        headers: { origin: workspaceOrigin, cookie: workspaceCookie },
        signal: AbortSignal.timeout(5000),
      }).catch(() => {});
    }
    if (mockRunnerInstalled && containerId) {
      run("docker", ["exec", containerId, "rm", "-f", "/tmp/clouddev-mock-agent-runner.mjs"]);
      run("docker", ["exec", containerId, "rm", "-f", "/tmp/clouddev-mock-router-probe.mjs"]);
    }
    if (mockContainerStarted && !keepMockProvider) {
      compose(["rm", "-f", "-s", "clouddev-mock-llm"], undefined, true);
    }
  }
}

main().then(() => {}, error => {
  process.stderr.write(`Mock provider verification failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
  process.exitCode = 1;
});
