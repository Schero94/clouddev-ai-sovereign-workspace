import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { localSshEndpoint, parseEnvText, quotePosix } from "./verify-local-utils.mjs";

const repositoryDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(repositoryDirectory, ".env");
const localEnv = parseEnvText(readFileSync(envPath, "utf8"));
const nonce = randomBytes(5).toString("hex");
const workspacePath = `/workspace/projects/.clouddev-verify-${nonce}`;
const markerFile = `${workspacePath}/desktop.marker`;
const agentFile = `${workspacePath}/agent.finished`;
const tempDirectory = mkdtempSync(path.join(os.tmpdir(), "clouddev-local-verify-"));
const knownHostsPath = path.join(tempDirectory, "known_hosts");
const sshKeyPath = path.join(repositoryDirectory, "secrets/local-remote-ssh");
const restartRequested = process.env.CLOUDDEV_VERIFY_RESTART === "1";
const { host: sshHost, port: sshPort } = localSshEndpoint(localEnv);
const taskId = `verify-${nonce}`;
const taskSession = `clouddev-verify-${nonce}`;
let sshAvailable = false;
let workspaceTaskRegistered = false;

function run(command, args, { input, allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryDirectory,
    encoding: "utf8",
    input,
    env: { ...process.env, CI: "1" },
    maxBuffer: 1024 * 1024,
  });
  if (result.error || (result.status !== 0 && !allowFailure)) {
    throw new Error(`Local verification command failed: ${command}.`);
  }
  return result;
}

function loopbackHttpUrl(raw, label) {
  let url;
  try { url = new URL(raw); } catch { throw new Error(`${label} URL is invalid.`); }
  assert.equal(url.protocol, "http:", `${label} must use local HTTP in this test.`);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), `${label} must be loopback-only.`);
  assert.equal(url.username, "");
  assert.equal(url.password, "");
  assert.equal(url.search, "");
  assert.equal(url.hash, "");
  return url;
}

function sshArgs() {
  return [
    "-p", String(sshPort),
    "-i", sshKeyPath,
    "-o", "BatchMode=yes",
    "-o", "IdentitiesOnly=yes",
    "-o", "StrictHostKeyChecking=yes",
    "-o", `UserKnownHostsFile=${knownHostsPath}`,
    "-o", "ConnectTimeout=8",
    `coder@${sshHost}`,
  ];
}

function ssh(command, allowFailure = false, label = "workspace SSH request") {
  const result = spawnSync("ssh", [...sshArgs(), command], {
    cwd: repositoryDirectory,
    encoding: "utf8",
    env: { ...process.env, CI: "1" },
    maxBuffer: 1024 * 1024,
  });
  if (result.error || (result.status !== 0 && !allowFailure)) {
    const diagnostic = (result.stderr || "").replace(/(?:sk-|gh[pousr]_)[A-Za-z0-9_-]{16,}/g, "[REDACTED]").trim();
    throw new Error(`${label} failed${diagnostic ? `: ${diagnostic}` : "."}`);
  }
  return result;
}

function assertHealthyStatus(status, label) {
  assert.equal(status, 200, `${label} returned HTTP ${status}.`);
}

async function main() {
  assert.equal(typeof localEnv.CODE_SERVER_PASSWORD, "string");
  assert.ok(localEnv.CODE_SERVER_PASSWORD.length >= 32, "local Caddy password is missing or too short.");
  assert.ok(readFileSync(sshKeyPath, "utf8").startsWith("-----BEGIN OPENSSH PRIVATE KEY-----"),
    "local Remote-SSH private key is missing.");

  const workspaceUrl = loopbackHttpUrl(localEnv.WORKSPACE_PUBLIC_URL || "http://localhost:8080", "Workspace");
  const forgejoUrl = loopbackHttpUrl(localEnv.GIT_PUBLIC_URL || "http://localhost:3000", "Forgejo");
  const protectedPaths = ["/", "/vscode/", "/launchpad/", "/launchpad/api/status"];

  const health = await fetch(new URL("/healthz", workspaceUrl), { redirect: "manual" });
  assertHealthyStatus(health.status, "Workspace liveness endpoint");

  for (const route of protectedPaths) {
    const response = await fetch(new URL(route, workspaceUrl), { redirect: "manual" });
    assert.equal(response.status, 302, `Unauthenticated ${route} must redirect to the protected workspace sign-in.`);
  }

  const loginPage = await fetch(new URL("/auth/login", workspaceUrl), { redirect: "manual" });
  assertHealthyStatus(loginPage.status, "Workspace sign-in page");
  const login = await fetch(new URL("/auth/login", workspaceUrl), {
    method: "POST",
    headers: {
      origin: workspaceUrl.origin,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ password: localEnv.CODE_SERVER_PASSWORD, returnTo: "/launchpad/" }),
    redirect: "manual",
  });
  assert.equal(login.status, 303, "the configured workspace password must establish a browser session.");
  const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
  assert.match(cookie ?? "", /^clouddev_workspace_session=[A-Za-z0-9_.-]+$/);

  for (const route of ["/", "/vscode/", "/launchpad/api/status"]) {
    const response = await fetch(new URL(route, workspaceUrl), {
      headers: { cookie },
      redirect: "manual",
    });
    assert.ok(response.status >= 200 && response.status < 400, `Authenticated ${route} did not load.`);
  }

  const launchpadResponse = await fetch(new URL("/launchpad/api/status", workspaceUrl), {
    headers: { cookie },
  });
  const launchpad = await launchpadResponse.json();
  const fingerprint = launchpad?.links?.sshHostFingerprint;
  assert.match(fingerprint, /^SHA256:[A-Za-z0-9+/]{43}$/);

  const privateForgejo = await fetch(new URL("/api/v1/user", forgejoUrl), { redirect: "manual" });
  assert.ok([401, 403].includes(privateForgejo.status), "Forgejo must deny anonymous API access.");

  const anonymousInference = run("docker", [
    "compose", "exec", "-T", "clouddev-ide", "node", "--input-type=module", "-e",
    'const r=await fetch("http://127.0.0.1:20129/v1/chat/completions",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});process.stdout.write(String(r.status))',
  ]).stdout.trim();
  assert.equal(anonymousInference, "401", "OmniRoute must deny inference without an API key.");

  const privateApiBridge = run("docker", [
    "compose", "exec", "-T", "clouddev-ide", "node", "--input-type=module", "-e",
    'try{await fetch("http://clouddev-router:20131/v1/chat/completions",{signal:AbortSignal.timeout(1000)});process.stdout.write("reachable")}catch{process.stdout.write("unreachable")}',
  ]).stdout.trim();
  assert.equal(privateApiBridge, "unreachable", "The OmniRoute API bridge must not be reachable from workspace agents.");

  const passwdHome = run("docker", [
    "compose", "exec", "-T", "-u", "1000:1000", "clouddev-ide", "node", "-e",
    'process.stdout.write(require("node:os").homedir())',
  ]).stdout.trim();
  assert.equal(passwdHome, "/workspace/home", "The coder account home must be the persistent mount subdirectory.");

  // The workspace image provisions one Ed25519 host key. Probe that exact
  // algorithm instead of making ssh-keyscan try absent host-key families.
  const scan = run("ssh-keyscan", ["-4", "-T", "5", "-t", "ed25519", "-p", String(sshPort), sshHost], { allowFailure: true });
  assert.equal(scan.status, 0, "The local key-only SSH listener did not answer key scan.");
  const scanFingerprint = run("ssh-keygen", ["-lf", "/dev/stdin"], { input: scan.stdout }).stdout.trim().split(/\s+/)[1];
  assert.equal(scanFingerprint, fingerprint, "Workspace SSH host key must match the launchpad fingerprint.");
  writeFileSync(knownHostsPath, scan.stdout, { mode: 0o600 });

  const sshConnected = ssh("test \"$(id -u)\" = 1000 && test \"$HOME\" = /workspace/home", false, "SSH identity and persistent home check");
  assert.equal(sshConnected.status, 0, "The workspace SSH key must connect as the unprivileged coder user.");
  sshAvailable = true;

  const taskShell = `sleep 3; printf '%s\\n' 'detached-agent-work-finished' > ${quotePosix(agentFile)}`;
  const remoteSetup = [
    `mkdir -p ${quotePosix(workspacePath)}`,
    `printf '%s\\n' 'desktop-write-visible-to-all-clients' > ${quotePosix(markerFile)}`,
    `tmux new-session -d -s ${quotePosix(taskSession)} -c ${quotePosix(workspacePath)} ${quotePosix(`sh -c ${quotePosix(taskShell)}`)}`,
  ].join(" && ");
  assert.equal(ssh(remoteSetup, false, "shared-volume write and task start").status, 0, "The SSH client must write to the shared project volume and detach a task.");
  const desktopValue = ssh(`cat ${quotePosix(markerFile)}`, false, "shared-volume read").stdout.trim();
  assert.equal(desktopValue, "desktop-write-visible-to-all-clients");

  let taskCompleted = false;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (ssh(`test -s ${quotePosix(agentFile)}`, true, "detached task poll").status === 0) {
      taskCompleted = true;
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.equal(taskCompleted, true, "A detached task must continue after the initiating SSH client disconnects.");
  assert.equal(ssh(`cat ${quotePosix(agentFile)}`, false, "detached task result").stdout.trim(), "detached-agent-work-finished");

  if (restartRequested) {
    const registerTask = `import { createTaskRegistry } from "/opt/clouddev-ide/src/task-registry.mjs"; createTaskRegistry({home:"/workspace/home"}).start({taskId:${JSON.stringify(taskId)},appSessionId:${JSON.stringify(`terminal:${taskId}`)},provider:"codex",launchMode:"terminal",tmuxSession:${JSON.stringify(taskSession)},projectPath:${JSON.stringify(workspacePath)}});`;
    assert.equal(ssh(`node --input-type=module -e ${quotePosix(registerTask)}`, false, "recovery fixture registry write").status, 0,
      "Could not create the interruption-recovery registry fixture.");
    workspaceTaskRegistered = true;
    assert.equal(ssh(`tmux new-session -d -s ${quotePosix(taskSession)} -c ${quotePosix(workspacePath)} ${quotePosix("sleep 90")}`, false, "recovery fixture task start").status, 0,
      "Could not create the interruption-recovery process fixture.");

    run("docker", ["compose", "restart", "clouddev-ide"]);
    run("docker", ["compose", "up", "-d", "--wait", "--wait-timeout", "180", "clouddev-ide"]);
    assert.equal(ssh(`cat ${quotePosix(markerFile)}`, false, "persisted workspace read").stdout.trim(), "desktop-write-visible-to-all-clients",
      "Workspace files must persist after a container restart.");
    const tasks = ssh("clouddev-tasks").stdout;
    assert.match(tasks, new RegExp(`${taskId}\\s+codex\\s+interrupted`));
    assert.match(tasks, /manual resume|open CloudCLI/);
    assert.equal(ssh(`tmux has-session -t ${quotePosix(taskSession)}`, true, "post-restart tmux absence").status, 1,
      "The task process must not be reported as surviving the container restart.");
  }

  process.stdout.write(`Local stack checks passed: browser auth, private Forgejo API, unauthenticated inference denial, key-only SSH, passwd home, shared files, detached task${restartRequested ? ", and restart interruption recovery" : ""}.\n`);
  if (!restartRequested) process.stdout.write("Restart recovery was not run. Re-run with CLOUDDEV_VERIFY_RESTART=1 to opt into restarting the local IDE service.\n");
}

async function cleanup() {
  try {
    if (sshAvailable) {
      if (workspaceTaskRegistered) {
        const removeTask = `import { createTaskRegistry } from "/opt/clouddev-ide/src/task-registry.mjs"; createTaskRegistry({home:"/workspace/home"}).remove(${JSON.stringify(taskId)});`;
        ssh(`node --input-type=module -e ${quotePosix(removeTask)}`, true);
      }
      ssh(`tmux kill-session -t ${quotePosix(taskSession)}`, true);
      if (/^\/workspace\/projects\/\.clouddev-verify-[a-f0-9]{10}$/.test(workspacePath)) {
        ssh(`rm -rf -- ${quotePosix(workspacePath)}`, true);
      }
    }
  } catch {
    // The workspace may already have stopped. Keep local cleanup independent.
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

try {
  await main();
} catch (error) {
  await cleanup();
  process.stderr.write(`Local verification failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
  process.exitCode = 1;
} finally {
  if (process.exitCode === 0 || process.exitCode === undefined) await cleanup();
}
