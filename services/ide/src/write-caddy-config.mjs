import { chmodSync, chownSync, closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeSync } from "node:fs";
import { createHmac, randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CADDYFILE_TEMPLATE_PATH = fileURLToPath(new URL("../Caddyfile.template", import.meta.url));

function safeDirectory(directory, mode, uid, gid) {
  const resolved = path.resolve(directory);
  const root = path.parse(resolved).root;
  const relative = path.relative(root, resolved);
  let current = root;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      const metadata = lstatSync(current);
      if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
        throw new Error("Caddy config path contains a symlink or non-directory.");
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      mkdirSync(current, { mode });
    }
  }
  chmodSync(resolved, mode);
  if (typeof process.getuid === "function" && process.getuid() === 0) chownSync(resolved, uid, gid);
  return resolved;
}

function validateAuthSecret(secret) {
  if (typeof secret !== "string" || !/^[A-Za-z0-9_-]{32,128}$/.test(secret)) {
    throw new Error("A generated workspace authentication secret is required.");
  }
}

function validateLoopbackUpstream(value, label, fallback) {
  const upstream = value ?? fallback;
  if (typeof upstream !== "string" || !/^127\.0\.0\.1:(?:[1-9][0-9]{0,4})$/.test(upstream)) {
    throw new Error(`${label} must use a loopback IPv4 address and an explicit port.`);
  }
  const port = Number(upstream.slice(upstream.lastIndexOf(":") + 1));
  if (port > 65535) throw new Error(`${label} has an invalid port.`);
  return upstream;
}

function validatePrivateUpstream(host, port, label, defaultHost, defaultPort) {
  const upstreamHost = host || defaultHost;
  const rawPort = port === undefined || port === "" ? String(defaultPort) : String(port);
  const validHost = upstreamHost === "127.0.0.1" || /^[a-zA-Z0-9](?:[a-zA-Z0-9.-]{0,251}[a-zA-Z0-9])?$/.test(upstreamHost);
  if (!validHost || !/^[1-9][0-9]{0,4}$/.test(rawPort) || Number(rawPort) > 65535) {
    throw new Error(`${label} must use a private service hostname and a valid port.`);
  }
  return `${upstreamHost}:${rawPort}`;
}

function validateListenerPort(value, label, fallback) {
  const port = value === undefined || value === "" ? fallback : Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(`${label} must be an integer from 1024 through 65535.`);
  }
  return port;
}

export function createCaddyfile({
  port = 8080,
  omnirouteProxyPort = process.env.CLOUDDEV_OMNIROUTE_PROXY_PORT,
  omnirouteHost = process.env.CLOUDDEV_OMNIROUTE_HOST,
  omnirouteDashboardPort = process.env.CLOUDDEV_OMNIROUTE_PORT,
  authSecret = process.env.CLOUDDEV_WORKSPACE_AUTH_SECRET,
  authUpstream,
  vscodeUpstream,
  launchpadUpstream,
  cloudcliUpstream,
} = {}) {
  if (!Number.isInteger(Number(port)) || Number(port) < 1024 || Number(port) > 65535) {
    throw new Error("Caddy listener port must be an integer from 1024 through 65535.");
  }
  validateAuthSecret(authSecret);
  const proxyPort = validateListenerPort(omnirouteProxyPort, "OmniRoute local proxy port", 20129);
  const authInternalKey = createHmac("sha256", authSecret).update("clouddev-caddy-forward-auth-v1").digest("base64url");
  const upstreams = {
    "@@AUTH_UPSTREAM@@": validateLoopbackUpstream(authUpstream, "workspace auth upstream", "127.0.0.1:3002"),
    "@@AUTH_CHECK_UPSTREAM@@": validateLoopbackUpstream(authUpstream, "workspace auth-check upstream", "127.0.0.1:3002"),
    "@@VSCODE_UPSTREAM@@": validateLoopbackUpstream(vscodeUpstream, "code-server upstream", "127.0.0.1:8081"),
    "@@LAUNCHPAD_UPSTREAM@@": validateLoopbackUpstream(launchpadUpstream, "launchpad upstream", "127.0.0.1:3002"),
    "@@CLOUDCLI_UPSTREAM@@": validateLoopbackUpstream(cloudcliUpstream, "CloudCLI upstream", "127.0.0.1:3001"),
    "@@OMNIROUTE_DASHBOARD_PUBLIC_UPSTREAM@@": validatePrivateUpstream(omnirouteHost, omnirouteDashboardPort, "OmniRoute dashboard upstream", "clouddev-router", 20128),
    "@@OMNIROUTE_DASHBOARD_HEALTH_UPSTREAM@@": validatePrivateUpstream(omnirouteHost, omnirouteDashboardPort, "OmniRoute dashboard upstream", "clouddev-router", 20128),
    "@@OMNIROUTE_DASHBOARD_CATALOG_UPSTREAM@@": validatePrivateUpstream(omnirouteHost, omnirouteDashboardPort, "OmniRoute API upstream", "clouddev-router", 20128),
    "@@AUTH_LOGIN_KEY@@": authInternalKey,
    "@@AUTH_CHECK_KEY@@": authInternalKey,
  };

  let template = readFileSync(CADDYFILE_TEMPLATE_PATH, "utf8");
  for (const [placeholder, value] of [
    ["@@PORT@@", String(Number(port))],
    ["@@OMNIROUTE_PROXY_PORT@@", String(proxyPort)],
    ...Object.entries(upstreams),
  ]) {
    if (template.split(placeholder).length !== 2) throw new Error("Caddyfile template has an invalid placeholder count.");
    template = template.replace(placeholder, value);
  }
  if (/@@[A-Z0-9_]+@@/.test(template)) throw new Error("Caddyfile template contains an unresolved placeholder.");
  return template;
}

export function writeCaddyConfig({
  directory = "/run/clouddev-caddy",
  authSecret = process.env.CLOUDDEV_WORKSPACE_AUTH_SECRET,
  port = 8080,
  uid = 0,
  gid = 1001,
} = {}) {
  validateAuthSecret(authSecret);
  const content = createCaddyfile({ port, authSecret });
  const configDirectory = safeDirectory(directory, 0o750, uid, gid);
  const configPath = path.join(configDirectory, "Caddyfile");
  try {
    const existing = lstatSync(configPath);
    if (existing.isSymbolicLink() || !existing.isFile()) {
      throw new Error("Refusing to replace a non-regular Caddy config.");
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const temporaryPath = `${configPath}.${randomUUID()}.tmp`;
  let descriptor;
  try {
    descriptor = openSync(temporaryPath, "wx", 0o640);
    writeSync(descriptor, content, null, "utf8");
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    if (typeof process.getuid === "function" && process.getuid() === 0) chownSync(temporaryPath, uid, gid);
    renameSync(temporaryPath, configPath);
    chmodSync(configPath, 0o640);
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    try { unlinkSync(temporaryPath); } catch { /* The temp file may already be renamed. */ }
    throw error;
  }
  return configPath;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    writeCaddyConfig();
  } catch {
    process.stderr.write("CloudDev could not write the protected Caddy configuration. Check the generated auth secret and runtime permissions.\n");
    process.exitCode = 1;
  }
}
