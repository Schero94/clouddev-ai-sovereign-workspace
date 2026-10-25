import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { ensureCodexGatewayConfig } from "../src/codex-config.mjs";

const roots = new Set();

function makeHome() {
  const home = mkdtempSync(path.join(os.tmpdir(), "clouddev-codex-config-"));
  roots.add(home);
  return home;
}

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.clear();
});

test("writes user-level provider routing with an environment key reference and no token", () => {
  const home = makeHome();
  const configPath = ensureCodexGatewayConfig({ codexHome: path.join(home, ".codex"), baseUrl: "http://127.0.0.1:20129" });
  const config = readFileSync(configPath, "utf8");
  assert.match(config, /^model_provider = "omniroute"/m);
  assert.match(config, /\[model_providers\.omniroute\]/);
  assert.match(config, /base_url = "http:\/\/127\.0\.0\.1:20129\/v1"/);
  assert.match(config, /env_key = "OMNIROUTE_API_KEY"/);
  assert.match(config, /wire_api = "responses"/);
  assert.equal(statSync(configPath).mode & 0o777, 0o600);
  assert.equal(config.includes("sk-test"), false);
  assert.equal(path.resolve(configPath), path.join(home, ".codex/config.toml"));
});

test("preserves unrelated user Codex settings and replaces only its managed provider block", () => {
  const home = makeHome();
  const codexHome = path.join(home, ".codex");
  const configPath = ensureCodexGatewayConfig({ codexHome, baseUrl: "http://127.0.0.1:20129" });
  writeFileSync(configPath, `model = "my-choice"\napproval_policy = "on-request"\n\n[features]\nshell_snapshot = true\n`, { mode: 0o600 });
  ensureCodexGatewayConfig({ codexHome, baseUrl: "https://router.example.test/v1" });
  const config = readFileSync(configPath, "utf8");
  assert.match(config, /model = "my-choice"/);
  assert.match(config, /approval_policy = "on-request"/);
  assert.match(config, /shell_snapshot = true/);
  assert.match(config, /base_url = "https:\/\/router\.example\.test\/v1"/);
  assert.equal((config.match(/\[model_providers\.omniroute\]/g) ?? []).length, 1);
});

test("rejects symlinks and public plaintext provider endpoints", () => {
  const home = makeHome();
  const codexHome = path.join(home, ".codex");
  const configPath = ensureCodexGatewayConfig({ codexHome, baseUrl: "http://127.0.0.1:20129" });
  const target = path.join(home, "target.toml");
  rmSync(configPath);
  writeFileSync(target, "model = \"do-not-replace\"\n");
  symlinkSync(target, configPath);
  assert.throws(() => ensureCodexGatewayConfig({ codexHome, baseUrl: "http://127.0.0.1:20129" }), /symlink/i);
  assert.throws(() => ensureCodexGatewayConfig({ codexHome: path.join(home, "other-codex"), baseUrl: "http://router.example.test/v1" }), /HTTPS|private/i);
});
