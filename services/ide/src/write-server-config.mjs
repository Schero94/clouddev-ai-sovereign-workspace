import { randomUUID } from "node:crypto";
import { chmodSync, chownSync, closeSync, fsyncSync, lstatSync, mkdirSync, openSync, renameSync, unlinkSync, writeSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function ensureDirectory(directory, mode, uid, gid) {
  try {
    const metadata = lstatSync(directory);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) throw new Error("Refusing to use a symlink in the IDE home directory.");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    mkdirSync(directory, { mode });
  }
  chmodSync(directory, mode);
  if (Number.isInteger(uid) && Number.isInteger(gid) && typeof process.getuid === "function" && process.getuid() === 0) {
    chownSync(directory, uid, gid);
  }
}

function base64WithoutPadding(value) {
  return value.toString("base64").replace(/=+$/, "");
}

export function writeServerConfig({
  home = process.env.HOME,
  projectsDirectory = process.env.CLOUDDEV_PROJECTS_DIR || (home ? path.join(home, "workspace/projects") : "/workspace/projects"),
  uid = 1000,
  gid = 1000,
  stdout = process.stdout,
} = {}) {
  if (!home) throw new Error("The persistent IDE home directory is unavailable.");
  const homePath = path.resolve(home);
  const configRoot = path.join(homePath, ".config");
  const configDirectory = path.join(configRoot, "code-server");
  const projectsParent = path.dirname(path.resolve(projectsDirectory));
  ensureDirectory(homePath, 0o700, uid, gid);
  ensureDirectory(configRoot, 0o700, uid, gid);
  ensureDirectory(configDirectory, 0o700, uid, gid);
  ensureDirectory(projectsParent, 0o700, uid, gid);
  ensureDirectory(projectsDirectory, 0o700, uid, gid);
  const configPath = path.join(configDirectory, "config.yaml");
  try {
    const existing = lstatSync(configPath);
    if (existing.isSymbolicLink() || !existing.isFile()) throw new Error("Refusing to replace a non-regular code-server config.");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const content = [
    "bind-addr: 127.0.0.1:8081",
    "auth: none",
    "cert: false",
    "disable-telemetry: true",
    "disable-update-check: true",
    "",
  ].join("\n");
  const temporary = `${configPath}.${randomUUID()}.tmp`;
  let descriptor;
  try {
    descriptor = openSync(temporary, "wx", 0o600);
    writeSync(descriptor, content, null, "utf8");
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    if (typeof process.getuid === "function" && process.getuid() === 0) chownSync(temporary, uid, gid);
    renameSync(temporary, configPath);
    chmodSync(configPath, 0o600);
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    try { unlinkSync(temporary); } catch { /* It may have already been renamed. */ }
    throw error;
  }
  stdout.write("IDE configuration is ready.\n");
  return configPath;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    writeServerConfig();
  } catch {
    process.stderr.write("CloudDev IDE could not create its loopback-only code-server configuration. Check persistent storage permissions.\n");
    process.exitCode = 1;
  }
}
