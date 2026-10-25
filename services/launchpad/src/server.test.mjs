import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { configFromEnvironment, createServer, validateConfig } from "./server.mjs";

const defaultBasePath = "/launchpad";
let server;
let baseUrl;

function makeConfig(overrides = {}) {
  return {
    production: false,
    basePath: defaultBasePath,
    publicUrls: {
      ide: "http://127.0.0.1:3001",
      git: "http://127.0.0.1:3002",
      router: "http://127.0.0.1:3003",
    },
    healthTargets: {},
    ...overrides,
  };
}

async function listen(inputConfig, options) {
  const instance = createServer(inputConfig, options);
  await new Promise(resolve => instance.listen(0, "127.0.0.1", resolve));
  return { server: instance, url: `http://127.0.0.1:${instance.address().port}` };
}

before(async () => {
  const running = await listen(makeConfig());
  server = running.server;
  baseUrl = running.url;
});

after(async () => {
  if (server?.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

test("serves the launchpad below its base path without creating a second auth challenge", async () => {
  const response = await fetch(`${baseUrl}${defaultBasePath}/`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("www-authenticate"), null);
  assert.match(response.headers.get("content-security-policy"), /default-src 'self'/);
  assert.equal(response.headers.get("x-powered-by"), null);
  const html = await response.text();
  assert.match(html, /CloudDev AI/);
  assert.match(html, /href="styles\.css"/);
  assert.match(html, /src="app\.js"/);
  assert.doesNotMatch(html, /(?:href|src)="\/(?:styles\.css|app\.js)"/);
  assert.match(html, /data-link="cloudcli"/);
  assert.match(html, /data-link="vscode"/);
  assert.match(html, /data-link="git"/);
  assert.match(html, /data-link="router"/);
  assert.match(html, /Sign in with Forgejo/);
  assert.match(html, /Remote-SSH/);
  assert.match(html, /id="git-ssh-status"/);
  assert.match(html, /id="git-ssh-config"/);
  assert.match(html, /id="recovery-summary"/);
  assert.match(html, /Start Codex/);
});

test("canonicalizes the configured base path with a trailing slash", async () => {
  const response = await fetch(`${baseUrl}${defaultBasePath}`, { redirect: "manual" });
  assert.equal(response.status, 308);
  assert.equal(response.headers.get("location"), `${defaultBasePath}/`);
});

test("serves assets and status API under a configurable base path", async () => {
  const customPath = "/tools/workspace";
  const running = await listen(makeConfig({ basePath: customPath }));
  try {
    const page = await fetch(`${running.url}${customPath}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /href="styles\.css"/);

    const stylesheet = await fetch(`${running.url}${customPath}/styles.css`);
    assert.equal(stylesheet.status, 200);
    assert.match(stylesheet.headers.get("content-type"), /text\/css/);

    const script = await fetch(`${running.url}${customPath}/app.js`);
    assert.equal(script.status, 200);
    const source = await script.text();
    assert.match(source, /fetch\("api\/status"/);
    assert.doesNotMatch(source, /fetch\("\/api\/status"/);
    assert.match(source, /Recovery summary:.*interrupted/);
    assert.match(source, /IdentityFile ~\/\.ssh\/id_ed25519_clouddev/);
    assert.match(source, /"  User git"/);

    const status = await fetch(`${running.url}${customPath}/api/status`);
    assert.equal(status.status, 200);
    assert.equal((await status.json()).workspace.health, "not-configured");

    const strippedPage = await fetch(`${running.url}/`);
    assert.equal(strippedPage.status, 200);
    const strippedApi = await fetch(`${running.url}/api/status`);
    assert.equal(strippedApi.status, 200);

    assert.equal((await fetch(`${running.url}${defaultBasePath}/`)).status, 404);
  } finally {
    await new Promise((resolve, reject) => running.server.close(error => error ? reject(error) : resolve()));
  }
});

test("rejects invalid base paths", () => {
  for (const basePath of ["launchpad", "/launchpad/", "/launchpad/../admin", "/launchpad?x=1", "/launchpad//admin"]) {
    assert.throws(() => validateConfig(makeConfig({ basePath })), /LAUNCHPAD_BASE_PATH is invalid/);
  }
  assert.equal(validateConfig(makeConfig({ basePath: "/" })).basePath, "/");
});

test("uses a dedicated validated loopback port instead of Railway's public PORT", () => {
  assert.equal(validateConfig(configFromEnvironment({ PORT: "3001" })).port, 3002);
  assert.equal(validateConfig(configFromEnvironment({ LAUNCHPAD_PORT: "3107", PORT: "3001" })).port, 3107);
  assert.throws(() => validateConfig(configFromEnvironment({ LAUNCHPAD_PORT: "70000" })), /LAUNCHPAD_PORT/);
});

test("serves a local favicon and privacy page beneath the base path", async () => {
  const favicon = await fetch(`${baseUrl}${defaultBasePath}/favicon.ico`);
  assert.equal(favicon.status, 200);
  assert.equal(favicon.headers.get("content-type"), "image/svg+xml");
  assert.match(await favicon.text(), /<svg/);

  const privacy = await fetch(`${baseUrl}${defaultBasePath}/privacy`);
  assert.equal(privacy.status, 200);
  const html = await privacy.text();
  assert.match(html, /href="styles\.css"/);
  assert.match(html, /href="\.\/"/);
  assert.match(html, /shared workspace sign-in/i);
  assert.doesNotMatch(html, /launchpad password/i);
});

test("rejects unsupported methods below the base path", async () => {
  const response = await fetch(`${baseUrl}${defaultBasePath}/api/status`, { method: "POST" });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET, HEAD");
});

test("health endpoint reveals only a generic liveness status", async () => {
  const response = await fetch(`${baseUrl}/healthz`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
  const head = await fetch(`${baseUrl}/healthz`, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
});

test("status API returns only non-secret health, link, SSH config, and recovery data", async () => {
  const response = await fetch(`${baseUrl}${defaultBasePath}/api/status`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("www-authenticate"), null);
  const body = await response.json();
  assert.deepEqual(body.services.map(service => service.id), ["ide", "git", "postgres", "router"]);
  assert.ok(body.services.every(service => service.status === "not-configured"));
  assert.deepEqual(body.links, {
    cloudcli: "http://127.0.0.1:3001/",
    vscode: "http://127.0.0.1:3001/vscode/",
    git: "http://127.0.0.1:3002/",
    router: "http://127.0.0.1:3003/",
    ssh: null,
    sshHostFingerprint: null,
    gitSsh: null,
  });
  assert.equal(body.links.sshHostFingerprint, null);
  assert.deepEqual(body.workspace, {
    health: "not-configured",
    recovery: "manual",
    recoverySummary: { status: "not-configured", counts: null },
  });
  assert.doesNotMatch(JSON.stringify(body), /private key|provider key|session id|password|credential/i);
});

test("returns only validated aggregate counts from the optional recovery summary", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "launchpad-recovery-summary-"));
  const summaryPath = path.join(root, "recovery.json");
  const privateValues = ["task-secret-id", "cloudcli-session-secret", "provider-session-secret", "prompt-secret", "api-key-secret", "/workspace/projects/private"];
  writeFileSync(summaryPath, JSON.stringify({
    version: 1,
    counts: { total: 5, running: 1, interrupted: 1, completed: 1, failed: 1, other: 1 },
    taskId: privateValues[0], sessionId: privateValues[1], providerSessionId: privateValues[2],
    prompt: privateValues[3], apiKey: privateValues[4], projectPath: privateValues[5],
  }), { mode: 0o644 });
  chmodSync(summaryPath, 0o644);
  const running = await listen(makeConfig({ recoverySummaryPath: summaryPath }));
  try {
    const response = await fetch(`${running.url}${defaultBasePath}/api/status`);
    assert.equal(response.status, 200);
    const text = await response.text();
    const body = JSON.parse(text);
    assert.deepEqual(body.workspace, {
      health: "not-configured",
      recovery: "manual",
      recoverySummary: {
        status: "available",
        counts: { total: 5, running: 1, interrupted: 1, completed: 1, failed: 1, other: 1 },
      },
    });
    for (const value of [...privateValues, summaryPath]) assert.equal(text.includes(value), false);
    assert.doesNotMatch(text, /taskId|sessionId|providerSessionId|prompt|apiKey|projectPath/);
  } finally {
    await new Promise((resolve, reject) => running.server.close(error => error ? reject(error) : resolve()));
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects an invalid recovery summary version or non-integer count", async () => {
  for (const counts of [
    { total: 0, running: 0, interrupted: 0, completed: 0, failed: 0, other: 0 },
    { total: 1, running: 0.5, interrupted: 0, completed: 0, failed: 0, other: 0 },
    { total: 1, running: 0, interrupted: -1, completed: 0, failed: 0, other: 0 },
  ]) {
    const root = mkdtempSync(path.join(os.tmpdir(), "launchpad-recovery-summary-"));
    const summaryPath = path.join(root, "recovery.json");
    writeFileSync(summaryPath, JSON.stringify({ version: counts.total === 0 ? 2 : 1, counts }), { mode: 0o644 });
    const running = await listen(makeConfig({ recoverySummaryPath: summaryPath }));
    try {
      const response = await fetch(`${running.url}${defaultBasePath}/api/status`);
      assert.deepEqual((await response.json()).workspace.recoverySummary, { status: "unavailable", counts: null });
    } finally {
      await new Promise((resolve, reject) => running.server.close(error => error ? reject(error) : resolve()));
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("rejects non-regular, writable, or symlinked recovery summary files without exposing their paths", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "launchpad-recovery-summary-"));
  const targetPath = path.join(root, "target.json");
  const writablePath = path.join(root, "writable.json");
  const symlinkPath = path.join(root, "symlink.json");
  const summary = JSON.stringify({ version: 1, counts: { total: 1, running: 0, interrupted: 1, completed: 0, failed: 0, other: 0 } });
  writeFileSync(targetPath, summary, { mode: 0o644 });
  writeFileSync(writablePath, summary, { mode: 0o664 });
  chmodSync(writablePath, 0o664);
  symlinkSync(targetPath, symlinkPath);
  try {
    for (const summaryPath of [root, writablePath, symlinkPath]) {
      const running = await listen(makeConfig({ recoverySummaryPath: summaryPath }));
      try {
        const response = await fetch(`${running.url}${defaultBasePath}/api/status`);
        const text = await response.text();
        assert.deepEqual(JSON.parse(text).workspace.recoverySummary, { status: "unavailable", counts: null });
        assert.equal(text.includes(summaryPath), false);
      } finally {
        await new Promise((resolve, reject) => running.server.close(error => error ? reject(error) : resolve()));
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("validates an optional recovery summary path", () => {
  assert.equal(validateConfig(configFromEnvironment({})).recoverySummaryPath, null);
  assert.equal(validateConfig(configFromEnvironment({ LAUNCHPAD_RECOVERY_SUMMARY: "/workspace/public-status/recovery.json" })).recoverySummaryPath,
    "/workspace/public-status/recovery.json");
  assert.equal(validateConfig(configFromEnvironment({ LAUNCHPAD_TASK_REGISTRY: "/workspace/home/.local/state/clouddev/tasks.json" })).recoverySummaryPath, null);
  assert.throws(() => validateConfig(configFromEnvironment({ LAUNCHPAD_RECOVERY_SUMMARY: "relative/recovery.json" })), /LAUNCHPAD_RECOVERY_SUMMARY/);
});

test("maps optional Railway TCP proxy host and port into informational SSH config", async () => {
  const environment = {
    NODE_ENV: "production",
    LAUNCHPAD_BASE_PATH: "/launchpad",
    RAILWAY_PUBLIC_DOMAIN: "clouddev-ide.up.railway.app",
    GIT_PUBLIC_URL: "clouddev-git.up.railway.app",
    ROUTER_PUBLIC_URL: "clouddev-router.up.railway.app",
    RAILWAY_TCP_PROXY_DOMAIN: "sample.proxy.rlwy.net",
    RAILWAY_TCP_PROXY_PORT: "41234",
    IDE_SSH_HOST_FINGERPRINT: "SHA256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    GIT_SSH_PROXY_HOST: "forgejo.proxy.rlwy.net",
    GIT_SSH_PROXY_PORT: "41555",
  };
  const config = configFromEnvironment(environment);
  const validated = validateConfig(config);
  assert.equal(validated.basePath, "/launchpad");
  assert.equal(validated.publicUrls.ide, "https://clouddev-ide.up.railway.app");
  assert.deepEqual(validated.sshProxy, { host: "sample.proxy.rlwy.net", port: 41234 });
  assert.deepEqual(validated.gitSshProxy, { host: "forgejo.proxy.rlwy.net", port: 41555 });

  const running = await listen(config);
  try {
    const response = await fetch(`${running.url}/launchpad/api/status`);
    const body = await response.json();
    assert.deepEqual(body.links.ssh, { host: "sample.proxy.rlwy.net", port: 41234 });
    assert.equal(body.links.sshHostFingerprint, environment.IDE_SSH_HOST_FINGERPRINT);
    assert.deepEqual(body.links.gitSsh, { host: "forgejo.proxy.rlwy.net", port: 41555 });
    assert.equal(JSON.stringify(body).includes("private-key-material"), false);
    assert.equal(JSON.stringify(body).includes("id_ed25519_clouddev"), false);
  } finally {
    await new Promise((resolve, reject) => running.server.close(error => error ? reject(error) : resolve()));
  }

  const override = validateConfig(configFromEnvironment({
    ...environment,
    IDE_SSH_PROXY_HOST: "custom.proxy.rlwy.net",
    IDE_SSH_PROXY_PORT: "41235",
  }));
  assert.deepEqual(override.sshProxy, { host: "custom.proxy.rlwy.net", port: 41235 });

  assert.equal(validateConfig(configFromEnvironment({
    RAILWAY_TCP_PROXY_DOMAIN: "workspace.proxy.rlwy.net",
    RAILWAY_TCP_PROXY_PORT: "41234",
  })).gitSshProxy, null);

  assert.throws(() => validateConfig(configFromEnvironment({
    ...environment,
    GIT_SSH_PROXY_HOST: "forgejo.proxy.rlwy.net",
    GIT_SSH_PROXY_PORT: "70000",
  })), /Git SSH proxy port is invalid/);

  const fallback = validateConfig(configFromEnvironment({
    ...environment,
    WORKSPACE_PUBLIC_URL: "",
    IDE_SSH_PROXY_HOST: "",
    IDE_SSH_PROXY_PORT: "",
    IDE_SSH_HOST_FINGERPRINT: "",
  }));
  assert.equal(fallback.publicUrls.ide, "https://clouddev-ide.up.railway.app");
  assert.deepEqual(fallback.sshProxy, { host: "sample.proxy.rlwy.net", port: 41234 });
  assert.equal(fallback.sshHostFingerprint, null);
});

test("rejects malformed workspace SSH host-key fingerprints", () => {
  assert.throws(() => validateConfig(makeConfig({ sshHostFingerprint: "private-key-content" })), /fingerprint/i);
  assert.throws(() => validateConfig(makeConfig({ sshHostFingerprint: "SHA256:short" })), /fingerprint/i);
});

test("validates public links as HTTPS or local development HTTP", () => {
  assert.throws(() => validateConfig(makeConfig({ publicUrls: { ide: "javascript:alert(1)" } })), /is invalid/);
  assert.throws(() => validateConfig(makeConfig({
    publicUrls: {
      ide: "http://workspace.example.test",
      git: "https://git.example.test",
      router: "https://router.example.test",
    },
  })), /HTTPS/);
  assert.throws(() => validateConfig(makeConfig({
    production: true,
    publicUrls: { ide: "http://127.0.0.1:3001", git: "https://git.example.test", router: "https://router.example.test" },
  })), /HTTPS/);
  assert.equal(validateConfig(makeConfig()).publicUrls.ide, "http://127.0.0.1:3001");
});

test("maps Railway-generated public links and keeps private health targets", () => {
  const config = configFromEnvironment({
    NODE_ENV: "production",
    IDE_PUBLIC_URL: "clouddev-ide.up.railway.app",
    GIT_PUBLIC_URL: "clouddev-git.up.railway.app",
    ROUTER_PUBLIC_URL: "clouddev-router.up.railway.app",
    IDE_PRIVATE_HOST: "clouddev-ide.railway.internal",
    IDE_PRIVATE_PORT: "8080",
    GIT_PRIVATE_HOST: "clouddev-git.railway.internal",
    GIT_PRIVATE_PORT: "3000",
    ROUTER_PRIVATE_HOST: "clouddev-router.railway.internal",
    ROUTER_PRIVATE_PORT: "20128",
    POSTGRES_HOST: "clouddev-postgres.railway.internal",
    POSTGRES_PORT: "5432",
  });
  const validated = validateConfig(config);
  assert.equal(validated.publicUrls.ide, "https://clouddev-ide.up.railway.app");
  assert.equal(validated.healthTargets.git.url, "http://clouddev-git.railway.internal:3000/api/healthz");
  assert.equal(validated.healthTargets.router.url, "http://clouddev-router.railway.internal:20128/omniroute/healthz");
  assert.equal(validated.healthTargets.postgres.type, "tcp");
  assert.equal(configFromEnvironment({}).basePath, "/launchpad");
});

test("routes the OmniRoute dashboard link through the authenticated workspace origin by default", () => {
  const railway = validateConfig(configFromEnvironment({
    NODE_ENV: "production",
    RAILWAY_PUBLIC_DOMAIN: "clouddev-ide.up.railway.app",
    GIT_PUBLIC_URL: "clouddev-git.up.railway.app",
  }));
  assert.equal(railway.publicUrls.router, "https://clouddev-ide.up.railway.app/omniroute");

  const local = validateConfig(configFromEnvironment({
    NODE_ENV: "development",
    WORKSPACE_PUBLIC_URL: "http://localhost:8080",
  }));
  assert.equal(local.publicUrls.router, "http://localhost:8080/omniroute");

  const explicit = validateConfig(configFromEnvironment({
    NODE_ENV: "production",
    RAILWAY_PUBLIC_DOMAIN: "clouddev-ide.up.railway.app",
    ROUTER_PUBLIC_URL: "https://router.example.test/",
  }));
  assert.equal(explicit.publicUrls.router, "https://router.example.test");
});

test("sets HSTS only when the instance is configured for production HTTPS", async () => {
  const running = await listen(makeConfig({
    production: true,
    basePath: "/launchpad",
    publicUrls: { ide: "https://ide.example.test", git: "https://git.example.test", router: "https://router.example.test" },
  }));
  try {
    const response = await fetch(`${running.url}/launchpad/`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("strict-transport-security"), "max-age=31536000");
  } finally {
    await new Promise((resolve, reject) => running.server.close(error => error ? reject(error) : resolve()));
  }
});

test("status probe bounds slow upstream checks at the configured base path", async () => {
  const slowServer = createServer(makeConfig({
    publicUrls: {},
    healthTargets: { git: { type: "http", url: "http://127.0.0.1:1/healthz" } },
    probeTimeoutMs: 20,
  }), { fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }) });
  await new Promise(resolve => slowServer.listen(0, "127.0.0.1", resolve));
  try {
    const startedAt = Date.now();
    const response = await fetch(`http://127.0.0.1:${slowServer.address().port}${defaultBasePath}/api/status`);
    assert.ok(Date.now() - startedAt >= 10);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.services.find(service => service.id === "git").status, "unavailable");
    assert.equal(JSON.stringify(body).includes("127.0.0.1"), false);
  } finally {
    await new Promise(resolve => slowServer.close(resolve));
  }
});
