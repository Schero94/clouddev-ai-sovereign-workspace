import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { connect as connectTcp, createServer as createTcpServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { createCaddyfile } from "../src/write-caddy-config.mjs";

const roots = new Set();
const servers = new Set();

after(async () => {
  for (const server of servers) {
    await new Promise(resolve => server.close(() => resolve()));
  }
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function listen(server, port = 0) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      servers.add(server);
      resolve(server.address().port);
    });
  });
}

async function unusedPort() {
  const server = createTcpServer();
  const port = await listen(server);
  await new Promise(resolve => server.close(resolve));
  servers.delete(server);
  return port;
}

async function waitForCaddy(url, child) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) throw new Error("Pinned Caddy exited before becoming ready.");
    try {
      const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(500) });
      if (response.status === 302) return;
    } catch { /* Caddy is still starting. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("Pinned Caddy did not become ready for the auth integration test.");
}

function websocketHandshake(port) {
  return new Promise((resolve, reject) => {
    const socket = connectTcp(port, "127.0.0.1");
    let response = "";
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("Caddy WebSocket handshake timed out."));
    }, 3000);
    socket.once("error", error => {
      clearTimeout(timer);
      reject(error);
    });
    socket.on("data", chunk => {
      response += chunk.toString("latin1");
      if (!response.includes("\r\n\r\n")) return;
      clearTimeout(timer);
      socket.destroy();
      resolve(response);
    });
    socket.once("connect", () => {
      socket.write([
        "GET /vscode/acceptance-socket HTTP/1.1",
        `Host: 127.0.0.1:${port}`,
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Key: ${Buffer.from("clouddev websocket acceptance nonce").toString("base64")}`,
        "Sec-WebSocket-Version: 13",
        "Cookie: clouddev_workspace_session=valid",
        "\r\n",
      ].join("\r\n"));
    });
  });
}

test("pinned Caddy gates browser routes with the HttpOnly workspace cookie and preserves CloudCLI bearer tokens", {
  skip: !process.env.CLOUDDEV_CADDY_BIN
    ? "Run with the pinned Caddy binary."
    : false,
  timeout: 15000,
}, async t => {
  const caddyPath = process.env.CLOUDDEV_CADDY_BIN;
  const authSecret = "test-only-clouddev-auth-secret-never-print-000000";
  const internalKey = createHmac("sha256", authSecret).update("clouddev-caddy-forward-auth-v1").digest("base64url");
  let forwarded = 0;
  let forwardedAuthorization = null;
  let forwardedAuthKey = null;
  let loginAuthKey = null;
  const websocketPaths = [];
  const forwardedPaths = [];
  const modelCatalogRequests = [];
  const inferenceRequests = [];
  const upstream = createServer((request, response) => {
    if (request.url === "/auth/verify") {
      const verified = request.headers["x-clouddev-auth-key"] === internalKey
        && request.headers.cookie === "clouddev_workspace_session=valid";
      if (verified) {
        response.writeHead(204);
        response.end();
      } else {
        response.writeHead(302, { location: "/auth/login?return=%2F" });
        response.end();
      }
      return;
    }
    if (request.url === "/auth/login" || request.url === "/auth/login.css" || request.url === "/auth/logout") {
      loginAuthKey = request.headers["x-clouddev-auth-key"] ?? null;
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("workspace auth route");
      return;
    }
    forwarded += 1;
    forwardedPaths.push(request.url);
    forwardedAuthorization = request.headers.authorization ?? null;
    forwardedAuthKey = request.headers["x-clouddev-auth-key"] ?? null;
    if (request.url === "/omniroute/") {
      response.writeHead(308, { location: "/omniroute" });
      response.end();
      return;
    }
    if (request.url === "/omniroute") {
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("OmniRoute dashboard root");
      return;
    }
    if (request.url === "/omniroute/dashboard/providers") {
      response.setHeader("Content-Security-Policy", "default-src 'self'; img-src https: data:");
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end("OmniRoute provider dashboard");
      return;
    }
    if (request.url === "/omniroute/api/v1/models?kind=chat") {
      modelCatalogRequests.push({ authorization: request.headers.authorization ?? null });
      if (request.headers.authorization !== "Bearer scoped-inference-test-key") {
        response.writeHead(401, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ data: [{ id: "mock-model", type: "chat" }] }));
      return;
    }
    if (request.url === "/omniroute/api/v1/chat/completions") {
      inferenceRequests.push({ authorization: request.headers.authorization ?? null });
      response.writeHead(request.headers.authorization === "Bearer scoped-inference-test-key" ? 200 : 401, {
        "content-type": "application/json",
      });
      response.end(JSON.stringify({ choices: [{ message: { content: "mock inference" } }] }));
      return;
    }
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("authenticated upstream response");
  });
  const upstreamPort = await listen(upstream);
  upstream.on("upgrade", (request, socket) => {
    websocketPaths.push(request.url);
    if (request.url === "/auth/verify") {
      socket.destroy();
      return;
    }
    const accept = createHash("sha1")
      .update(`${request.headers["sec-websocket-key"]}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest("base64");
    socket.write([
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${accept}`,
      "\r\n",
    ].join("\r\n"));
  });
  const port = await unusedPort();
  const omnirouteProxyPort = await unusedPort();
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), "clouddev-caddy-integration-")));
  roots.add(root);
  const configPath = path.join(root, "Caddyfile");
  writeFileSync(configPath, createCaddyfile({
    port,
    omnirouteProxyPort,
    omnirouteHost: "127.0.0.1",
    omnirouteDashboardPort: upstreamPort,
    authSecret,
    authUpstream: `127.0.0.1:${upstreamPort}`,
    vscodeUpstream: `127.0.0.1:${upstreamPort}`,
    launchpadUpstream: `127.0.0.1:${upstreamPort}`,
    cloudcliUpstream: `127.0.0.1:${upstreamPort}`,
  }), { mode: 0o600 });

  const cleanEnv = {
    PATH: "/usr/local/bin:/usr/bin:/bin",
    HOME: root,
    XDG_CONFIG_HOME: path.join(root, "config"),
    XDG_DATA_HOME: path.join(root, "data"),
  };
  const validation = spawnSync(caddyPath, ["validate", "--config", configPath, "--adapter", "caddyfile"], {
    env: cleanEnv,
    encoding: "utf8",
  });
  assert.equal(validation.status, 0, JSON.stringify({
    error: validation.error?.message ?? null,
    signal: validation.signal,
    stderr: validation.stderr,
    stdout: validation.stdout,
  }));

  const child = spawn(caddyPath, ["run", "--config", configPath, "--adapter", "caddyfile"], {
    env: cleanEnv,
    stdio: "ignore",
  });
  t.after(() => { if (child.exitCode === null) child.kill("SIGTERM"); });

  const url = `http://127.0.0.1:${port}/vscode/acceptance`;
  await waitForCaddy(url, child);
  const login = await fetch(`http://127.0.0.1:${port}/auth/login`, { redirect: "manual" });
  assert.equal(login.status, 200, "the protected origin must expose its login route");
  assert.equal(loginAuthKey, internalKey, "the Caddy login route must prove it is the trusted proxy");
  for (const route of ["/", "/vscode", "/vscode/acceptance", "/launchpad", "/launchpad/acceptance", "/omniroute/", "/auth/verify"]) {
    const rejected = await fetch(`http://127.0.0.1:${port}${route}`, { redirect: "manual" });
    assert.ok([302, 404].includes(rejected.status), `${route} must reject unauthenticated access`);
  }
  assert.equal(forwarded, 0, "unauthenticated requests must not reach an upstream or receive a prefix redirect");

  const accepted = await fetch(url, {
    headers: {
      cookie: "clouddev_workspace_session=valid",
      authorization: "Bearer provider-session-token-not-a-secret-test-fixture",
    },
  });
  assert.equal(accepted.status, 200);
  assert.equal(await accepted.text(), "authenticated upstream response");
  assert.equal(forwardedAuthorization, "Bearer provider-session-token-not-a-secret-test-fixture");
  assert.equal(forwardedAuthKey, null, "the internal auth key must not be forwarded to app services");
  assert.equal(forwarded, 1);

  const routerHealth = await fetch(`http://127.0.0.1:${omnirouteProxyPort}/api/monitoring/health`);
  assert.equal(routerHealth.status, 200);
  assert.equal(forwardedPaths.at(-1), "/omniroute/api/monitoring/health",
    "the loopback-only CLI health adapter must use OmniRoute's dashboard listener");
  const anonymousCatalog = await fetch(`http://127.0.0.1:${omnirouteProxyPort}/v1/models?kind=chat`);
  assert.equal(anonymousCatalog.status, 401,
    "the loopback-only model-catalog adapter must preserve OmniRoute API-key authentication");
  const privateCatalog = await fetch(`http://127.0.0.1:${omnirouteProxyPort}/v1/models?kind=chat`, {
    headers: { authorization: "Bearer scoped-inference-test-key" },
  });
  assert.equal(privateCatalog.status, 200);
  assert.deepEqual((await privateCatalog.json()).data, [{ id: "mock-model", type: "chat" }]);
  assert.equal(forwardedAuthorization, "Bearer scoped-inference-test-key");
  assert.deepEqual(modelCatalogRequests, [
    { authorization: null },
    { authorization: "Bearer scoped-inference-test-key" },
  ]);
  assert.equal(forwardedPaths.at(-1), "/omniroute/api/v1/models?kind=chat",
    "the model catalog must use OmniRoute's documented base-path API route with its scoped key unchanged");
  const anonymousInference = await fetch(`http://127.0.0.1:${omnirouteProxyPort}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "mock-model", messages: [{ role: "user", content: "anonymous" }] }),
  });
  assert.equal(anonymousInference.status, 401, "the private inference adapter must reject anonymous chat requests");
  const privateInference = await fetch(`http://127.0.0.1:${omnirouteProxyPort}/v1/chat/completions`, {
    method: "POST",
    headers: { authorization: "Bearer scoped-inference-test-key", "content-type": "application/json" },
    body: JSON.stringify({ model: "mock-model", messages: [{ role: "user", content: "hello" }] }),
  });
  assert.equal(privateInference.status, 200);
  assert.equal(forwardedPaths.at(-1), "/omniroute/api/v1/chat/completions",
    "inference routes must use OmniRoute's documented base-path API route");
  assert.deepEqual(inferenceRequests, [
    { authorization: null },
    { authorization: "Bearer scoped-inference-test-key" },
  ]);

  const websocketResponse = await websocketHandshake(port);
  assert.match(websocketResponse, /^HTTP\/1\.1 101 /m,
    "Caddy must preserve authenticated WebSocket upgrades for browser IDE and CloudCLI sessions");
  assert.match(websocketResponse, /Sec-WebSocket-Accept: [A-Za-z0-9+/]+=*/i);
  assert.deepEqual(websocketPaths, ["/acceptance-socket"],
    "the auth subrequest must not inherit WebSocket headers, and the authenticated upgrade must reach the IDE upstream");

  const authenticatedPrefix = await fetch(`http://127.0.0.1:${port}/vscode`, {
    redirect: "manual",
    headers: { cookie: "clouddev_workspace_session=valid" },
  });
  assert.equal(authenticatedPrefix.status, 308, "valid credentials may receive the slash-normalizing redirect");

  const authenticatedRouter = await fetch(`http://127.0.0.1:${port}/omniroute/dashboard/providers`, {
    redirect: "manual",
    headers: { cookie: "clouddev_workspace_session=valid" },
  });
  assert.equal(authenticatedRouter.status, 200);
  assert.equal(forwardedPaths.at(-1), "/omniroute/dashboard/providers",
    "the dashboard path prefix must be preserved for OmniRoute basePath routing");
  const routerCsp = authenticatedRouter.headers.get("content-security-policy") ?? "";
  assert.match(routerCsp, /img-src 'self' data: blob:/,
    "the workspace proxy must constrain OmniRoute logo loads to local/data assets");

  const authenticatedRouterSlash = await fetch(`http://127.0.0.1:${port}/omniroute/`, {
    redirect: "manual",
    headers: { cookie: "clouddev_workspace_session=valid" },
  });
  assert.equal(authenticatedRouterSlash.status, 308);
  assert.equal(authenticatedRouterSlash.headers.get("location"), "/omniroute");
  const authenticatedRouterRoot = await fetch(`http://127.0.0.1:${port}/omniroute`, {
    redirect: "manual",
    headers: { cookie: "clouddev_workspace_session=valid" },
  });
  assert.equal(authenticatedRouterRoot.status, 200, "the canonical OmniRoute root must be reachable after one redirect");
  assert.equal(forwardedPaths.at(-1), "/omniroute", "the exact OmniRoute base path must reach the upstream");

});
