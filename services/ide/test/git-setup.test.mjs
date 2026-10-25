import assert from "node:assert/strict";
import { chmodSync, existsSync, lstatSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, test } from "node:test";
import { setupGitKey } from "../src/git-setup.mjs";

const homes = new Set();

function makeHome() {
  const home = mkdtempSync(path.join(os.tmpdir(), "clouddev-git-setup-"));
  homes.add(home);
  return home;
}

function capture() {
  let stdout = "";
  let stderr = "";
  return {
    stdout: { write(value) { stdout += value; } },
    stderr: { write(value) { stderr += value; } },
    result: () => ({ stdout, stderr }),
  };
}

afterEach(() => {
  for (const home of homes) rmSync(home, { recursive: true, force: true });
  homes.clear();
});

test("generates a dedicated Ed25519 key and shows only its public half", async () => {
  const home = makeHome();
  const io = capture();
  const result = await setupGitKey({ home, ...io });
  const privatePath = path.join(home, ".ssh/id_ed25519_clouddev");
  const publicPath = `${privatePath}.pub`;
  const privateKey = readFileSync(privatePath, "utf8");
  const publicKey = readFileSync(publicPath, "utf8").trim();
  assert.equal(result.status, "generated");
  assert.match(publicKey, /^ssh-ed25519 [A-Za-z0-9+/]+={0,2} clouddev-ai$/);
  assert.equal((lstatSync(privatePath).mode & 0o777), 0o600);
  assert.equal((lstatSync(publicPath).mode & 0o777), 0o644);
  assert.equal((lstatSync(path.join(home, ".ssh")).mode & 0o777), 0o700);
  assert.match(io.result().stdout, new RegExp(publicKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(io.result().stdout.includes(privateKey), false);
  assert.equal(io.result().stdout.includes("PRIVATE KEY"), false);
  assert.match(io.result().stdout, /regular non-admin Forgejo account/i);
  assert.match(io.result().stdout, /Do not use the Forgejo administrator account or an administrator token/i);
});

test("refuses to replace an existing key unless an interactive confirmation callback is supplied", async () => {
  const home = makeHome();
  const io = capture();
  const original = await setupGitKey({ home, ...io });
  const privatePath = path.join(home, ".ssh/id_ed25519_clouddev");
  const before = readFileSync(privatePath, "utf8");
  await assert.rejects(setupGitKey({ home, ...capture() }), /confirm before replacing/);
  assert.equal(readFileSync(privatePath, "utf8"), before);
  assert.equal(original.status, "generated");
});

test("asks before replacement and leaves both existing files untouched when declined", async () => {
  const home = makeHome();
  await setupGitKey({ home, ...capture() });
  const privatePath = path.join(home, ".ssh/id_ed25519_clouddev");
  const publicPath = `${privatePath}.pub`;
  const oldPrivate = readFileSync(privatePath, "utf8");
  const oldPublic = readFileSync(publicPath, "utf8");
  const io = capture();
  let prompted = 0;
  const result = await setupGitKey({ home, ...io, confirmOverwrite: async () => { prompted += 1; return false; } });
  assert.equal(prompted, 1);
  assert.equal(result.status, "kept");
  assert.equal(readFileSync(privatePath, "utf8"), oldPrivate);
  assert.equal(readFileSync(publicPath, "utf8"), oldPublic);
  assert.match(io.result().stdout, /Existing key files were left unchanged/);
  assert.ok(io.result().stdout.includes(oldPublic.trim()));
  assert.equal(io.result().stdout.includes(oldPrivate), false);
});

test("replaces an existing pair only after explicit confirmation", async () => {
  const home = makeHome();
  await setupGitKey({ home, ...capture() });
  const privatePath = path.join(home, ".ssh/id_ed25519_clouddev");
  const publicPath = `${privatePath}.pub`;
  const oldPrivate = readFileSync(privatePath, "utf8");
  const oldPublic = readFileSync(publicPath, "utf8");
  const io = capture();
  let prompted = 0;
  const result = await setupGitKey({ home, ...io, confirmOverwrite: async () => { prompted += 1; return true; } });
  assert.equal(prompted, 1);
  assert.equal(result.status, "generated");
  assert.notEqual(readFileSync(privatePath, "utf8"), oldPrivate);
  assert.notEqual(readFileSync(publicPath, "utf8"), oldPublic);
  assert.equal(io.result().stdout.includes(readFileSync(privatePath, "utf8")), false);
});

test("refuses symlinked key paths and leaves the linked target untouched", async () => {
  const home = makeHome();
  const sshDir = path.join(home, ".ssh");
  const targetHome = makeHome();
  await setupGitKey({ home: targetHome, ...capture() });
  const targetPrivate = path.join(targetHome, ".ssh/id_ed25519_clouddev");
  const targetBefore = readFileSync(targetPrivate, "utf8");
  const fs = await import("node:fs");
  fs.mkdirSync(sshDir, { mode: 0o700 });
  symlinkSync(targetPrivate, path.join(sshDir, "id_ed25519_clouddev"));
  chmodSync(sshDir, 0o700);
  await assert.rejects(setupGitKey({ home, ...capture() }), /symlink/);
  assert.equal(readFileSync(targetPrivate, "utf8"), targetBefore);
});

test("the command refuses non-interactive setup without creating or printing key material", () => {
  const home = makeHome();
  const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/git-setup.mjs");
  const result = spawnSync(process.execPath, [script], {
    encoding: "utf8",
    env: { HOME: home, PATH: process.env.PATH || "/usr/bin:/bin" },
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Run `git-setup` in the interactive IDE terminal/);
  assert.equal(result.stdout.includes("PRIVATE KEY"), false);
  assert.equal(existsSync(path.join(home, ".ssh")), false);
});
