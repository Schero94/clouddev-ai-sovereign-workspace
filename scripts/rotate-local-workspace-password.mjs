import { chmodSync, closeSync, fsyncSync, lstatSync, openSync, readFileSync, renameSync, unlinkSync, writeSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(repositoryDirectory, ".env");

function rotatePassword() {
  const metadata = lstatSync(envPath);
  if (metadata.isSymbolicLink() || !metadata.isFile()) throw new Error("Local .env must be a regular file.");
  if (metadata.mode & 0o077) throw new Error("Local .env must have mode 0600 before rotating credentials.");
  const contents = readFileSync(envPath, "utf8");
  const lines = contents.split(/\r?\n/);
  let passwordMatches = 0;
  let authSecretMatches = 0;
  const rotated = lines.map(line => {
    if (line.startsWith("CODE_SERVER_PASSWORD=")) {
      passwordMatches += 1;
      return `CODE_SERVER_PASSWORD=${randomBytes(32).toString("hex")}`;
    }
    if (line.startsWith("CLOUDDEV_WORKSPACE_AUTH_SECRET=")) {
      authSecretMatches += 1;
      return `CLOUDDEV_WORKSPACE_AUTH_SECRET=${randomBytes(32).toString("hex")}`;
    }
    return line;
  });
  if (passwordMatches !== 1 || authSecretMatches > 1) {
    throw new Error("Local .env must contain exactly one workspace password and at most one auth secret.");
  }
  if (authSecretMatches === 0) {
    const trailingBlank = rotated.at(-1) === "";
    if (trailingBlank) rotated.splice(rotated.length - 1, 0, `CLOUDDEV_WORKSPACE_AUTH_SECRET=${randomBytes(32).toString("hex")}`);
    else rotated.push(`CLOUDDEV_WORKSPACE_AUTH_SECRET=${randomBytes(32).toString("hex")}`);
  }

  const temporaryPath = `${envPath}.${randomUUID()}.tmp`;
  let descriptor;
  try {
    descriptor = openSync(temporaryPath, "wx", 0o600);
    writeSync(descriptor, rotated.join("\n"), null, "utf8");
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporaryPath, envPath);
    chmodSync(envPath, 0o600);
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    try { unlinkSync(temporaryPath); } catch { /* Ignore cleanup after a failed rotation. */ }
    throw error;
  }
}

try {
  rotatePassword();
  process.stdout.write("Rotated local workspace auth credentials in .env without displaying their values.\n");
} catch {
  process.stderr.write("Could not rotate local workspace auth credentials safely.\n");
  process.exitCode = 1;
}
