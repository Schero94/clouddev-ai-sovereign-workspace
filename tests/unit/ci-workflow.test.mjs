import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workflowPath = path.join(root, ".github/workflows/ci.yml");

function workflow() {
  return readFileSync(workflowPath, "utf8");
}

test("CI workflow checks tests, security, Railway contracts, and docs on main and pull requests", () => {
  const source = workflow();
  assert.match(source, /^name: CI\s*$/m);
  assert.match(source, /push:[\s\S]*?branches:[\s\S]*?- main/);
  assert.match(source, /pull_request:[\s\S]*?branches:[\s\S]*?- main/);
  assert.match(source, /workflow_dispatch:/);
  assert.match(source, /^permissions:\s*\n {2}contents: read\s*$/m);
  assert.match(source, /runs-on: ubuntu-24\.04/);
  assert.match(source, /node-version:\s*["']26\.13\.1["']/);
  assert.match(source, /python-version:\s*["']3\.13["']/);
  assert.match(source, /actions\/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6\.1\.0/);
  assert.match(source, /actions\/setup-node@2028fbc5c25fe9cf00d9f06a71cc4710d4507903 # v6\.0\.0/);
  assert.match(source, /astral-sh\/setup-uv@c771a70e6277c0a99b617c7a806ffedaca235ff9 # v9\.0\.0/);
  assert.match(source, /npm --prefix \.railway ci/);
  const generateAt = source.indexOf("run: npm run docs:generate");
  const testAt = source.indexOf("run: npm test");
  assert.ok(generateAt !== -1 && testAt !== -1 && generateAt < testAt, "CI must generate the release-status page before the test suite reads it");

  for (const command of [
    "npm test",
    "npm run test:forgejo",
    "npm run test:security",
    "npm run check:railway",
    "npm run check:railway-template",
    "npm run check:docker-context",
    "npm run check:launchpad",
    "npm run docs:check",
  ]) {
    assert.ok(source.includes(`run: ${command}`), `CI is missing ${command}`);
  }

  assert.match(source, /concurrency:\s*\n {2}group: ci-\$\{\{ github\.ref \}\}\s*\n {2}cancel-in-progress: true/);
  assert.doesNotMatch(source, /pull_request_target|contents: write|pages: write|id-token: write/i);
  assert.doesNotMatch(source, /docker\/build-push-action|docker\/login-action|docker push|ghcr\.io/i);
  assert.doesNotMatch(source, /railway (?:up|templates publish|config apply)/);
});
