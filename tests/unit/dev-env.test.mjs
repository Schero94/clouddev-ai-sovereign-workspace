import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, test } from "node:test";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
const tempRoots = new Set();

function makeProject() {
  const root = mkdtempSync(path.join(os.tmpdir(), "clouddev-env-test-"));
  tempRoots.add(root);
  mkdirSync(path.join(root, "scripts"));
  const source = readFileSync(path.join(projectRoot, "scripts/dev-env.sh"), "utf8");
  const script = path.join(root, "scripts/dev-env.sh");
  writeFileSync(script, source, { mode: 0o700 });
  return { root, script };
}

afterEach(() => {
  for (const root of tempRoots) rmSync(root, { recursive: true, force: true });
  tempRoots.clear();
});

test("generates independent local credentials without printing them and restricts file permissions", () => {
  const { root, script } = makeProject();
  const result = spawnSync("/bin/sh", [script], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const envPath = path.join(root, ".env");
  const envText = readFileSync(envPath, "utf8");
  const entries = Object.fromEntries(envText.trim().split("\n").map(line => line.split("=", 2)));
  const secrets = [
    "CODE_SERVER_PASSWORD",
    "POSTGRES_PASSWORD",
    "FORGEJO_POSTGRES_PASSWORD",
    "FORGEJO_ADMIN_PASSWORD",
    "INITIAL_PASSWORD",
    "JWT_SECRET",
    "API_KEY_SECRET",
    "STORAGE_ENCRYPTION_KEY",
    "MACHINE_ID_SALT",
    "OMNIROUTE_WS_BRIDGE_SECRET",
  ].map(key => entries[key]);
  assert.ok(secrets.every(secret => typeof secret === "string" && secret.length >= 32));
  assert.ok(secrets.every(secret => /^[a-zA-Z0-9+/=]+$/.test(secret)));
  assert.equal(new Set(secrets).size, secrets.length);
  assert.equal(entries.CLOUDDEV_HTTP_PASSWORD, undefined);
  assert.equal(entries.LAUNCHPAD_PASSWORD, undefined);
  const publicKey = entries.SSH_AUTHORIZED_KEYS;
  assert.match(publicKey, /^ssh-ed25519 [A-Za-z0-9+/]+(?: clouddev-local)?$/);
  const privateKeyPath = path.join(root, "secrets/local-remote-ssh");
  const localPublicKeyPath = `${privateKeyPath}.pub`;
  assert.equal(statSync(privateKeyPath).mode & 0o777, 0o600);
  assert.equal(readFileSync(localPublicKeyPath, "utf8").trim(), publicKey);
  assert.equal(`${result.stdout}${result.stderr}`.includes(publicKey), false);
  assert.equal(statSync(envPath).mode & 0o777, 0o600);
  for (const secret of secrets) assert.equal(`${result.stdout}${result.stderr}`.includes(secret), false);
});

test("never overwrites an existing local .env", () => {
  const { root, script } = makeProject();
  const envPath = path.join(root, ".env");
  writeFileSync(envPath, "KEEP_ME=do-not-overwrite\n", { mode: 0o600 });
  const result = spawnSync("/bin/sh", [script], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.equal(readFileSync(envPath, "utf8"), "KEEP_ME=do-not-overwrite\n");
});
