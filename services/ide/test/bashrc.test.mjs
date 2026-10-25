import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, test } from "node:test";

const ideDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const roots = new Set();

function quote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function runBash(interactive) {
  const home = mkdtempSync(path.join(os.tmpdir(), "clouddev-bashrc-"));
  roots.add(home);
  const command = `source ${quote(path.join(ideDirectory, "bashrc"))}`;
  return spawnSync("bash", [interactive ? "-ic" : "-c", command], {
    encoding: "utf8",
    env: { HOME: home, PATH: process.env.PATH ?? "/usr/bin:/bin" },
  });
}

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.clear();
});

test("keeps remote command stdout clean while showing onboarding in an interactive terminal", () => {
  const command = runBash(false);
  assert.equal(command.status, 0);
  assert.doesNotMatch(command.stdout, /CloudDev AI setup needed/);

  const interactive = runBash(true);
  assert.match(interactive.stdout, /CloudDev AI setup needed/);
});
