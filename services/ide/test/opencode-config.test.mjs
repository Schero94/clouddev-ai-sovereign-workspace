import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { ensureOpenCodeGatewayConfig } from "../src/opencode-config.mjs";

const apiKey = "sk-scoped-workspace-key-0123456789abcdef";

test("routes OpenCode through OmniRoute with a private key file", () => {
  const home = mkdtempSync(path.join(tmpdir(), "opencode-config-"));
  try {
    const configPath = ensureOpenCodeGatewayConfig({ home, baseUrl: "http://127.0.0.1:20129", apiKey, model: "auto/best-coding" });
    assert.equal(configPath, path.join(home, ".config/opencode/opencode.json"));
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    const keyPath = path.join(home, ".config/clouddev-ai/opencode-key");
    assert.equal(config.model, "omniroute/auto/best-coding");
    assert.deepEqual(config.provider.omniroute, {
      npm: "@ai-sdk/openai-compatible",
      name: "OmniRoute",
      options: { baseURL: "http://127.0.0.1:20129/v1", apiKey: `{file:${keyPath}}` },
      models: { "auto/best-coding": { name: "auto/best-coding" } },
    });
    assert.doesNotMatch(readFileSync(configPath, "utf8"), /sk-scoped/);
    assert.equal(readFileSync(keyPath, "utf8"), apiKey);
    assert.equal(statSync(keyPath).mode & 0o777, 0o600);
    assert.equal(statSync(configPath).mode & 0o777, 0o600);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("keeps the user's own OpenCode settings and chosen model", () => {
  const home = mkdtempSync(path.join(tmpdir(), "opencode-config-"));
  try {
    const directory = path.join(home, ".config/opencode");
    mkdirSync(directory, { recursive: true });
    writeFileSync(path.join(directory, "opencode.json"), JSON.stringify({ theme: "tokyonight", model: "anthropic/claude", provider: { other: { name: "Other" } } }));
    ensureOpenCodeGatewayConfig({ home, baseUrl: "http://127.0.0.1:20129/v1", apiKey, model: "deepseek/chat" });
    const config = JSON.parse(readFileSync(path.join(directory, "opencode.json"), "utf8"));
    assert.equal(config.theme, "tokyonight");
    assert.equal(config.model, "anthropic/claude");
    assert.deepEqual(config.provider.other, { name: "Other" });
    assert.deepEqual(Object.keys(config.provider.omniroute.models), ["deepseek/chat"]);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("refuses to overwrite an OpenCode config it cannot parse", () => {
  const home = mkdtempSync(path.join(tmpdir(), "opencode-config-"));
  try {
    const directory = path.join(home, ".config/opencode");
    mkdirSync(directory, { recursive: true });
    writeFileSync(path.join(directory, "opencode.json"), "{ // comment\n}");
    assert.throws(() => ensureOpenCodeGatewayConfig({ home, baseUrl: "http://127.0.0.1:20129", apiKey, model: "m" }), /OpenCode config/);
    assert.equal(readFileSync(path.join(directory, "opencode.json"), "utf8"), "{ // comment\n}");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
