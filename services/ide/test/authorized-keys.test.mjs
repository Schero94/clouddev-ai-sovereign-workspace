import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { installAuthorizedKeys } from "../src/install-authorized-keys.mjs";

const roots = new Set();

function makeHome() {
  const home = realpathSync(mkdtempSync(path.join(os.tmpdir(), "clouddev-authorized-keys-")));
  roots.add(home);
  return home;
}

function makeEd25519PublicKey(home, name) {
  const keyPath = path.join(home, name);
  execFileSync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", keyPath]);
  return readFileSync(`${keyPath}.pub`, "utf8").trim();
}

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.clear();
});

test("atomically installs validated operator Ed25519 public keys outside the workspace without writable access", () => {
  const root = makeHome();
  const workspace = path.join(root, "workspace");
  const authorizedKeysDirectory = path.join(root, "run/clouddev-ssh/authorized_keys");
  mkdirSync(workspace, { mode: 0o700 });
  const publicKey = makeEd25519PublicKey(root, "operator");
  const output = [];
  const authorizedKeysPath = installAuthorizedKeys({
    authorizedKeysDirectory,
    username: "coder",
    content: `\n${publicKey}\n`,
    stdout: { write(value) { output.push(value); } },
    uid: process.getuid?.(),
    gid: process.getgid?.(),
  });
  assert.equal(authorizedKeysPath, path.join(authorizedKeysDirectory, "coder"));
  assert.equal(path.relative(workspace, authorizedKeysPath).startsWith(".."), true);
  assert.equal(readFileSync(authorizedKeysPath, "utf8"), `${publicKey}\n`);
  assert.equal(statSync(authorizedKeysPath).mode & 0o777, 0o644);
  assert.equal(statSync(path.dirname(authorizedKeysPath)).mode & 0o777, 0o755);
  assert.equal(output.join("").includes(publicKey), false);
});

test("rejects non-Ed25519 keys, key options, and malformed operator input", () => {
  const root = makeHome();
  const authorizedKeysDirectory = path.join(root, "run/clouddev-ssh/authorized_keys");
  const ed25519 = makeEd25519PublicKey(root, "operator");
  const options = { authorizedKeysDirectory, username: "coder" };
  assert.throws(() => installAuthorizedKeys({ ...options, content: "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQ== operator" }), /Ed25519/i);
  assert.throws(() => installAuthorizedKeys({ ...options, content: `command=\"id\" ${ed25519}` }), /Ed25519/i);
  assert.throws(() => installAuthorizedKeys({ ...options, content: "not a public key" }), /SSH_AUTHORIZED_KEYS/i);
});

test("fails closed when no operator key is configured", () => {
  const root = makeHome();
  assert.throws(() => installAuthorizedKeys({ authorizedKeysDirectory: path.join(root, "authorized_keys"), username: "coder", content: "  \n" }), /SSH_AUTHORIZED_KEYS/);
});

test("refuses a symlinked authorized_keys file", () => {
  const root = makeHome();
  const authorizedKeysDirectory = path.join(root, "run/clouddev-ssh/authorized_keys");
  const target = path.join(root, "target");
  const publicKey = makeEd25519PublicKey(root, "operator");
  mkdirSync(authorizedKeysDirectory, { recursive: true, mode: 0o700 });
  writeFileSync(target, "do not replace");
  symlinkSync(target, path.join(authorizedKeysDirectory, "coder"));
  chmodSync(authorizedKeysDirectory, 0o700);
  assert.throws(() => installAuthorizedKeys({ authorizedKeysDirectory, username: "coder", content: publicKey }), /symlink/i);
  assert.equal(readFileSync(target, "utf8"), "do not replace");
});

test("the running image keeps operator keys root-owned outside /workspace and rejects writes from UID 1000", {
  skip: process.getuid?.() !== 0 || !process.env.CLOUDDEV_SSH_TEST_PATH
    ? "Run this assertion as root inside the built image with CLOUDDEV_SSH_TEST_PATH set."
    : false,
}, () => {
  const authorizedKeysPath = process.env.CLOUDDEV_SSH_TEST_PATH;
  const metadata = statSync(authorizedKeysPath);
  assert.equal(metadata.uid, 0);
  assert.equal(metadata.mode & 0o777, 0o644);
  assert.equal(path.resolve(authorizedKeysPath).startsWith(`${path.resolve("/workspace")}${path.sep}`), false);
  const writeAttempt = spawnSync("setpriv", [
    "--reuid=1000", "--regid=1000", "--clear-groups", "--",
    process.execPath, "-e", "require('node:fs').appendFileSync(process.argv[1], 'attacker-key\\n')", authorizedKeysPath,
  ], { encoding: "utf8" });
  assert.notEqual(writeAttempt.status, 0);
  assert.equal(readFileSync(authorizedKeysPath, "utf8").includes("attacker-key"), false);
});
