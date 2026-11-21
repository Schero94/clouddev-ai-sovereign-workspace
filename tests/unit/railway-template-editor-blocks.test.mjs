import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const script = path.join(root, "scripts/railway-template-editor-blocks.mjs");
const line = /^(\w+)="((?:[^"\\]|\\.)*)" # (.+)$/;

function generate(t) {
  const out = mkdtempSync(path.join(os.tmpdir(), "clouddev-editor-blocks-"));
  t.after(() => rmSync(out, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, [script, out], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const blocks = {};
  const descriptions = {};
  for (const file of readdirSync(out)) {
    const service = file.replace(/\.env$/, "");
    blocks[service] = {};
    descriptions[service] = {};
    for (const text of readFileSync(path.join(out, file), "utf8").trim().split("\n")) {
      const match = text.match(line);
      assert.ok(match, `${service}: unparseable line ${text}`);
      blocks[service][match[1]] = match[2].replace(/\\(.)/g, "$1");
      descriptions[service][match[1]] = match[3];
    }
  }
  return { blocks, descriptions };
}

test("editor blocks cover all four services with every IaC variable", t => {
  const { blocks } = generate(t);
  assert.deepEqual(Object.keys(blocks).sort(), ["clouddev-git", "clouddev-ide", "clouddev-postgres", "clouddev-router"]);
  assert.equal(blocks["clouddev-ide"].PORT, "8080");
  assert.equal(blocks["clouddev-git"].PORT, "3000");
  assert.equal(blocks["clouddev-router"].PORT, "20128");
  assert.equal(blocks["clouddev-ide"].GIT_PUBLIC_URL, "${{clouddev-git.RAILWAY_PUBLIC_DOMAIN}}");
  assert.equal(blocks["clouddev-ide"].CLOUDDEV_GATEWAY_BOOTSTRAP_SECRET, "${{clouddev-router.CLOUDDEV_GATEWAY_BOOTSTRAP_SECRET}}");
  assert.equal(blocks["clouddev-git"].FORGEJO_POSTGRES_ADMIN_PASSWORD, "${{clouddev-postgres.PGPASSWORD}}");
  assert.equal(blocks["clouddev-postgres"].PGPORT, "5432");
  assert.equal(blocks["clouddev-postgres"].PGDATA, "/var/lib/postgresql/data/pgdata");
  assert.match(blocks["clouddev-postgres"].POSTGRES_PASSWORD, /^\$\{\{ ?secret\(/);
});

test("repo-root services name their Dockerfile because templates drop the IaC build path", t => {
  const { blocks } = generate(t);
  assert.equal(blocks["clouddev-ide"].RAILWAY_DOCKERFILE_PATH, "services/ide/Dockerfile");
  assert.equal(blocks["clouddev-router"].RAILWAY_DOCKERFILE_PATH, "services/omniroute/Dockerfile");
  assert.equal(blocks["clouddev-git"].RAILWAY_DOCKERFILE_PATH, undefined);
});

test("every generated secret uses the documented secret() expression and the SSH key stays empty", t => {
  const { blocks, descriptions } = generate(t);
  const manifest = JSON.parse(readFileSync(path.join(root, ".railway/template-variables.json"), "utf8"));
  for (const { service, name, composerValue, description } of manifest.generatedSecrets) {
    assert.equal(blocks[service][name], composerValue, `${service}.${name}`);
    assert.equal(descriptions[service][name], description, `${service}.${name} description`);
  }
  assert.equal(blocks["clouddev-ide"].SSH_AUTHORIZED_KEYS, "");
  const all = Object.values(blocks).flatMap(block => Object.values(block));
  assert.ok(!all.some(value => /^[0-9a-f]{32,}$/i.test(value)), "no literal secret value");
  assert.ok(!all.some(value => /preserve\(\)|\.env\./.test(value)), "IaC syntax is translated");
});

test("every template variable carries a description for the Marketplace guidelines", t => {
  const { blocks, descriptions } = generate(t);
  for (const [service, block] of Object.entries(blocks)) {
    for (const name of Object.keys(block)) {
      const description = descriptions[service][name];
      assert.ok(description && description.length >= 12 && !description.includes("#"), `${service}.${name} needs a description`);
    }
  }
});
