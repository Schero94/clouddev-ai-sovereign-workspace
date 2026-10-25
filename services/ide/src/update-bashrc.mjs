import { chmodSync, closeSync, fchownSync, fsyncSync, lstatSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync, writeSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OLD_ONBOARDING_LINE = 'echo "CloudDev AI setup needed. Run ai-setup to connect a scoped OmniRoute inference key."';
const NEW_ONBOARDING_LINE = 'case $- in *i*) echo "CloudDev AI setup needed. Run ai-setup to connect a scoped OmniRoute inference key." ;; esac';
const OLD_GATEWAY_URL_LINE = 'export CLOUDDEV_OMNIROUTE_BASE_URL="${CLOUDDEV_OMNIROUTE_BASE_URL:-http://clouddev-router.railway.internal:20131}"';
const NEW_GATEWAY_URL_LINE = 'export CLOUDDEV_OMNIROUTE_BASE_URL="${CLOUDDEV_OMNIROUTE_BASE_URL:-http://127.0.0.1:20129}"';
const DEFAULT_BASHRC = fileURLToPath(new URL("../bashrc", import.meta.url));

function assertSafeBashrcPath(filePath) {
  try {
    const metadata = lstatSync(filePath);
    if (metadata.isSymbolicLink() || !metadata.isFile()) throw new Error("CloudDev refuses a symlink or non-file bashrc.");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function atomicReplace(filePath, content, mode, uid, gid) {
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  let descriptor;
  try {
    descriptor = openSync(temporaryPath, "wx", mode);
    writeSync(descriptor, content, null, "utf8");
    fsyncSync(descriptor);
    if (typeof uid === "number" && typeof gid === "number" && process.getuid?.() === 0) {
      fchownSync(descriptor, uid, gid);
    }
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporaryPath, filePath);
    chmodSync(filePath, mode);
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    try { unlinkSync(temporaryPath); } catch { /* Ignore cleanup after a failed write. */ }
    throw error;
  }
}

export function ensureBashrc({
  home = process.env.CLOUDDEV_BASHRC_HOME || "/workspace/home",
  templatePath = DEFAULT_BASHRC,
  uid = 1000,
  gid = 1000,
} = {}) {
  if (typeof home !== "string" || !path.isAbsolute(home)) throw new Error("CloudDev bashrc home must be an absolute path.");
  const filePath = path.join(path.resolve(home), ".bashrc");
  assertSafeBashrcPath(filePath);

  let current;
  try { current = readFileSync(filePath, "utf8"); }
  catch (error) {
    if (error?.code !== "ENOENT") throw error;
    atomicReplace(filePath, readFileSync(templatePath, "utf8"), 0o644, uid, gid);
    return { action: "created", filePath };
  }

  const updated = current
    .replace(OLD_ONBOARDING_LINE, NEW_ONBOARDING_LINE)
    .replace(OLD_GATEWAY_URL_LINE, NEW_GATEWAY_URL_LINE);
  if (updated === current) return { action: "unchanged", filePath };
  const existing = lstatSync(filePath);
  atomicReplace(filePath, updated, existing.mode & 0o777, existing.uid, existing.gid);
  return { action: "migrated", filePath };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    ensureBashrc();
  } catch {
    process.stderr.write("CloudDev could not prepare the persistent shell profile safely.\n");
    process.exitCode = 1;
  }
}
