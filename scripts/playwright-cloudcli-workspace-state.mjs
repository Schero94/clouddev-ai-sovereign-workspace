import { randomBytes } from "node:crypto";
import { chmodSync, lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const workspaceOrigin = "http://localhost:8080";
const sourcePrefix = path.join(realpathSync(os.tmpdir()), "clouddev-playwright-auth-");
const resultPrefix = path.join(realpathSync(os.tmpdir()), "clouddev-cloudcli-playwright-");

function readWorkspaceState(filePath) {
  if (!path.isAbsolute(filePath) || path.basename(filePath) !== "state.json") {
    throw new Error("Workspace browser state path is invalid.");
  }
  const directory = realpathSync(path.dirname(filePath));
  if (!directory.startsWith(sourcePrefix)) throw new Error("Workspace browser state is outside the temporary test directory.");
  const metadata = lstatSync(filePath);
  if (metadata.isSymbolicLink() || !metadata.isFile() || (metadata.mode & 0o077) !== 0) {
    throw new Error("Workspace browser state must be a private regular file.");
  }
  const state = JSON.parse(readFileSync(filePath, "utf8"));
  const cookie = state.cookies?.find(item => item.name === "clouddev_workspace_session"
    && item.domain === "localhost" && item.path === "/" && item.httpOnly === true);
  if (!cookie || cookie.expires <= Date.now() / 1000) throw new Error("A current authenticated workspace browser cookie is required.");
  return { state, cookie };
}

async function createCloudCliState(sourcePath) {
  const { state, cookie } = readWorkspaceState(sourcePath);
  const cookieHeader = `${cookie.name}=${cookie.value}`;
  const statusResponse = await fetch(`${workspaceOrigin}/api/auth/status`, {
    headers: { cookie: cookieHeader },
    signal: AbortSignal.timeout(5000),
  });
  if (!statusResponse.ok) throw new Error(`CloudCLI auth status returned HTTP ${statusResponse.status}.`);
  const status = await statusResponse.json();
  if (status.needsSetup !== true) throw new Error("CloudCLI already has an account; refusing to replace or reuse it in a test.");

  const username = `clouddev_mobile_${randomBytes(6).toString("hex")}`;
  const password = randomBytes(32).toString("base64url");
  const registration = await fetch(`${workspaceOrigin}/api/auth/register`, {
    method: "POST",
    headers: { origin: workspaceOrigin, cookie: cookieHeader, "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
    signal: AbortSignal.timeout(10000),
  });
  const result = await registration.json().catch(() => null);
  if (!registration.ok || result?.success !== true || typeof result?.token !== "string" || result.token.length < 24) {
    throw new Error(`CloudCLI test account setup failed with HTTP ${registration.status}.`);
  }

  const originState = state.origins?.find(item => item.origin === workspaceOrigin) ?? { origin: workspaceOrigin, localStorage: [] };
  originState.localStorage = (originState.localStorage ?? []).filter(item => item.name !== "auth-token");
  originState.localStorage.push({ name: "auth-token", value: result.token });
  const origins = (state.origins ?? []).filter(item => item.origin !== workspaceOrigin);
  origins.push(originState);

  const directory = mkdtempSync(resultPrefix);
  const statePath = path.join(directory, "state.json");
  writeFileSync(statePath, `${JSON.stringify({ ...state, origins })}\n`, { flag: "wx", mode: 0o600 });
  chmodSync(statePath, 0o600);
  process.stdout.write(`${statePath}\n`);
}

function cleanupState(filePath) {
  if (!path.isAbsolute(filePath) || path.basename(filePath) !== "state.json") {
    throw new Error("Temporary CloudCLI browser state path is invalid.");
  }
  const directory = realpathSync(path.dirname(filePath));
  if (!directory.startsWith(resultPrefix)) throw new Error("Refusing to remove state outside the temporary CloudCLI browser directory.");
  const metadata = lstatSync(filePath);
  if (metadata.isSymbolicLink() || !metadata.isFile()) throw new Error("Temporary CloudCLI browser state must be a regular file.");
  rmSync(directory, { recursive: true, force: false });
  process.stdout.write("Removed temporary CloudCLI browser auth state.\n");
}

try {
  if (process.argv[2] === "--cleanup") {
    if (!process.argv[3]) throw new Error("Pass the temporary CloudCLI browser state path to clean up.");
    cleanupState(process.argv[3]);
  } else {
    const sourcePath = process.argv[2];
    if (!sourcePath) throw new Error("Pass the temporary workspace browser state path.");
    await createCloudCliState(sourcePath);
  }
} catch (error) {
  process.stderr.write(`CloudCLI browser state setup failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
  process.exitCode = 1;
}
