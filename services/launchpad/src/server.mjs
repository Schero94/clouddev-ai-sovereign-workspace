import { constants as fsConstants } from "node:fs";
import { open } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { connect as connectTcp } from "node:net";
import { fileURLToPath } from "node:url";
import { dirname, isAbsolute, resolve } from "node:path";
import { createWorkspaceAuth } from "./workspace-auth.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const assetDirectory = resolve(directory, "../public");
const services = [
  ["ide", "Browser IDE"],
  ["git", "Forgejo Git"],
  ["postgres", "PostgreSQL"],
  ["router", "OmniRoute"],
];
const assets = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/privacy", ["privacy.html", "text/html; charset=utf-8"]],
  ["/privacy.html", ["privacy.html", "text/html; charset=utf-8"]],
  ["/favicon.ico", ["favicon.svg", "image/svg+xml"]],
  ["/favicon.svg", ["favicon.svg", "image/svg+xml"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/auth.css", ["auth.css", "text/css; charset=utf-8"]],
]);

export function validateConfig(config) {
  if (!config || typeof config !== "object") throw new TypeError("Launchpad configuration is required.");
  const production = config.production === true;
  const basePath = validateBasePath(config.basePath);
  const publicUrls = Object.fromEntries(services
    .filter(([id]) => id !== "postgres")
    .map(([id]) => [id, validateUrl(config.publicUrls?.[id], `${id} public URL`, production, true, true)]));
  const healthTargets = Object.fromEntries(services.map(([id]) => [id, validateHealthTarget(config.healthTargets?.[id], id)]));
  const sshProxy = validateSshProxy(config.sshProxy, "Workspace SSH proxy");
  const gitSshProxy = validateSshProxy(config.gitSshProxy, "Git SSH proxy");
  const sshHostFingerprint = validateSshHostFingerprint(config.sshHostFingerprint);
  const port = Number(config.port ?? 3002);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("LAUNCHPAD_PORT must be between 1 and 65535.");
  const recoverySummaryPath = validateRecoverySummaryPath(config.recoverySummaryPath);
  const probeTimeoutMs = Number(config.probeTimeoutMs ?? 1500);
  if (!Number.isInteger(probeTimeoutMs) || probeTimeoutMs < 10 || probeTimeoutMs > 5000) {
    throw new Error("LAUNCHPAD_PROBE_TIMEOUT_MS must be between 10 and 5000.");
  }
  return { production, basePath, publicUrls, healthTargets, sshProxy, gitSshProxy, sshHostFingerprint, port, recoverySummaryPath, probeTimeoutMs };
}

function validateSshHostFingerprint(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^SHA256:[A-Za-z0-9+/]{43}$/.test(value)) {
    throw new Error("Workspace SSH host-key fingerprint is invalid.");
  }
  return value;
}

function validateBasePath(value) {
  const basePath = value === undefined || value === "" ? "/launchpad" : value;
  if (typeof basePath !== "string" || !/^\/(?:[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*)?$/.test(basePath)) {
    throw new Error("LAUNCHPAD_BASE_PATH is invalid.");
  }
  return basePath;
}

function validateRecoverySummaryPath(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 4096 || !isAbsolute(value)) {
    throw new Error("LAUNCHPAD_RECOVERY_SUMMARY must be an absolute file path.");
  }
  return value;
}

function routePathFor(path, basePath) {
  if (basePath === "/") return path;
  if (path === basePath) return "/";
  // Caddy may preserve the prefix or strip it before proxying.
  return path.startsWith(`${basePath}/`) ? path.slice(basePath.length) : path;
}

function validateUrl(value, label, production, optional, publicLink = false) {
  if ((value === undefined || value === "") && optional) return null;
  if (typeof value !== "string") throw new Error(`${label} is invalid.`);
  if (!value.includes("://")) {
    if (!/^[a-zA-Z0-9.-]+(?::[0-9]{1,5})?$/.test(value)) throw new Error(`${label} is invalid.`);
    const hostname = value.replace(/:\d+$/, "");
    value = `${production || !isLocalHostname(hostname) ? "https" : "http"}://${value}`;
  }
  let url;
  try { url = new URL(value); } catch { throw new Error(`${label} is invalid.`); }
  const localDevelopmentHttp = !production && url.protocol === "http:" && (!publicLink || isLocalHostname(url.hostname));
  const allowedProtocol = url.protocol === "https:" || localDevelopmentHttp;
  if (!allowedProtocol || !url.hostname || url.username || url.password || url.search || url.hash) {
    throw new Error(`${label} must use HTTPS or local HTTP in development and contain no credentials, query, or fragment.`);
  }
  return url.href.replace(/\/$/, "");
}

function isLocalHostname(hostname) {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized.endsWith(".localhost");
}

function validateSshProxy(proxy, label) {
  if (proxy === undefined || proxy === null) return null;
  if (typeof proxy !== "object" || Array.isArray(proxy)) throw new Error(`${label} configuration is invalid.`);
  const { host, port: rawPort } = proxy;
  if ((host === undefined || host === "") && (rawPort === undefined || rawPort === "")) return null;
  if (host === undefined || host === "" || rawPort === undefined || rawPort === "") {
    throw new Error(`${label} host and port must be configured together.`);
  }
  const hostnamePattern = /^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)(?:\.(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?))*$/;
  if (typeof host !== "string" || !hostnamePattern.test(host)) throw new Error(`${label} host is invalid.`);
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`${label} port is invalid.`);
  return { host, port };
}

function validateHealthTarget(target, id) {
  if (target === undefined || target === null) return null;
  if (target.type === "http") {
    const url = validateUrl(target.url, `${id} health URL`, false, false);
    return { type: "http", url };
  }
  if (target.type === "tcp") {
    if (typeof target.host !== "string" || !/^[a-zA-Z0-9.-]{1,253}$/.test(target.host)) throw new Error(`${id} health host is invalid.`);
    const port = Number(target.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`${id} health port is invalid.`);
    return { type: "tcp", host: target.host, port };
  }
  throw new Error(`${id} health target type is invalid.`);
}

function setHeaders(response, production) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader("Content-Security-Policy", "default-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'");
  response.setHeader("Cache-Control", "no-store");
  if (production) response.setHeader("Strict-Transport-Security", "max-age=31536000");
}

function probeHttp(url, timeoutMs, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetchImpl(url, { method: "GET", redirect: "error", signal: controller.signal })
    .then(response => response.ok)
    .catch(() => false)
    .finally(() => clearTimeout(timer));
}

function probeTcp(host, port, timeoutMs) {
  return new Promise(resolveProbe => {
    const socket = connectTcp({ host, port });
    const timer = setTimeout(() => socket.destroy(new Error("timeout")), timeoutMs);
    const finish = value => {
      clearTimeout(timer);
      socket.destroy();
      resolveProbe(value);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

const maxRecoverySummaryBytes = 1024 * 1024;

async function readRecoverySummary(summaryPath) {
  if (!summaryPath) return { status: "not-configured", counts: null };
  if (!Number.isInteger(fsConstants.O_NOFOLLOW)) return { status: "unavailable", counts: null };

  let file;
  try {
    file = await open(summaryPath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const info = await file.stat();
    if (!info.isFile() || info.size > maxRecoverySummaryBytes || (info.mode & 0o022) !== 0) {
      return { status: "unavailable", counts: null };
    }
    const buffer = Buffer.alloc(maxRecoverySummaryBytes + 1);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    if (bytesRead !== info.size || bytesRead > maxRecoverySummaryBytes) return { status: "unavailable", counts: null };

    const parsed = JSON.parse(buffer.subarray(0, bytesRead).toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || parsed.version !== 1
      || !parsed.counts || typeof parsed.counts !== "object" || Array.isArray(parsed.counts)) {
      return { status: "unavailable", counts: null };
    }

    const countKeys = ["total", "running", "interrupted", "completed", "failed", "other"];
    const counts = Object.fromEntries(countKeys.map(key => [key, parsed.counts[key]]));
    if (countKeys.some(key => !Number.isSafeInteger(counts[key]) || counts[key] < 0)) {
      return { status: "unavailable", counts: null };
    }
    return { status: "available", counts };
  } catch {
    return { status: "unavailable", counts: null };
  } finally {
    if (file) await file.close().catch(() => {});
  }
}

async function getStatus(config, fetchImpl) {
  const checks = await Promise.all(services.map(async ([id, label]) => {
    const target = config.healthTargets[id];
    let status = "not-configured";
    if (target?.type === "http") status = await probeHttp(target.url, config.probeTimeoutMs, fetchImpl) ? "ready" : "unavailable";
    if (target?.type === "tcp") status = await probeTcp(target.host, target.port, config.probeTimeoutMs) ? "ready" : "unavailable";
    return { id, label, status, url: id === "postgres" ? null : config.publicUrls[id] };
  }));
  const recoverySummary = await readRecoverySummary(config.recoverySummaryPath);
  const ideUrl = config.publicUrls.ide;
  const serviceRoot = url => url ? `${url.replace(/\/+$/, "")}/` : null;
  return {
    services: checks,
    links: {
      cloudcli: serviceRoot(ideUrl),
      vscode: ideUrl ? `${ideUrl.replace(/\/+$/, "")}/vscode/` : null,
      git: serviceRoot(config.publicUrls.git),
      router: serviceRoot(config.publicUrls.router),
      ssh: config.sshProxy,
      sshHostFingerprint: config.sshHostFingerprint,
      gitSsh: config.gitSshProxy,
    },
    workspace: {
      health: checks.find(service => service.id === "ide")?.status ?? "unknown",
      recovery: "manual",
      recoverySummary,
    },
  };
}

export function createServer(inputConfig, options = {}) {
  const config = validateConfig(inputConfig);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const workspaceAuth = options.workspaceAuth ?? (process.env.CLOUDDEV_WORKSPACE_PASSWORD && process.env.CLOUDDEV_WORKSPACE_AUTH_SECRET
    ? createWorkspaceAuth({
      workspacePassword: process.env.CLOUDDEV_WORKSPACE_PASSWORD,
      secret: process.env.CLOUDDEV_WORKSPACE_AUTH_SECRET,
      secureCookies: config.production,
    })
    : null);

  return createHttpServer(async (request, response) => {
    setHeaders(response, config.production);
    try {
      const requestedPath = new URL(request.url ?? "/", "http://launchpad.invalid").pathname;
      if (workspaceAuth && await workspaceAuth.handle(request, response)) return;
      const path = routePathFor(requestedPath, config.basePath);
      if (config.basePath !== "/" && requestedPath === config.basePath) {
        response.writeHead(308, { Location: `${config.basePath}/`, "Cache-Control": "no-store" });
        response.end();
        return;
      }
      if (requestedPath === "/healthz" || path === "/healthz") {
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(request.method === "HEAD" ? undefined : JSON.stringify({ status: "ok" }));
        return;
      }
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405, { "Content-Type": "text/plain; charset=utf-8", Allow: "GET, HEAD" });
        response.end("Method not allowed.\n");
        return;
      }
      if (path === "/api/status") {
        const body = JSON.stringify(await getStatus(config, fetchImpl));
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(request.method === "HEAD" ? undefined : body);
        return;
      }
      const asset = assets.get(path);
      if (!asset) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end(request.method === "HEAD" ? undefined : "Not found.\n");
        return;
      }
      const body = await readFile(resolve(assetDirectory, asset[0]));
      response.writeHead(200, { "Content-Type": asset[1] });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(request.method === "HEAD" ? undefined : "Service unavailable.\n");
    }
  });
}

export function configFromEnvironment(env) {
  const production = env.NODE_ENV === "production";
  const hasSshProxyOverride = Boolean(env.IDE_SSH_PROXY_HOST || env.IDE_SSH_PROXY_PORT);
  const workspacePublicUrl = env.WORKSPACE_PUBLIC_URL || env.RAILWAY_PUBLIC_DOMAIN || env.IDE_PUBLIC_URL;
  let routerPublicUrl = env.ROUTER_PUBLIC_URL;
  if (!routerPublicUrl && typeof workspacePublicUrl === "string" && workspacePublicUrl.length > 0) {
    try {
      const base = new URL(workspacePublicUrl.includes("://")
        ? workspacePublicUrl
        : `${production ? "https" : "http"}://${workspacePublicUrl}`);
      base.pathname = `${base.pathname.replace(/\/+$/, "")}/omniroute`;
      routerPublicUrl = base.href.replace(/\/$/, "");
    } catch {
      routerPublicUrl = undefined;
    }
  }
  const httpTarget = (host, port, path) => host && port
    ? { type: "http", url: `http://${host}:${port}${path}` }
    : undefined;
  return {
    production,
    basePath: env.LAUNCHPAD_BASE_PATH ?? "/launchpad",
    port: env.LAUNCHPAD_PORT ?? 3002,
    recoverySummaryPath: env.LAUNCHPAD_RECOVERY_SUMMARY || null,
    publicUrls: {
      ide: workspacePublicUrl,
      git: env.GIT_PUBLIC_URL,
      router: routerPublicUrl,
    },
    sshProxy: hasSshProxyOverride
      ? { host: env.IDE_SSH_PROXY_HOST, port: env.IDE_SSH_PROXY_PORT }
      : { host: env.RAILWAY_TCP_PROXY_DOMAIN, port: env.RAILWAY_TCP_PROXY_PORT },
    sshHostFingerprint: env.IDE_SSH_HOST_FINGERPRINT,
    gitSshProxy: { host: env.GIT_SSH_PROXY_HOST, port: env.GIT_SSH_PROXY_PORT },
    healthTargets: {
      ide: httpTarget(env.IDE_PRIVATE_HOST, env.IDE_PRIVATE_PORT, "/healthz"),
      git: httpTarget(env.GIT_PRIVATE_HOST, env.GIT_PRIVATE_PORT, "/api/healthz"),
      postgres: env.POSTGRES_HOST && env.POSTGRES_PORT ? { type: "tcp", host: env.POSTGRES_HOST, port: env.POSTGRES_PORT } : undefined,
      router: httpTarget(env.ROUTER_PRIVATE_HOST, env.ROUTER_PRIVATE_PORT, "/omniroute/healthz"),
    },
    probeTimeoutMs: Number(env.LAUNCHPAD_PROBE_TIMEOUT_MS ?? 1500),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (!process.env.CLOUDDEV_WORKSPACE_PASSWORD || !process.env.CLOUDDEV_WORKSPACE_AUTH_SECRET) {
      throw new Error("Workspace authentication is not configured.");
    }
    const config = validateConfig(configFromEnvironment(process.env));
    const server = createServer(config);
    server.listen(config.port, "127.0.0.1", () => process.stdout.write(`CloudDev Launchpad listening on 127.0.0.1:${config.port}.\n`));
    const stop = () => server.close(() => process.exit(0));
    process.once("SIGTERM", stop);
    process.once("SIGINT", stop);
  } catch {
    process.stderr.write("CloudDev Launchpad configuration is invalid. Check required variables.\n");
    process.exitCode = 1;
  }
}
