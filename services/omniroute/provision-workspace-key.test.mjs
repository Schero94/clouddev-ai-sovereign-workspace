import assert from "node:assert/strict";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import {
  authorizeBearer,
  ensureWorkspaceKey,
  handleWorkspaceKeyRequest,
  readStoredWorkspaceKey,
} from "./provision-workspace-key.mjs";

const roots = new Set();
const password = "dashboard-password-not-printed";
const secret = "a".repeat(64);
const issuedKey = "workspace-inference-key-value";

function dataFile() {
  const root = mkdtempSync(path.join(os.tmpdir(), "clouddev-router-key-"));
  roots.add(root);
  return path.join(root, "clouddev-workspace-key.json");
}

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.clear();
});

function response(status, body = {}, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: name => headers[name.toLowerCase()] ?? null, getSetCookie: () => headers["set-cookie"] ? [headers["set-cookie"]] : [] },
    json: async () => body,
  };
}

test("creates one workspace key, stores it privately, and reuses it while it is accepted", async () => {
  const file = dataFile();
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method ?? "GET" });
    if (String(url).endsWith("/api/auth/login")) {
      assert.equal(JSON.parse(options.body).password, password);
      return response(200, {}, { "set-cookie": "auth_token=session-cookie; HttpOnly" });
    }
    if (String(url).endsWith("/api/keys")) {
      assert.equal(options.headers.cookie, "auth_token=session-cookie");
      const body = JSON.parse(options.body);
      assert.equal(body.name, "clouddev-workspace");
      assert.equal(body.modelAccessMode, "all");
      assert.deepEqual(Object.keys(body).sort(), ["modelAccessMode", "name", "noLog"],
        "OmniRoute 3.8.54 rejects an empty allowedConnections list");
      assert.equal(body.noLog, true);
      return response(200, { id: "key-1", key: issuedKey });
    }
    return response(200, { data: [] });
  };
  const created = await ensureWorkspaceKey({
    dataFile: file, baseUrl: "http://127.0.0.1:20128", password, fetchImpl,
  });
  assert.equal(created.apiKey, issuedKey);
  assert.equal(statSync(file).mode & 0o777, 0o600);
  const reused = await ensureWorkspaceKey({
    dataFile: file, baseUrl: "http://127.0.0.1:20128", password, fetchImpl,
  });
  assert.equal(reused.apiKey, issuedKey);
  assert.equal(calls.filter(call => call.method === "POST").length, 2);
  assert.equal(readStoredWorkspaceKey(file).id, "key-1");
});

test("replaces a stored key after OmniRoute rejects it", async () => {
  const file = dataFile();
  let probes = 0;
  const fetchImpl = async (url, options = {}) => {
    if (String(url).includes("/models")) {
      probes += 1;
      return response(probes === 1 ? 401 : 200);
    }
    if (String(url).endsWith("/api/auth/login")) return response(200, {}, { "set-cookie": "auth_token=next-session; HttpOnly" });
    return response(200, { id: "key-2", key: "replacement-workspace-key" });
  };
  const { writeStoredWorkspaceKey } = await import("./provision-workspace-key.mjs");
  writeStoredWorkspaceKey(file, { id: "key-1", apiKey: issuedKey });
  const replaced = await ensureWorkspaceKey({
    dataFile: file, baseUrl: "http://127.0.0.1:20128", password, fetchImpl,
  });
  assert.equal(replaced.apiKey, "replacement-workspace-key");
  assert.equal(probes, 1);
});

test("serves the workspace key only to the bootstrap secret and never the dashboard password", () => {
  const sent = [];
  const responseObject = {
    writeHead(status, headers) { sent.push({ status, headers }); return this; },
    end(body) { sent.push({ body }); },
  };
  const request = { method: "GET", url: "/v1/workspace-gateway", headers: { authorization: "Bearer wrong" } };
  handleWorkspaceKeyRequest(request, responseObject, { secret, getKey: () => ({ apiKey: issuedKey }) });
  assert.equal(sent[0].status, 401);
  request.headers.authorization = `Bearer ${secret}`;
  handleWorkspaceKeyRequest(request, responseObject, {
    secret,
    getKey: () => ({ apiKey: issuedKey }),
  });
  assert.equal(sent[2].status, 200);
  assert.equal(JSON.parse(sent[3].body).apiKey, issuedKey);
  assert.equal(sent[3].body.includes(password), false);
  assert.equal(authorizeBearer(`Bearer ${secret}`, secret), true);
  assert.equal(authorizeBearer("Bearer short", "short"), false);
});
