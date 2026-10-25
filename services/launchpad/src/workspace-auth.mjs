import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const COOKIE_NAME = "clouddev_workspace_session";
const SESSION_SECONDS = 8 * 60 * 60;
const LOGIN_CSS = fileURLToPath(new URL("../public/auth.css", import.meta.url));
const MAX_BODY_BYTES = 8192;
const MAX_FAILED_ATTEMPTS = 8;
const FAILURE_WINDOW_MS = 60_000;

function html(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function secureEqual(left, right) {
  const leftHash = createHmac("sha256", "clouddev-compare-v1").update(left).digest();
  const rightHash = createHmac("sha256", "clouddev-compare-v1").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

function safeReturnPath(value) {
  if (typeof value !== "string" || value.length > 2048 || !value.startsWith("/")
    || value.startsWith("//") || value.includes("\\") || /[\r\n\0]/.test(value)) return "/";
  try {
    const target = new URL(value, "https://clouddev.invalid");
    if (target.origin !== "https://clouddev.invalid" || target.pathname.startsWith("/auth/")) return "/";
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return "/";
  }
}

function readCookie(header, name) {
  if (typeof header !== "string" || header.length > 8192) return null;
  const matches = header.split(";").map(part => part.trim()).filter(part => part.startsWith(`${name}=`));
  if (matches.length !== 1) return null;
  const value = matches[0].slice(name.length + 1);
  return value.length <= 1024 ? value : null;
}

function sessionCookie(secret, now) {
  const payload = base64url(JSON.stringify({
    version: 1,
    expiresAt: Math.floor(now() / 1000) + SESSION_SECONDS,
    nonce: randomBytes(24).toString("base64url"),
  }));
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function validSession(value, secret, now) {
  if (typeof value !== "string") return false;
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra !== undefined || !/^[A-Za-z0-9_-]+$/.test(payload)
    || !/^[A-Za-z0-9_-]{43}$/.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return session?.version === 1
      && Number.isSafeInteger(session.expiresAt)
      && session.expiresAt > Math.floor(now() / 1000)
      && typeof session.nonce === "string";
  } catch {
    return false;
  }
}

function cookieHeader(value, secureCookies, maxAge = SESSION_SECONDS) {
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secureCookies ? "; Secure" : ""}`;
}

function responseHeaders(response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'");
}

function sendText(response, status, body, headers = {}) {
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", ...headers });
  response.end(body);
}

function requestOriginMatches(request, secureCookies) {
  const originHeader = request.headers.origin;
  const expectedHost = String(request.headers["x-forwarded-host"] ?? request.headers.host ?? "").split(",")[0].trim();
  if (typeof originHeader !== "string" || !expectedHost) return false;
  try {
    const origin = new URL(originHeader);
    if (origin.host !== expectedHost || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) return false;
    if (secureCookies) return origin.protocol === "https:";
    return origin.protocol === "http:" || origin.protocol === "https:";
  } catch {
    return false;
  }
}

async function readForm(request) {
  const contentType = String(request.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
  if (contentType !== "application/x-www-form-urlencoded") return null;
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) return null;
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}

function loginPage(returnTo, failed) {
  const error = failed ? "The password was not accepted. Try again." : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><title>CloudDev AI Workspace</title><link rel="stylesheet" href="/auth/login.css"></head><body><main class="auth-shell"><section class="auth-card" aria-labelledby="title"><p class="auth-kicker">CLOUDDEV AI</p><h1 id="title">Sovereign Workspace</h1><p class="auth-copy">Sign in to your private development workspace.</p>${failed ? `<p class="auth-error" role="alert">${error}</p>` : ""}<form method="post" action="/auth/login"><input type="hidden" name="returnTo" value="${html(returnTo)}"><label for="workspace-password">Workspace password</label><input id="workspace-password" name="password" type="password" autocomplete="current-password" required autofocus><button type="submit">Continue</button></form><p class="auth-note">This workspace is for one operator. Use the separate sign-ins for CloudCLI, Forgejo, and OmniRoute.</p></section></main></body></html>`;
}

export function createWorkspaceAuth({
  workspacePassword,
  secret,
  secureCookies = false,
  now = Date.now,
} = {}) {
  if (typeof workspacePassword !== "string" || workspacePassword.length < 32 || /[\r\n\0]/.test(workspacePassword)) {
    throw new Error("Workspace browser password must contain at least 32 characters.");
  }
  if (typeof secret !== "string" || secret.length < 32 || /[\r\n\0]/.test(secret)) {
    throw new Error("Workspace auth secret must contain at least 32 characters.");
  }

  const sessionSecret = createHmac("sha256", secret).update("clouddev-workspace-cookie-v1").digest();
  const internalKey = createHmac("sha256", secret).update("clouddev-caddy-forward-auth-v1").digest("base64url");

  let failureWindowStart = 0;
  let failedAttempts = 0;

  return Object.freeze({
    async handle(request, response) {
      const url = new URL(request.url ?? "/", "http://launchpad.invalid");
      if (url.pathname.startsWith("/auth/")) {
        const provided = request.headers["x-clouddev-auth-key"];
        if (typeof provided !== "string" || !secureEqual(provided, internalKey)) {
          sendText(response, 404, "Not found.\n");
          return true;
        }
      }
      if (url.pathname === "/auth/login.css" && request.method === "GET") {
        response.writeHead(200, { "Content-Type": "text/css; charset=utf-8", "Cache-Control": "public, max-age=3600" });
        response.end(await readFile(LOGIN_CSS));
        return true;
      }
      if (url.pathname === "/auth/verify" && request.method === "GET") {
        const token = readCookie(request.headers.cookie, COOKIE_NAME);
        if (validSession(token, sessionSecret, now)) {
          response.writeHead(204, { "Cache-Control": "no-store" });
          response.end();
          return true;
        }
        const originalUri = request.headers["x-forwarded-uri"] ?? "/";
        const returnTo = safeReturnPath(originalUri);
        response.writeHead(302, {
          Location: `/auth/login?return=${encodeURIComponent(returnTo)}`,
          "Cache-Control": "no-store",
          "Set-Cookie": cookieHeader("", secureCookies, 0),
        });
        response.end();
        return true;
      }
      if (url.pathname === "/auth/login" && request.method === "GET") {
        responseHeaders(response);
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        response.end(loginPage(safeReturnPath(url.searchParams.get("return") ?? "/"), false));
        return true;
      }
      if (url.pathname === "/auth/login" && request.method === "POST") {
        if (!requestOriginMatches(request, secureCookies)) {
          sendText(response, 403, "Request origin was not accepted.\n");
          return true;
        }
        const form = await readForm(request);
        if (!form || form.getAll("password").length !== 1 || form.getAll("returnTo").length !== 1) {
          sendText(response, 400, "The sign-in request was invalid.\n");
          return true;
        }
        const candidate = form.get("password") ?? "";
        const validPassword = secureEqual(candidate, workspacePassword);
        const timestamp = now();
        if (timestamp - failureWindowStart > FAILURE_WINDOW_MS) {
          failureWindowStart = timestamp;
          failedAttempts = 0;
        }
        if (!validPassword) {
          failedAttempts += 1;
          if (failedAttempts > MAX_FAILED_ATTEMPTS) {
            responseHeaders(response);
            response.writeHead(429, { "Content-Type": "text/html; charset=utf-8", "Retry-After": "60" });
            response.end(loginPage(safeReturnPath(form.get("returnTo")), true));
            return true;
          }
          responseHeaders(response);
          response.writeHead(401, { "Content-Type": "text/html; charset=utf-8" });
          response.end(loginPage(safeReturnPath(form.get("returnTo")), true));
          return true;
        }
        failedAttempts = 0;
        response.writeHead(303, {
          Location: safeReturnPath(form.get("returnTo")),
          "Cache-Control": "no-store",
          "Set-Cookie": cookieHeader(sessionCookie(sessionSecret, now), secureCookies),
        });
        response.end();
        return true;
      }
      if (url.pathname === "/auth/logout" && request.method === "POST") {
        if (!requestOriginMatches(request, secureCookies)) {
          sendText(response, 403, "Request origin was not accepted.\n");
          return true;
        }
        response.writeHead(303, {
          Location: "/auth/login?return=%2F",
          "Cache-Control": "no-store",
          "Set-Cookie": cookieHeader("", secureCookies, 0),
        });
        response.end();
        return true;
      }
      if (url.pathname.startsWith("/auth/")) {
        sendText(response, 404, "Not found.\n");
        return true;
      }
      return false;
    },
  });
}
