import { chmodSync, chownSync, closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";

function normalizeBaseUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("OmniRoute base URL is invalid."); }
  if (url.username || url.password || url.search || url.hash) throw new Error("OmniRoute base URL must not contain credentials, query parameters, or fragments.");
  const hostname = url.hostname.toLowerCase();
  const privateHttp = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
    || hostname.endsWith(".railway.internal")
    || /^[a-z0-9-]+$/.test(hostname)
    || /^10\./.test(hostname)
    || /^192\.168\./.test(hostname)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && privateHttp)) {
    throw new Error("Public OmniRoute endpoints must use HTTPS; HTTP is allowed only for private/local services.");
  }
  if (url.pathname !== "" && url.pathname !== "/" && url.pathname !== "/v1") {
    throw new Error("OmniRoute base URL must be a root URL or its /v1 API path.");
  }
  url.pathname = "/v1";
  return url.toString().replace(/\/$/, "");
}

function ensureDirectory(directory, mode, uid, gid) {
  try {
    const metadata = lstatSync(directory);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) throw new Error("Codex config path refuses symlinks and non-directories.");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    mkdirSync(directory, { mode });
  }
  chmodSync(directory, mode);
  if (typeof process.getuid === "function" && process.getuid() === 0) chownSync(directory, uid, gid);
}

function mergeConfig(existing, baseUrl) {
  const lines = existing.split(/\r?\n/);
  const preserved = [];
  let currentSection = "";
  let skipProviderSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const section = trimmed.match(/^\[([^\]]+)\]$/)?.[1];
    if (section) {
      currentSection = section;
      skipProviderSection = section === "model_providers.omniroute" || section.startsWith("model_providers.omniroute.");
      if (skipProviderSection) continue;
    }
    if (skipProviderSection) continue;
    if (currentSection === "" && /^model_provider\s*=/.test(trimmed)) continue;
    preserved.push(line);
  }

  while (preserved.length > 0 && preserved.at(-1).trim() === "") preserved.pop();
  return [
    'model_provider = "omniroute"',
    ...preserved,
    "",
    "[model_providers.omniroute]",
    'name = "OmniRoute"',
    `base_url = ${JSON.stringify(baseUrl)}`,
    'env_key = "OMNIROUTE_API_KEY"',
    'wire_api = "responses"',
    "",
  ].join("\n");
}

export function ensureCodexGatewayConfig({
  codexHome = process.env.CODEX_HOME,
  baseUrl = process.env.CLOUDDEV_OMNIROUTE_BASE_URL || "http://127.0.0.1:20129",
  uid = 1000,
  gid = 1000,
} = {}) {
  if (typeof codexHome !== "string" || codexHome.length === 0) throw new Error("Persistent CODEX_HOME is unavailable.");
  const resolvedHome = path.resolve(codexHome);
  const rootHome = path.dirname(resolvedHome);
  ensureDirectory(rootHome, 0o700, uid, gid);
  ensureDirectory(resolvedHome, 0o700, uid, gid);
  const configPath = path.join(resolvedHome, "config.toml");
  let existing = "";
  try {
    const metadata = lstatSync(configPath);
    if (metadata.isSymbolicLink() || !metadata.isFile()) throw new Error("Codex config refuses a symlink or non-regular file.");
    if ((metadata.mode & 0o077) !== 0) throw new Error("Codex config permissions must be mode 0600.");
    existing = readFileSync(configPath, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const content = mergeConfig(existing, normalizeBaseUrl(baseUrl));
  const temporaryPath = `${configPath}.${randomUUID()}.tmp`;
  let descriptor;
  try {
    descriptor = openSync(temporaryPath, "wx", 0o600);
    writeSync(descriptor, content, null, "utf8");
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    if (typeof process.getuid === "function" && process.getuid() === 0) chownSync(temporaryPath, uid, gid);
    renameSync(temporaryPath, configPath);
    chmodSync(configPath, 0o600);
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    try { unlinkSync(temporaryPath); } catch { /* The temp file may already be renamed. */ }
    throw error;
  }
  return configPath;
}
