import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { ensureBashrc } from "../src/update-bashrc.mjs";

const roots = new Set();

function createHome() {
  const home = realpathSync(mkdtempSync(path.join(os.tmpdir(), "clouddev-bashrc-update-")));
  roots.add(home);
  return home;
}

test("creates the default bashrc when the persistent home has none", () => {
  const home = createHome();
  const result = ensureBashrc({ home });
  assert.equal(result.action, "created");
  assert.match(readFileSync(path.join(home, ".bashrc"), "utf8"), /\*i\*\)/);
  assert.equal(statSync(path.join(home, ".bashrc")).mode & 0o777, 0o644);
});

test("migrates the known previous onboarding echo without changing user bashrc content", () => {
  const home = createHome();
  const original = [
    "# operator custom setting",
    "export CUSTOM_VALUE=preserve-me",
    'echo "CloudDev AI setup needed. Run ai-setup to connect a scoped OmniRoute inference key."',
    "# end operator configuration",
  ].join("\n");
  writeFileSync(path.join(home, ".bashrc"), original, { mode: 0o600 });
  const result = ensureBashrc({ home });
  const migrated = readFileSync(path.join(home, ".bashrc"), "utf8");
  assert.equal(result.action, "migrated");
  assert.match(migrated, /export CUSTOM_VALUE=preserve-me/);
  assert.match(migrated, /case \$- in \*i\*/);
  assert.match(migrated, /# end operator configuration/);
  assert.equal(migrated.split("\n").includes('echo "CloudDev AI setup needed. Run ai-setup to connect a scoped OmniRoute inference key."'), false);
  assert.equal(statSync(path.join(home, ".bashrc")).mode & 0o777, 0o600);
});

test("moves existing shell sessions onto the loopback OmniRoute split-port adapter", () => {
  const home = createHome();
  const original = [
    "# user content",
    'export CLOUDDEV_OMNIROUTE_BASE_URL="${CLOUDDEV_OMNIROUTE_BASE_URL:-http://clouddev-router.railway.internal:20131}"',
    "# preserve this line",
  ].join("\n");
  writeFileSync(path.join(home, ".bashrc"), original, { mode: 0o600 });
  const result = ensureBashrc({ home });
  const updated = readFileSync(path.join(home, ".bashrc"), "utf8");
  assert.equal(result.action, "migrated");
  assert.match(updated, /CLOUDDEV_OMNIROUTE_BASE_URL:-http:\/\/127\.0\.0\.1:20129/);
  assert.match(updated, /# user content/);
  assert.match(updated, /# preserve this line/);
});

test("leaves a custom bashrc alone and refuses a symlinked file", () => {
  const home = createHome();
  const file = path.join(home, ".bashrc");
  writeFileSync(file, "# custom\nexport X=1\n");
  assert.equal(ensureBashrc({ home }).action, "unchanged");
  const target = path.join(home, "target");
  writeFileSync(target, "keep");
  rmSync(file);
  symlinkSync(target, file);
  assert.throws(() => ensureBashrc({ home }), /symlink/i);
  assert.equal(readFileSync(target, "utf8"), "keep");
});

afterEach(() => {
  for (const home of roots) rmSync(home, { recursive: true, force: true });
  roots.clear();
});
