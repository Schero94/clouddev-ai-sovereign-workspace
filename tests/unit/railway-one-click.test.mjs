import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const scriptPath = path.join(root, "scripts/check-railway-one-click.mjs");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

test("the one-click checker passes and never calls Railway", () => {
  const output = execFileSync(process.execPath, [scriptPath], {
    cwd: root,
    encoding: "utf8",
  });
  assert.match(output, /One-click contract passed/);
  assert.match(output, /clouddev-ide/);
  assert.match(output, /clouddev-git/);
  assert.match(output, /clouddev-postgres/);
  assert.match(output, /clouddev-router/);
  assert.match(output, /publication is held/);
  assert.doesNotMatch(output, /railway\.com\/new\/template\//i);
});

test("the held publication commands match the Marketplace runbook and stay unpublished", () => {
  const runbook = read("docs/operations/RAILWAY_MARKETPLACE.md");
  const controlPlane = read("docs/operations/CONTROL_PLANE.md");
  const readme = read("README.md");
  const script = readFileSync(scriptPath, "utf8");

  assert.match(script, /templates create/);
  assert.match(script, /templates publish/);
  assert.match(script, /--category AI\/ML/);
  assert.match(script, /docs\/operations\/RAILWAY_TEMPLATE_OVERVIEW\.md/);
  assert.match(script, /process\.exitCode = 0/);
  assert.doesNotMatch(script, /execFile|spawn|railway\s/);
  assert.match(runbook, /npm run check:one-click/);
  assert.match(controlPlane, /\.github\/workflows\/ci\.yml/);
  assert.match(readme, /npm run check:one-click/);
  assert.match(readme, /not a published or one-click-verified/);
  assert.doesNotMatch(readme, /railway\.com\/new\/template\//i);
});
