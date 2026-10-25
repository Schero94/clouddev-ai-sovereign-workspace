import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { after, test } from "node:test";
import { launchAgent, saveGatewayConfig } from "../src/ai-cli.mjs";

// The launcher runs from a temporary home, so a relative path in PATH would
// resolve against that directory instead of the package test's working dir.
const cliPath = process.env.CLOUDDEV_OMNIROUTE_BIN
  ? path.resolve(process.env.CLOUDDEV_OMNIROUTE_BIN)
  : null;
const versionResult = cliPath ? spawnSync(cliPath, ["--version"], { encoding: "utf8" }) : null;
const correctVersion = versionResult?.status === 0 && /3\.8\.52/.test(`${versionResult.stdout}${versionResult.stderr}`);
const tempRoots = new Set();
const servers = new Set();

function temporaryDirectory() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "clouddev-omniroute-smoke-"));
  tempRoots.add(directory);
  return directory;
}

after(async () => {
  for (const server of servers) {
    if (server.listening) server.close();
  }
  await Promise.all([...servers].map(server => once(server, "close").catch(() => {})));
  for (const directory of tempRoots) rmSync(directory, { recursive: true, force: true });
});

test("OmniRoute 3.8.52 forwards Codex and Claude settings and key through their CLI launch contracts", {
  skip: !cliPath || !correctVersion ? "Set CLOUDDEV_OMNIROUTE_BIN to the installed OmniRoute 3.8.52 executable." : false,
}, async () => {
  const home = temporaryDirectory();
  const stubs = path.join(home, "stubs");
  mkdirSync(stubs, { mode: 0o700 });
  const inferenceKey = "test-only-smoke-inference-key-not-real";
  const model = "openai/mock-model";
  const observedCatalogRequests = [];
  const server = createServer((request, response) => {
    observedCatalogRequests.push({ url: request.url, authorization: request.headers.authorization });
    if (request.url === "/api/monitoring/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: "ok" }));
      return;
    }
    if (request.url !== "/v1/models?kind=chat" || request.headers.authorization !== `Bearer ${inferenceKey}`) {
      response.writeHead(401, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ data: [{ id: model, type: "chat" }] }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  servers.add(server);
  const gatewayUrl = `http://127.0.0.1:${server.address().port}`;

  for (const [agent, executable, credentialVar, baseVar, modelVar] of [
    ["codex", "codex", "OMNIROUTE_API_KEY", null, null],
    ["claude", "claude", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL", "ANTHROPIC_MODEL"],
  ]) {
    const capture = path.join(home, `${agent}-captured.json`);
    const stub = path.join(stubs, executable);
    const code = [
      "#!/usr/bin/env node",
      "import fs from 'node:fs';",
      `fs.writeFileSync(${JSON.stringify(capture)}, JSON.stringify({ args: process.argv.slice(2), env: process.env }));`,
    ].join("\n");
    writeFileSync(stub, code, { mode: 0o700 });
    chmodSync(stub, 0o700);
    saveGatewayConfig(home, { baseUrl: gatewayUrl, apiKey: inferenceKey, models: { [agent]: model } });
    const status = await launchAgent(agent, ["--version"], {
      home,
      env: {
        HOME: home,
        PATH: `${stubs}:${path.dirname(cliPath)}:${process.env.PATH}`,
        TERM: "xterm-256color",
        RAILWAY_TOKEN: "must-not-reach-agent",
        UNRELATED_API_KEY: "must-not-reach-agent-either",
      },
    });
    assert.equal(status, 0, `omniroute run ${agent} should propagate the stub CLI exit code`);
    const observed = JSON.parse(readFileSync(capture, "utf8"));
    assert.ok(observed.args.includes("--version"));
    assert.equal(JSON.stringify(observed.args).includes(inferenceKey), false);
    assert.equal(JSON.stringify(observed.env).includes("must-not-reach-agent"), false);
    if (agent === "codex") {
      assert.equal(observed.env.OMNIROUTE_API_KEY, inferenceKey);
      assert.ok(observed.args.includes(`model_providers.omniroute.base_url=${JSON.stringify(`${gatewayUrl}/v1`)}`));
      assert.ok(observed.args.includes(`model=${JSON.stringify(model)}`));
      assert.ok(observed.args.includes("model_providers.omniroute.env_key=\"OMNIROUTE_API_KEY\""));
    }
    if (credentialVar) assert.equal(observed.env[credentialVar], inferenceKey);
    if (baseVar) assert.equal(observed.env[baseVar], gatewayUrl);
    if (modelVar) assert.equal(observed.env[modelVar], model);
  }
  const catalogRequests = observedCatalogRequests.filter(item => item.url === "/v1/models?kind=chat");
  assert.equal(catalogRequests.length, 2);
  assert.ok(catalogRequests.every(item => item.authorization === `Bearer ${inferenceKey}`));
});
