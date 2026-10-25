import { chmodSync, chownSync, closeSync, fsyncSync, lstatSync, mkdirSync, openSync, renameSync, unlinkSync, writeSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";

function ensureDirectory(directory, mode, uid, gid) {
  const resolved = path.resolve(directory);
  let current = path.parse(resolved).root;
  for (const part of path.relative(current, resolved).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      const metadata = lstatSync(current);
      if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
        throw new Error("Refusing a symlink or non-directory in the SSH authorization path.");
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      mkdirSync(current, { mode: 0o700 });
    }
  }
  chmodSync(resolved, mode);
  if (typeof process.getuid === "function" && process.getuid() === 0) chownSync(resolved, uid, gid);
}

function parsePublicKeys(content, sshKeygenPath) {
  if (typeof content !== "string") throw new Error("SSH_AUTHORIZED_KEYS must contain one or more Ed25519 public keys.");
  const keys = content.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (keys.length === 0) throw new Error("SSH_AUTHORIZED_KEYS must contain one or more Ed25519 public keys.");

  for (const key of keys) {
    const [algorithm, encodedKey] = key.split(/\s+/, 3);
    if (algorithm !== "ssh-ed25519" || !encodedKey || !/^[A-Za-z0-9+/]+={0,2}$/.test(encodedKey)) {
      throw new Error("SSH_AUTHORIZED_KEYS accepts only plain Ed25519 public key lines without key options.");
    }
    const temporary = path.join("/tmp", `clouddev-ssh-key-${randomUUID()}`);
    let descriptor;
    try {
      descriptor = openSync(temporary, "wx", 0o600);
      writeSync(descriptor, `${key}\n`, null, "utf8");
      closeSync(descriptor);
      descriptor = undefined;
      execFileSync(sshKeygenPath, ["-lf", temporary], { stdio: "ignore" });
    } catch {
      if (descriptor !== undefined) closeSync(descriptor);
      throw new Error("SSH_AUTHORIZED_KEYS contains an invalid Ed25519 public key.");
    } finally {
      try { unlinkSync(temporary); } catch { /* Ignore cleanup after a failed validation. */ }
    }
  }
  return keys;
}

export function installAuthorizedKeys({
  authorizedKeysDirectory = "/run/clouddev-ssh/authorized_keys",
  username = "coder",
  content = process.env.SSH_AUTHORIZED_KEYS,
  sshKeygenPath = "ssh-keygen",
  uid = 0,
  gid = 0,
} = {}) {
  if (!/^[a-z_][a-z0-9_-]{0,31}$/.test(username)) throw new Error("SSH authorized-key username is invalid.");
  const keys = parsePublicKeys(content, sshKeygenPath);
  const directory = path.resolve(authorizedKeysDirectory);
  const sshRoot = path.dirname(directory);
  // sshd's privilege-separated pre-auth process must be able to traverse the
  // path and read public-key material. Root ownership and no write bits keep
  // UID 1000 from adding keys; public keys do not need confidentiality.
  ensureDirectory(sshRoot, 0o755, uid, gid);
  ensureDirectory(directory, 0o755, uid, gid);

  const filePath = path.join(directory, username);
  try {
    const existing = lstatSync(filePath);
    if (existing.isSymbolicLink() || !existing.isFile()) {
      throw new Error("Refusing to replace a symlink or non-regular SSH authorized-key file.");
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  let descriptor;
  try {
    descriptor = openSync(temporaryPath, "wx", 0o600);
    writeSync(descriptor, `${keys.join("\n")}\n`, null, "utf8");
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    if (typeof process.getuid === "function" && process.getuid() === 0) chownSync(temporaryPath, uid, gid);
    renameSync(temporaryPath, filePath);
    chmodSync(filePath, 0o644);
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    try { unlinkSync(temporaryPath); } catch { /* The temp file may already be renamed. */ }
    throw error;
  }
  return filePath;
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  try {
    const filePath = installAuthorizedKeys();
    if (typeof process.getuid === "function" && process.getuid() === 0) chownSync(filePath, 0, 0);
  } catch {
    process.stderr.write("CloudDev could not install the operator's SSH public keys. Set SSH_AUTHORIZED_KEYS to valid Ed25519 public key lines.\n");
    process.exitCode = 1;
  }
}
