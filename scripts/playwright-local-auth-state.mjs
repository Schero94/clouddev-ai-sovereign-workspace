import { lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnvText } from "./verify-local-utils.mjs";

const repositoryDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(repositoryDirectory, ".env");
const temporaryPrefix = path.join(realpathSync(os.tmpdir()), "clouddev-playwright-auth-");
const workspaceOrigin = "http://localhost:8080";

function readPassword() {
  const metadata = lstatSync(envPath);
  if (metadata.isSymbolicLink() || !metadata.isFile() || (metadata.mode & 0o077) !== 0) {
    throw new Error("Local .env must be a mode-0600 regular file.");
  }
  const values = parseEnvText(readFileSync(envPath, "utf8"));
  const password = values.CODE_SERVER_PASSWORD;
  if (typeof password !== "string" || password.length < 32) {
    throw new Error("Local workspace browser password is not configured.");
  }
  return password;
}

function cleanTemporaryState(target) {
  if (typeof target !== "string" || !path.isAbsolute(target)) throw new Error("Temporary browser state path is invalid.");
  const directory = path.dirname(target);
  const resolvedDirectory = realpathSync(directory);
  if (!resolvedDirectory.startsWith(temporaryPrefix) || path.basename(target) !== "state.json") {
    throw new Error("Refusing to remove a browser state outside the CloudDev temporary directory.");
  }
  const state = lstatSync(target);
  if (state.isSymbolicLink() || !state.isFile()) throw new Error("Temporary browser state must be a regular file.");
  rmSync(resolvedDirectory, { recursive: true, force: false });
  process.stdout.write("Removed the temporary local browser session state.\n");
}

async function createTemporaryState() {
  const response = await fetch(`${workspaceOrigin}/auth/login`, {
    method: "POST",
    headers: {
      origin: workspaceOrigin,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      password: readPassword(),
      returnTo: "/",
    }),
    redirect: "manual",
    signal: AbortSignal.timeout(5000),
  });
  if (response.status !== 303) {
    throw new Error(`Local workspace sign-in failed with HTTP ${response.status}.`);
  }
  const setCookie = response.headers.get("set-cookie") ?? "";
  const match = /^clouddev_workspace_session=([^;]+);\s*Path=\/;\s*HttpOnly;\s*SameSite=Strict;\s*Max-Age=([0-9]+)$/i.exec(setCookie);
  if (!match) throw new Error("Local workspace did not issue its expected protected session cookie.");
  const verify = await fetch(`${workspaceOrigin}/`, {
    headers: { cookie: `clouddev_workspace_session=${match[1]}` },
    redirect: "manual",
    signal: AbortSignal.timeout(5000),
  });
  if (verify.status !== 200) throw new Error(`Local workspace rejected its new session with HTTP ${verify.status}.`);

  const directory = mkdtempSync(temporaryPrefix);
  const statePath = path.join(directory, "state.json");
  const state = {
    cookies: [{
      name: "clouddev_workspace_session",
      value: match[1],
      domain: "localhost",
      path: "/",
      expires: Math.floor(Date.now() / 1000) + Number(match[2]),
      httpOnly: true,
      secure: false,
      sameSite: "Strict",
    }],
    origins: [],
  };
  writeFileSync(statePath, `${JSON.stringify(state)}\n`, { flag: "wx", mode: 0o600 });
  if (process.platform !== "win32" && (lstatSync(statePath).mode & 0o777) !== 0o600) {
    rmSync(directory, { recursive: true, force: true });
    throw new Error("Temporary browser state permissions are too broad.");
  }
  process.stdout.write(`${statePath}\n`);
}

try {
  if (process.argv[2] === "--cleanup") cleanTemporaryState(process.argv[3]);
  else await createTemporaryState();
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown error";
  process.stderr.write(`Local browser state helper failed: ${message.replace(/password|token|cookie/gi, "credential")}\n`);
  process.exitCode = 1;
}
