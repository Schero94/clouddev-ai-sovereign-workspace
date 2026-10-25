import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync } from "node:fs";
import { createHmac } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { createCaddyfile, writeCaddyConfig } from "../src/write-caddy-config.mjs";

const roots = new Set();
const authSecret = "test-only-clouddev-auth-secret-never-print-000000";

function makeRoot() {
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), "clouddev-caddy-config-")));
  roots.add(root);
  return root;
}

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.clear();
});

test("routes browser paths through cookie forward-auth and disables the admin API", () => {
  const caddyfile = createCaddyfile({ port: 8080, authSecret });
  assert.match(caddyfile, /admin off/);
  assert.match(caddyfile, /forward_auth 127\.0\.0\.1:3002/);
  assert.match(caddyfile, /forward_auth 127\.0\.0\.1:3002 \{\s*method GET\s*uri \/auth\/verify\s*header_up -Connection\s*header_up -Upgrade/s);
  assert.match(caddyfile, /uri \/auth\/verify/);
  assert.match(caddyfile, /header_up X-CloudDev-Auth-Key/);
  assert.match(caddyfile, /path \/auth\/login \/auth\/login\.css \/auth\/logout/);
  assert.match(caddyfile, /path \/auth\/verify/);
  assert.match(caddyfile, /:8080/);
  assert.match(caddyfile, /handle_path \/vscode\/\*/);
  assert.match(caddyfile, /reverse_proxy 127\.0\.0\.1:8081/);
  assert.match(caddyfile, /handle \/omniroute\/\*/);
  assert.match(caddyfile, /reverse_proxy clouddev-router:20128/);
  assert.match(caddyfile, /127\.0\.0\.1:20129/);
  const redactedCaddyfile = caddyfile.replace(/header_up X-CloudDev-Auth-Key [A-Za-z0-9_-]+/g, "header_up X-CloudDev-Auth-Key [redacted]");
  assert.match(redactedCaddyfile, /@omniroute-openai-api path \/v1 \/v1\/\*/);
  assert.match(redactedCaddyfile, /handle @omniroute-openai-api \{\s*rewrite \* \/omniroute\/api\{uri\}\s*reverse_proxy clouddev-router:20128/s);
  assert.doesNotMatch(redactedCaddyfile, /reverse_proxy clouddev-router:20131/);
  assert.match(caddyfile, /handle_path \/launchpad\/\*/);
  assert.match(caddyfile, /reverse_proxy 127\.0\.0\.1:3002/);
  assert.match(caddyfile, /reverse_proxy 127\.0\.0\.1:3001/);
  assert.match(caddyfile, /path \/healthz/);
  assert.equal(caddyfile.includes("basic_auth"), false);
  assert.equal(caddyfile.includes(authSecret), false);
});

test("Caddy checks health and login routes separately before applying the shared cookie gate", () => {
  const caddyfile = createCaddyfile({ port: 8080, authSecret });
  const health = caddyfile.indexOf("handle @health");
  const login = caddyfile.indexOf("handle @authPublic");
  const authCheck = caddyfile.indexOf("forward_auth 127.0.0.1:3002");
  const authPrivate = caddyfile.indexOf("handle @authPrivate");
  const vscodeRedirect = caddyfile.indexOf("redir @vscode-root");
  const launchpadRedirect = caddyfile.indexOf("redir @launchpad-root");
  const omnirouteRedirect = caddyfile.indexOf("redir @omniroute-root");
  const vscode = caddyfile.indexOf("reverse_proxy 127.0.0.1:8081");
  const launchpad = caddyfile.indexOf("handle_path /launchpad/*");
  const omniroute = caddyfile.indexOf("handle /omniroute/*");
  const cloudcli = caddyfile.indexOf("reverse_proxy 127.0.0.1:3001");
  assert.ok(health >= 0 && health < login);
  assert.ok(login >= 0 && login < authPrivate && authPrivate < authCheck);
  assert.ok(authCheck >= 0 && authCheck < vscodeRedirect && authCheck < launchpadRedirect && authCheck < omnirouteRedirect);
  assert.ok(authCheck < vscode && authCheck < launchpad && authCheck < omniroute && authCheck < cloudcli);
});

test("writes only the internal auth-check key to a Caddy-readable, non-agent config file", () => {
  const root = makeRoot();
  const directory = path.join(root, "run/clouddev-caddy");
  const configPath = writeCaddyConfig({
    directory,
    authSecret,
    uid: process.getuid?.(),
    gid: process.getgid?.(),
  });
  const config = readFileSync(configPath, "utf8");
  const internalKey = createHmac("sha256", authSecret).update("clouddev-caddy-forward-auth-v1").digest("base64url");
  assert.ok(config.includes(internalKey));
  assert.equal(config.includes(authSecret), false);
  assert.equal(statSync(directory).mode & 0o777, 0o750);
  assert.equal(statSync(configPath).mode & 0o777, 0o640);
  chmodSync(configPath, 0o600);
  assert.ok(readFileSync(configPath, "utf8").includes(internalKey));
  assert.equal(readFileSync(configPath, "utf8").includes(authSecret), false);
});

test("rejects Caddyfile injection and invalid listener ports", () => {
  assert.throws(() => createCaddyfile({ port: "8080 {\n" + "admin localhost:2019", authSecret }), /port/i);
  assert.throws(() => createCaddyfile({ port: 8080, authSecret: "not-a-generated-secret" }), /authentication secret/i);
});
