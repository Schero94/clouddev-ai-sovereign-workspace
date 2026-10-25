import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const roots = [
  "AGENTS.md",
  ".railway",
  "services",
  "scripts",
  "tests",
  "docker-compose.yml",
  "docker-compose.mock.yml",
];
const secretPattern = /(?:\bsk-[A-Za-z0-9]{24,}\b|\bgh[pousr]_[A-Za-z0-9]{24,}\b|\brailway_(?:prod|live|token)_[A-Za-z0-9]{20,}\b|(?:OPENAI_API_KEY|ANTHROPIC_API_KEY|OMNIROUTE_API_KEY|OMNIROUTE_MASTER_KEY|CLOUDDEV_WORKSPACE_AUTH_SECRET|FORGEJO_ADMIN_PASSWORD|POSTGRES_PASSWORD)\s*[:=]\s*["']?[A-Za-z0-9/+_-]{24,})/;
const privilegedPattern = /docker\.sock|--privileged|privileged:\s*true/;
const latestImagePattern = /(:latest(?:[\s"@]|$)|image:\s*[^\s]+:latest)/;
const publicPostgresPattern = /5432:5432|POSTGRES_PUBLIC_URL|DATABASE_PUBLIC_URL/;
const skippedDirectories = new Set([".git", ".playwright-cli", "node_modules", "output"]);

function isExcluded(relativePath) {
  const normalized = relativePath.split(path.sep).join("/");
  const basename = path.basename(normalized);
  return normalized.split("/").some(part => skippedDirectories.has(part))
    || normalized.split("/").includes("test")
    || basename === "README.md"
    || basename.endsWith(".lock")
    || basename.endsWith(".example")
    || /\.test\.[^.]+$/.test(basename);
}

function readScannableFiles(relativeRoot, output = []) {
  const absoluteRoot = path.resolve(repositoryDirectory, relativeRoot);
  let metadata;
  try { metadata = lstatSync(absoluteRoot); }
  catch (error) {
    if (error?.code === "ENOENT") return output;
    throw error;
  }
  if (metadata.isSymbolicLink()) return output;
  if (metadata.isFile()) {
    if (!isExcluded(relativeRoot)) output.push(relativeRoot);
    return output;
  }
  if (!metadata.isDirectory()) return output;
  for (const entry of readdirSync(absoluteRoot, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory() && skippedDirectories.has(entry.name)) continue;
    readScannableFiles(path.join(relativeRoot, entry.name), output);
  }
  return output;
}

function lineNumberAt(content, index) {
  return content.slice(0, index).split("\n").length;
}

export function findTextViolations(relativePath, content) {
  const violations = [];
  if (secretPattern.test(content)) violations.push("secret-shaped credential");

  const normalized = relativePath.split(path.sep).join("/");
  if (/^(?:services\/ide|services\/forgejo)\/|^docker-compose(?:\.mock)?\.yml$|^\.railway\/railway\.ts$/.test(normalized)
    && privilegedPattern.test(content)) {
    violations.push("privileged container access or Docker socket");
  }
  if (/^(?:services\/[^/]+\/Dockerfile|docker-compose(?:\.mock)?\.yml|\.railway\/railway\.ts)$/.test(normalized)
    && latestImagePattern.test(content)) {
    violations.push("unpinned latest image");
  }
  if (/^(?:docker-compose(?:\.mock)?\.yml|\.railway\/railway\.ts)$/.test(normalized)
    && publicPostgresPattern.test(content)) {
    violations.push("public PostgreSQL endpoint");
  }

  return violations.map(kind => `${relativePath}:${lineNumberAt(content, content.search(
    kind === "secret-shaped credential" ? secretPattern
      : kind === "privileged container access or Docker socket" ? privilegedPattern
        : kind === "unpinned latest image" ? latestImagePattern
          : publicPostgresPattern,
  ))}: ${kind}`);
}

export function scanRepository() {
  const files = [...new Set(roots.flatMap(root => readScannableFiles(root)))].sort();
  const violations = [];
  for (const relativePath of files) {
    let content;
    try { content = readFileSync(path.join(repositoryDirectory, relativePath), "utf8"); }
    catch { violations.push(`${relativePath}: could not read source file`); continue; }
    violations.push(...findTextViolations(relativePath, content));
  }

  const sshd = readFileSync(path.join(repositoryDirectory, "services/ide/sshd_config"), "utf8");
  for (const required of [
    "PasswordAuthentication no",
    "KbdInteractiveAuthentication no",
    "PermitRootLogin no",
    "AuthenticationMethods publickey",
  ]) {
    if (!sshd.includes(required)) violations.push(`services/ide/sshd_config: missing ${required}`);
  }
  const caddyfile = readFileSync(path.join(repositoryDirectory, "services/ide/Caddyfile.template"), "utf8");
  if (!caddyfile.includes("admin off")) violations.push("services/ide/Caddyfile.template: Caddy admin API must be disabled");
  const railway = readFileSync(path.join(repositoryDirectory, ".railway/railway.ts"), "utf8");
  if (!railway.includes("sleepApplication: false")) violations.push(".railway/railway.ts: application sleep must be disabled");
  return { filesScanned: files.length, violations };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = scanRepository();
  if (result.violations.length) {
    for (const violation of result.violations) process.stderr.write(`${violation}\n`);
    process.stderr.write("Security static checks failed.\n");
    process.exitCode = 1;
  } else {
    process.stdout.write(`Security static checks passed across ${result.filesScanned} source files. This does not replace image vulnerability scanning or live authentication tests.\n`);
  }
}
