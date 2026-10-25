import { pathToFileURL } from "node:url";

const MAX_TIMEOUT_MS = 2500;

export function healthUrl(env = process.env) {
  const basePath = env.OMNIROUTE_BASE_PATH || "";
  if (basePath !== "" && !/^\/(?:[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*)?$/.test(basePath)) {
    throw new Error("OmniRoute base path is invalid.");
  }
  const raw = env.OMNIROUTE_HEALTH_URL || `http://127.0.0.1:${env.PORT || "20128"}${basePath}/healthz`;
  let url;
  try { url = new URL(raw); } catch { throw new Error("OmniRoute health URL is invalid."); }
  const localHost = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (!localHost || url.protocol !== "http:" || !/^\/(?:[A-Za-z0-9_-]+\/)*healthz$/.test(url.pathname)
    || url.search || url.hash || url.username || url.password) {
    throw new Error("OmniRoute health URL must be a local HTTP base-path /healthz URL.");
  }
  return url.href;
}

export async function checkHealth({ env = process.env, fetchImpl = fetch } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MAX_TIMEOUT_MS);
  try {
    const response = await fetchImpl(healthUrl(env), {
      method: "GET",
      redirect: "error",
      headers: { accept: "text/plain" },
      signal: controller.signal,
    });
    return response.status === 200;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  checkHealth().then(healthy => {
    process.exitCode = healthy ? 0 : 1;
  }).catch(() => {
    process.exitCode = 1;
  });
}
