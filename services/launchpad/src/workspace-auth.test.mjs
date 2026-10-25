import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { createWorkspaceAuth } from "./workspace-auth.mjs";

const password = "test-only-workspace-password-000000000000";
const secret = "test-only-workspace-auth-secret-00000000000000000000000000000000";
const internalKey = createHmac("sha256", secret).update("clouddev-caddy-forward-auth-v1").digest("base64url");
const origin = "https://workspace.example.test";

function request({ path = "/auth/login", method = "GET", headers = {}, body = "" } = {}) {
  return {
    url: path,
    method,
    headers: { host: "workspace.example.test", ...headers },
    socket: { remoteAddress: "127.0.0.1" },
    async *[Symbol.asyncIterator]() {
      if (body) yield Buffer.from(body);
    },
  };
}

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    writeHead(statusCode, headers = {}) { this.statusCode = statusCode; for (const [key, value] of Object.entries(headers)) this.headers[key.toLowerCase()] = value; },
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(body = "") { this.body = String(body); },
  };
}

test("workspace login emits a signed HttpOnly secure cookie and same-origin redirect", async () => {
  const auth = createWorkspaceAuth({ workspacePassword: password, secret, secureCookies: true, now: () => 1_800_000_000_000 });
  const result = response();
  const handled = await auth.handle(request({
    method: "POST",
    path: "/auth/login",
    headers: { origin, "content-type": "application/x-www-form-urlencoded", "x-clouddev-auth-key": internalKey },
    body: new URLSearchParams({ password, returnTo: "/vscode/" }).toString(),
  }), result);

  assert.equal(handled, true);
  assert.equal(result.statusCode, 303);
  assert.equal(result.headers.location, "/vscode/");
  assert.match(result.headers["set-cookie"], /^clouddev_workspace_session=[A-Za-z0-9_.-]+; Path=\/; HttpOnly; SameSite=Strict; Max-Age=28800; Secure$/);
  assert.equal(result.body, "");
});

test("forward-auth accepts only a cookie signed by the private Caddy verification key", async () => {
  const auth = createWorkspaceAuth({ workspacePassword: password, secret, secureCookies: true, now: () => 1_800_000_000_000 });
  const login = response();
  await auth.handle(request({
    method: "POST",
    path: "/auth/login",
    headers: { origin, "content-type": "application/x-www-form-urlencoded", "x-clouddev-auth-key": internalKey },
    body: new URLSearchParams({ password, returnTo: "/" }).toString(),
  }), login);
  const cookie = login.headers["set-cookie"].split(";")[0];

  const accepted = response();
  await auth.handle(request({
    path: "/auth/verify",
    headers: { "x-clouddev-auth-key": internalKey, cookie, "x-forwarded-uri": "/api/providers/sessions/running" },
  }), accepted);
  assert.equal(accepted.statusCode, 204);

  const rejected = response();
  await auth.handle(request({ path: "/auth/verify", headers: { cookie, "x-forwarded-uri": "/" } }), rejected);
  assert.equal(rejected.statusCode, 404, "clients must not invoke the private auth-check route directly");
});

test("rejects wrong passwords and cross-origin login, and clamps return paths to this workspace", async () => {
  const auth = createWorkspaceAuth({ workspacePassword: password, secret, secureCookies: true, now: () => 1_800_000_000_000 });
  const wrongPassword = response();
  await auth.handle(request({
    method: "POST",
    path: "/auth/login",
    headers: { origin, "content-type": "application/x-www-form-urlencoded", "x-clouddev-auth-key": internalKey },
    body: new URLSearchParams({ password: "wrong-password", returnTo: "/" }).toString(),
  }), wrongPassword);
  assert.equal(wrongPassword.statusCode, 401);
  assert.equal(wrongPassword.headers["set-cookie"], undefined);

  const crossOrigin = response();
  await auth.handle(request({
    method: "POST",
    path: "/auth/login",
    headers: { origin: "https://attacker.example.test", "content-type": "application/x-www-form-urlencoded", "x-clouddev-auth-key": internalKey },
    body: new URLSearchParams({ password, returnTo: "/" }).toString(),
  }), crossOrigin);
  assert.equal(crossOrigin.statusCode, 403);

  const openRedirect = response();
  await auth.handle(request({
    method: "POST",
    path: "/auth/login",
    headers: { origin, "content-type": "application/x-www-form-urlencoded", "x-clouddev-auth-key": internalKey },
    body: new URLSearchParams({ password, returnTo: "//attacker.example.test/" }).toString(),
  }), openRedirect);
  assert.equal(openRedirect.statusCode, 303);
  assert.equal(openRedirect.headers.location, "/");

  const redirect = response();
  await auth.handle(request({ path: "/auth/verify", headers: { "x-clouddev-auth-key": internalKey, "x-forwarded-uri": "//attacker.example.test/" } }), redirect);
  assert.equal(redirect.statusCode, 302);
  assert.equal(redirect.headers.location, "/auth/login?return=%2F");
});

test("rejects weak deployment secrets at initialization", () => {
  assert.throws(() => createWorkspaceAuth({ workspacePassword: "short", secret }), /32 characters/);
  assert.throws(() => createWorkspaceAuth({ workspacePassword: password, secret: "short" }), /32 characters/);
});
