import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const readDoc = relativePath => {
  const file = path.join(root, relativePath);
  return existsSync(file) ? readFileSync(file, "utf8") : "";
};
const compatibility = readDoc("docs/providers/COMPATIBILITY.md");
const howTo = readDoc("docs/how-to/providers.md");

test("provider compatibility guide identifies the pinned OmniRoute CLI and its versioned source", () => {
  for (const evidence of [
    "3.8.52",
    "https://omniroute.hagicode.com/en-US/reference/cli-tools",
    "https://github.com/cheaper-inference/OmniRoute/tree/v3.8.52",
    "https://github.com/cheaper-inference/OmniRoute/blob/v3.8.52/bin/cli/commands/setup-codex.mjs",
    "https://github.com/cheaper-inference/OmniRoute/blob/v3.8.52/bin/cli/commands/setup-claude.mjs",
    "https://github.com/cheaper-inference/OmniRoute/blob/v3.8.52/bin/cli/commands/run.mjs",
    "https://github.com/cheaper-inference/OmniRoute/blob/v3.8.52/bin/cli/key-policy.mjs",
    "https://github.com/cheaper-inference/OmniRoute/blob/v3.8.52/open-sse/config/providers/registry/deepseek/index.ts",
    "/v1/models",
    "omniroute run codex",
    "omniroute run claude",
  ]) {
    assert.ok(compatibility.includes(evidence), `compatibility guide is missing ${evidence}`);
  }
});

test("compatibility claims distinguish tested CLI protocols from provider-specific support", () => {
  for (const evidence of [
    "OpenAI Responses",
    "Anthropic Messages",
    "mock",
    "not live-tested",
    "model catalog",
    "protocol",
  ]) {
    assert.ok(compatibility.toLowerCase().includes(evidence.toLowerCase()), `missing compatibility qualification: ${evidence}`);
  }
  assert.doesNotMatch(compatibility, /any provider works with any (?:cli|code|agent)/i);
  assert.doesNotMatch(compatibility, /free forever/i);
  assert.doesNotMatch(compatibility, /ChatGPT subscription.{0,100}(?:relayed|routed) through OmniRoute/i);
});

test("Codex ChatGPT sign-in and API-key routing are separate, sourced authentication modes", () => {
  assert.ok(compatibility.includes("https://developers.openai.com/codex/auth"));
  assert.ok(compatibility.includes("https://platform.openai.com/api-keys"));
  assert.ok(howTo.includes("https://platform.openai.com/api-keys"));
  assert.match(compatibility, /ChatGPT.{0,100}API.key.{0,40}(?:separate|different|distinct)/i);
  assert.match(compatibility, /API[- ]key.{0,120}(?:standard API pricing|API rates)/i);
  assert.match(compatibility, /does not relay.{0,100}ChatGPT subscription/i);
  for (const prohibited of ["browser-cookie copying", "token extraction", "account rotation", "quota circumvention"]) {
    assert.match(compatibility.toLowerCase(), new RegExp(prohibited, "i"));
  }
});

test("DeepSeek API onboarding and pricing are linked to DeepSeek primary sources", () => {
  for (const source of [
    "https://api-docs.deepseek.com/quick_start/pricing",
    "https://api-docs.deepseek.com/api/deepseek-api",
    "https://platform.deepseek.com/api_keys",
  ]) {
    assert.ok(compatibility.includes(source), `DeepSeek source is missing: ${source}`);
    assert.ok(howTo.includes(source), `provider how-to is missing: ${source}`);
  }
  assert.match(compatibility, /DeepSeek API.{0,120}(?:per token|token-based|tokens)/is);
  assert.match(compatibility, /not free/i);
  assert.match(howTo, /DeepSeek API.{0,180}(?:per token|token-based|tokens)/is);
});

test("provider how-to uses CloudDev's supported setup flow and live model discovery", () => {
  for (const evidence of [
    "Providers",
    "Add Provider",
    "API key",
    "ai-setup",
    "ai-status",
    "ai-models",
    "ai-codex",
    "ai-claude",
    "/v1/models?kind=chat",
    "0600",
    "mock provider",
  ]) {
    assert.ok(howTo.includes(evidence), `provider how-to is missing ${evidence}`);
  }
});

test("provider instructions keep master credentials out of the workspace and discourage evasion", () => {
  for (const evidence of [
    "Provider master key",
    "OmniRoute",
    "Railway variables",
    "Git",
    "rate limits",
    "terms",
    "live catalog",
  ]) {
    assert.ok(howTo.toLowerCase().includes(evidence.toLowerCase()), `provider how-to is missing ${evidence}`);
  }
  assert.match(howTo, /agent.{0,120}(?:read|access).{0,120}(?:inference key|credential)/is);
  assert.doesNotMatch(howTo, /rotate accounts to (?:avoid|bypass|circumvent)/i);
});
