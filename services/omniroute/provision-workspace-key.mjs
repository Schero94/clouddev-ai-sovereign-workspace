import { createServer } from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { chmodSync, lstatSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const WORKSPACE_KEY_NAME = "clouddev-workspace";

function sessionCookie(response) {
  const headers = response.headers;
  const cookies = typeof headers.getSetCookie === "function"
    ? headers.getSetCookie()
    : [headers.get("set-cookie") ?? ""];
  const cookie = cookies
    .map(value => String(value).split(";")[0].trim())
    .find(value => value.startsWith("auth_token=") && value.length > "auth_token=".length);
  if (!cookie) throw new Error("OmniRoute did not issue a dashboard session.");
  return cookie;
}

export function readStoredWorkspaceKey(file) {
  try {
    const metadata = lstatSync(file);
    if (metadata.isSymbolicLink() || !metadata.isFile() || (metadata.mode & 0o077) !== 0) return null;
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    if (typeof parsed?.apiKey !== "string" || parsed.apiKey.length < 16 || /[\r\n\0]/.test(parsed.apiKey)) return null;
    return { id: typeof parsed.id === "string" ? parsed.id : "", apiKey: parsed.apiKey };
  } catch {
    return null;
  }
}

export function writeStoredWorkspaceKey(file, value) {
  const directory = path.dirname(file);
  mkdirSync(directory, { recursive: true, mode: 0o750 });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify({ version: 1, id: value.id, apiKey: value.apiKey })}\n`, { mode: 0o600, flag: "wx" });
    chmodSync(temporary, 0o600);
    renameSync(temporary, file);
    chmodSync(file, 0o600);
  } catch (error) {
    try { unlinkSync(temporary); } catch { /* The temporary file may already have been renamed. */ }
    throw error;
  }
}

export async function probeWorkspaceKey(baseUrl, apiKey, fetchImpl) {
  const response = await fetchImpl(new URL("/omniroute/api/v1/models?kind=chat", baseUrl), {
    headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
  });
  return response.status;
}

export async function createWorkspaceKey({ baseUrl, password, fetchImpl }) {
  const origin = new URL(baseUrl).origin;
  const login = await fetchImpl(new URL("/omniroute/api/auth/login", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", origin },
    body: JSON.stringify({ password }),
  });
  if (!login.ok) throw new Error(`OmniRoute dashboard sign-in failed with HTTP ${login.status}.`);
  const cookie = sessionCookie(login);
  const created = await fetchImpl(new URL("/omniroute/api/keys", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", origin, cookie },
    body: JSON.stringify({
      name: WORKSPACE_KEY_NAME,
      modelAccessMode: "all",
      allowedModels: [],
      connectionAccessMode: "all",
      allowedConnections: [],
      noLog: true,
    }),
  });
  if (!created.ok) throw new Error(`OmniRoute did not create the workspace inference key (HTTP ${created.status}).`);
  const payload = await created.json();
  if (typeof payload?.key !== "string" || payload.key.length < 16 || /[\r\n\0]/.test(payload.key)) {
    throw new Error("OmniRoute did not return a usable workspace inference key.");
  }
  return { id: typeof payload.id === "string" ? payload.id : "", apiKey: payload.key };
}

export async function ensureWorkspaceKey({ dataFile, baseUrl, password, fetchImpl }) {
  const stored = readStoredWorkspaceKey(dataFile);
  if (stored) {
    const status = await probeWorkspaceKey(baseUrl, stored.apiKey, fetchImpl);
    if (status === 200) return stored;
    if (status !== 401 && status !== 403) throw new Error(`OmniRoute workspace key check failed with HTTP ${status}.`);
  }
  const created = await createWorkspaceKey({ baseUrl, password, fetchImpl });
  writeStoredWorkspaceKey(dataFile, created);
  return created;
}

export function authorizeBearer(header, secret) {
  if (typeof header !== "string" || typeof secret !== "string" || secret.length < 32) return false;
  const match = /^Bearer ([A-Za-z0-9+/=_-]{32,256})$/.exec(header);
  if (!match) return false;
  const provided = Buffer.from(match[1]);
  const expected = Buffer.from(secret);
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

export function handleWorkspaceKeyRequest(request, response, { secret, getKey }) {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (request.method !== "GET" || url.pathname !== "/v1/workspace-gateway") {
    response.writeHead(404, { "cache-control": "no-store" });
    response.end();
    return;
  }
  if (!authorizeBearer(request.headers.authorization, secret)) {
    response.writeHead(401, { "cache-control": "no-store" });
    response.end();
    return;
  }
  const key = getKey();
  if (!key?.apiKey) {
    response.writeHead(503, { "cache-control": "no-store" });
    response.end();
    return;
  }
  response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify({ apiKey: key.apiKey }));
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "0.0.0.0", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

async function main() {
  process.on("SIGHUP", () => {});
  const secret = process.env.CLOUDDEV_GATEWAY_BOOTSTRAP_SECRET ?? "";
  const password = process.env.INITIAL_PASSWORD ?? "";
  const port = process.env.PORT || "20128";
  const listenPort = Number(process.env.CLOUDDEV_GATEWAY_BOOTSTRAP_PORT || 20130);
  const dataFile = path.join(process.env.DATA_DIR || "/app/data", "clouddev-workspace-key.json");
  if (secret.length < 32 || password.length < 16 || !Number.isInteger(listenPort) || listenPort < 1 || listenPort > 65535) {
    process.stderr.write("CloudDev could not start the private workspace-key handoff.\n");
    process.exitCode = 1;
    return;
  }
  const baseUrl = `http://127.0.0.1:${port}`;
  let current = null;
  const server = createServer((request, response) => {
    handleWorkspaceKeyRequest(request, response, { secret, getKey: () => current });
  });
  let listening = false;
  for (;;) {
    try {
      current = await ensureWorkspaceKey({ dataFile, baseUrl, password, fetchImpl: fetch });
      if (!listening) {
        await listen(server, listenPort);
        listening = true;
      }
    } catch {
      process.stderr.write("CloudDev is still preparing the workspace inference key.\n");
    }
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
