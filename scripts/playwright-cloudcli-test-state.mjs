import { randomBytes } from "node:crypto";
import { lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const temporaryPrefix = path.join(os.tmpdir(), "clouddev-cloudcli-playwright-");

function validateBaseUrl(value) {
  let url;
  try { url = new URL(value ?? "http://localhost:3005"); }
  catch { throw new Error("Temporary CloudCLI URL is invalid."); }
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(url.hostname)
    || url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
    throw new Error("Temporary CloudCLI browser test must use a loopback root URL.");
  }
  return url.origin;
}

function cleanupState(target) {
  if (typeof target !== "string" || !path.isAbsolute(target) || path.basename(target) !== "state.json") {
    throw new Error("Temporary CloudCLI state path is invalid.");
  }
  const directory = realpathSync(path.dirname(target));
  if (!directory.startsWith(temporaryPrefix)) {
    throw new Error("Refusing to remove browser state outside the CloudCLI temporary test directory.");
  }
  const metadata = lstatSync(target);
  if (metadata.isSymbolicLink() || !metadata.isFile()) throw new Error("Temporary CloudCLI state must be a regular file.");
  rmSync(directory, { recursive: true, force: false });
  process.stdout.write("Removed temporary CloudCLI browser auth state.\n");
}

async function createState() {
  const origin = validateBaseUrl(process.env.CLOUDDEV_TEST_CLOUDCLI_URL);
  const statusResponse = await fetch(`${origin}/api/auth/status`, { signal: AbortSignal.timeout(5000) });
  if (!statusResponse.ok) throw new Error(`Temporary CloudCLI auth status returned HTTP ${statusResponse.status}.`);
  const status = await statusResponse.json();
  if (status.needsSetup !== true) throw new Error("Temporary CloudCLI database already has a user; refusing account creation.");

  const username = `clouddev_mobile_${randomBytes(6).toString("hex")}`;
  const password = randomBytes(32).toString("base64url");
  const registration = await fetch(`${origin}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ username, password }),
    signal: AbortSignal.timeout(10000),
  });
  const result = await registration.json().catch(() => null);
  if (!registration.ok || result?.success !== true || typeof result?.token !== "string" || result.token.length < 24) {
    throw new Error(`Temporary CloudCLI account registration failed with HTTP ${registration.status}.`);
  }

  const directory = mkdtempSync(temporaryPrefix);
  const statePath = path.join(directory, "state.json");
  const state = {
    cookies: [],
    origins: [{
      origin,
      localStorage: [{ name: "auth-token", value: result.token }],
    }],
  };
  writeFileSync(statePath, `${JSON.stringify(state)}\n`, { flag: "wx", mode: 0o600 });
  if ((lstatSync(statePath).mode & 0o777) !== 0o600) {
    rmSync(directory, { recursive: true, force: true });
    throw new Error("Temporary CloudCLI auth state permissions are too broad.");
  }
  process.stdout.write(`${statePath}\n`);
}

try {
  if (process.argv[2] === "--cleanup") cleanupState(process.argv[3]);
  else await createState();
} catch (error) {
  process.stderr.write(`Temporary CloudCLI browser state helper failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
  process.exitCode = 1;
}
