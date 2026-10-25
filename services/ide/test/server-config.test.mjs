import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { writeServerConfig } from "../src/write-server-config.mjs";

const roots = new Set();

function makeRoot() {
  const root = mkdtempSync(path.join(os.tmpdir(), "clouddev-server-config-"));
  roots.add(root);
  return root;
}

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.clear();
});

test("writes unauthenticated code-server config for its loopback-only upstream", () => {
  const root = makeRoot();
  const output = [];
  const configPath = writeServerConfig({
    home: root,
    uid: process.getuid?.() ?? 0,
    gid: process.getgid?.() ?? 0,
    stdout: { write(value) { output.push(value); } },
  });
  const config = readFileSync(configPath, "utf8");
  assert.match(config, /bind-addr: 127\.0\.0\.1:8081/);
  assert.match(config, /auth: none/);
  assert.doesNotMatch(config, /hashed-password|^password:/m);
  assert.equal(statSync(configPath).mode & 0o777, 0o600);
  assert.equal(output.join("").toLowerCase().includes("password"), false);
});
