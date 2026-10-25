import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, chmodSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import {
  DEFAULT_BASE_URL,
  extractChatModelIds,
  fetchChatModels,
  launchAgent,
  loadGatewayConfig,
  normalizeBaseUrl,
  saveGatewayConfig,
} from "../src/ai-cli.mjs";

const testHomes = new Set();
const testKey = "test-only-gateway-key-not-a-real-credential";

function makeHome() {
  const home = mkdtempSync(path.join(os.tmpdir(), "clouddev-ide-test-"));
  testHomes.add(home);
  return home;
}

afterEach(() => {
  for (const home of testHomes) rmSync(home, { recursive: true, force: true });
  testHomes.clear();
});

test("uses the private OmniRoute service URL by default", () => {
  assert.equal(DEFAULT_BASE_URL, "http://127.0.0.1:20129");
});

test("normalizes safe gateway roots and rejects credentials, paths, and public plaintext", () => {
  assert.equal(normalizeBaseUrl("http://127.0.0.1:20129/"), DEFAULT_BASE_URL);
  assert.equal(normalizeBaseUrl("http://clouddev-router.railway.internal:20131/"), "http://clouddev-router.railway.internal:20131");
  assert.equal(normalizeBaseUrl("https://gateway.example.test/"), "https://gateway.example.test");
  assert.throws(() => normalizeBaseUrl("http://gateway.example.test"), /HTTPS/);
  assert.throws(() => normalizeBaseUrl("http://user:pass@clouddev-router.railway.internal"), /credentials/);
  assert.throws(() => normalizeBaseUrl("http://clouddev-router.railway.internal/prefix"), /root URL/);
  assert.throws(() => normalizeBaseUrl("https://gateway.example.test/?token=hidden"), /query/);
});

test("lists only valid model IDs returned by the authenticated chat-model catalog", () => {
  assert.deepEqual(extractChatModelIds({ data: [
    { id: "openai/gpt-5.4" },
    { id: "anthropic/claude-sonnet-4-6" },
    { id: "bad model id" },
    { name: "missing-id" },
    null,
  ] }), ["openai/gpt-5.4", "anthropic/claude-sonnet-4-6"]);
  assert.deepEqual(extractChatModelIds({ data: [] }), []);
});

test("persists the inference key only in a mode-0600 config under the user's home", () => {
  const home = makeHome();
  const config = saveGatewayConfig(home, {
    baseUrl: DEFAULT_BASE_URL,
    apiKey: testKey,
    models: { codex: "openai/gpt-5.4", claude: "anthropic/claude-sonnet-4-6" },
  });
  const configPath = path.join(home, ".config/clouddev-ai/gateway.json");
  assert.equal(config.apiKey, testKey);
  assert.equal(statSync(configPath).mode & 0o777, 0o600);
  assert.equal(statSync(path.dirname(configPath)).mode & 0o777, 0o700);
  assert.equal(loadGatewayConfig(home).apiKey, testKey);
  assert.match(readFileSync(configPath, "utf8"), /"apiKey"/);
});

test("refuses to use a gateway config whose permissions are broader than 0600", () => {
  const home = makeHome();
  saveGatewayConfig(home, { baseUrl: DEFAULT_BASE_URL, apiKey: testKey, models: {} });
  chmodSync(path.join(home, ".config/clouddev-ai/gateway.json"), 0o644);
  assert.throws(() => loadGatewayConfig(home), /mode 0600/);
});

test("fetches the authenticated live chat catalog without exposing response bodies", async () => {
  let request;
  const models = await fetchChatModels({
    baseUrl: DEFAULT_BASE_URL,
    apiKey: testKey,
    fetchImpl: async (url, options) => {
      request = { url: String(url), options };
      return new Response(JSON.stringify({ data: [{ id: "openai/gpt-5.4" }] }), { status: 200 });
    },
  });
  assert.equal(request.url, `${DEFAULT_BASE_URL}/v1/models?kind=chat`);
  assert.equal(request.options.headers.authorization, `Bearer ${testKey}`);
  assert.deepEqual(models, ["openai/gpt-5.4"]);
});

test("redacts gateway response details and keys from failures", async () => {
  await assert.rejects(fetchChatModels({
    baseUrl: DEFAULT_BASE_URL,
    apiKey: testKey,
    fetchImpl: async () => new Response(`upstream echoed ${testKey}`, { status: 401 }),
  }), error => {
    assert.match(error.message, /rejected the inference key/);
    assert.equal(error.message.includes(testKey), false);
    assert.equal(error.message.includes("upstream echoed"), false);
    return true;
  });
});

test("launches through the pinned OmniRoute command with model and key-env name, not key value", async () => {
  const home = makeHome();
  const project = path.join(home, "projects/mock-app");
  mkdirSync(project, { recursive: true });
  saveGatewayConfig(home, { baseUrl: DEFAULT_BASE_URL, apiKey: testKey, models: { codex: "openai/gpt-5.4" } });
  let spawnRecord;
  const code = await launchAgent("codex", ["--help"], {
    home,
    cwd: project,
    env: {
      HOME: home,
      PATH: "/opt/clouddev/bin:/usr/bin",
      TERM: "xterm-256color",
      RAILWAY_TOKEN: "must-not-inherit",
      PROVIDER_API_KEY: "must-not-inherit-either",
    },
    fetchImpl: async () => new Response(JSON.stringify({ data: [{ id: "openai/gpt-5.4" }] }), { status: 200 }),
    spawnImpl: (command, args, options) => {
      spawnRecord = { command, args, options };
      const child = new EventEmitter();
      queueMicrotask(() => child.emit("close", 0, null));
      return child;
    },
    stdout: { write() {} },
    stderr: { write() {} },
  });
  assert.equal(code, 0);
  assert.equal(spawnRecord.command, "omniroute");
  assert.equal(spawnRecord.options.cwd, project);
  assert.deepEqual(spawnRecord.args, [
    "run", "codex", "--remote", DEFAULT_BASE_URL,
    "--api-key-env", "CLOUDDEV_OMNIROUTE_API_KEY",
    "--model", "openai/gpt-5.4", "--", "--help",
  ]);
  assert.equal(spawnRecord.args.includes(testKey), false);
  assert.equal(spawnRecord.options.env.CLOUDDEV_OMNIROUTE_API_KEY, testKey);
  assert.equal(spawnRecord.options.env.OMNIROUTE_CLI_SKIP_DEFAULT_DATA_ENV, "1");
  assert.equal(spawnRecord.options.env.OMNIROUTE_CLI_SKIP_REPO_ENV, "1");
  assert.ok(spawnRecord.options.env.DATA_DIR.startsWith(os.tmpdir()));
  assert.equal(spawnRecord.options.env.RAILWAY_TOKEN, undefined);
  assert.equal(spawnRecord.options.env.PROVIDER_API_KEY, undefined);
});

test("does not launch a model that is no longer visible to the inference key", async () => {
  const home = makeHome();
  saveGatewayConfig(home, { baseUrl: DEFAULT_BASE_URL, apiKey: testKey, models: { claude: "anthropic/retired" } });
  let launched = false;
  await assert.rejects(launchAgent("claude", [], {
    home,
    env: { HOME: home, PATH: "/usr/bin" },
    fetchImpl: async () => new Response(JSON.stringify({ data: [] }), { status: 200 }),
    spawnImpl: () => { launched = true; },
    stdout: { write() {} },
    stderr: { write() {} },
  }), /no longer available/);
  assert.equal(launched, false);
});

test("propagates the child CLI exit code", async () => {
  const home = makeHome();
  saveGatewayConfig(home, { baseUrl: DEFAULT_BASE_URL, apiKey: testKey, models: { claude: "anthropic/claude-sonnet-4-6" } });
  const code = await launchAgent("claude", [], {
    home,
    env: { HOME: home, PATH: "/usr/bin" },
    fetchImpl: async () => new Response(JSON.stringify({ data: [{ id: "anthropic/claude-sonnet-4-6" }] }), { status: 200 }),
    spawnImpl: () => {
      const child = new EventEmitter();
      queueMicrotask(() => child.emit("close", 17, null));
      return child;
    },
    stdout: { write() {} },
    stderr: { write() {} },
  });
  assert.equal(code, 17);
});
