import { lstatSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const forbiddenName = /^(?:\.env(?:\..*)?|\.git|secrets?|backups?|node_modules|\.venv)$/i;
const forbiddenExtension = /\.(?:sqlite(?:-(?:shm|wal))?|pem|p12|key|crt)$/i;
const credentialPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/,
];
const textExtensions = new Set([".html", ".js", ".css", ".json", ".xml", ".txt", ".webmanifest", ".svg", ".map"]);
const maxArtifactBytes = 100 * 1024 * 1024;

function walk(directory, relative = "") {
  const entries = readdirSync(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const entryRelative = path.posix.join(relative.split(path.sep).join("/"), entry.name);
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      result.push({ absolute, relative: entryRelative, kind: "symlink" });
    } else if (entry.isDirectory()) {
      result.push({ absolute, relative: entryRelative, kind: "directory" }, ...walk(absolute, entryRelative));
    } else if (entry.isFile()) {
      result.push({ absolute, relative: entryRelative, kind: "file" });
    } else {
      result.push({ absolute, relative: entryRelative, kind: "other" });
    }
  }
  return result;
}

export function inspectDocsArtifact(siteDirectory) {
  if (typeof siteDirectory !== "string" || !path.isAbsolute(siteDirectory)) {
    throw new TypeError("The documentation artifact path must be absolute.");
  }
  const root = path.resolve(siteDirectory);
  const stat = lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("The documentation artifact must be a real directory.");

  const entries = walk(root);
  const errors = [];
  const totalBytes = entries.filter(entry => entry.kind === "file")
    .reduce((sum, entry) => sum + lstatSync(entry.absolute).size, 0);

  if (totalBytes > maxArtifactBytes) errors.push("Artifact exceeds the 100 MiB documentation size limit.");
  if (!entries.some(entry => entry.kind === "file" && entry.relative === "index.html")) {
    errors.push("Artifact is missing index.html at its root.");
  }

  for (const entry of entries) {
    const segments = entry.relative.split("/");
    if (entry.kind === "symlink") errors.push(`Symlink is not allowed: ${entry.relative}`);
    if (entry.kind === "other") errors.push(`Unsupported filesystem entry: ${entry.relative}`);
    if (segments.some(segment => segment.startsWith(".") || forbiddenName.test(segment))
      || forbiddenExtension.test(entry.relative)) {
      errors.push(`Forbidden path in artifact: ${entry.relative}`);
      continue;
    }
    if (entry.kind !== "file") continue;

    const extension = path.extname(entry.relative).toLowerCase();
    if (!textExtensions.has(extension)) continue;
    const body = readFileSync(entry.absolute, "utf8");
    if (credentialPatterns.some(pattern => pattern.test(body))) {
      errors.push(`Credential-shaped value in artifact: ${entry.relative}`);
    }
  }
  return [...new Set(errors)];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const siteDirectory = path.resolve(process.argv[2] ?? path.join(repositoryRoot, ".docs-site/site"));
  try {
    const errors = inspectDocsArtifact(siteDirectory);
    if (errors.length > 0) {
      for (const error of errors) process.stderr.write(`${error}\n`);
      process.exitCode = 1;
    } else {
      process.stdout.write("Documentation artifact passed file and credential checks.\n");
    }
  } catch {
    process.stderr.write("Could not inspect the documentation artifact. Check the build output path.\n");
    process.exitCode = 1;
  }
}
