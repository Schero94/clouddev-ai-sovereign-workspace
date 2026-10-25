import assert from "node:assert/strict";
import { readFileSync, lstatSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseEnvText } from "./verify-local-utils.mjs";

const repositoryDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(repositoryDirectory, ".env");
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const username = `clouddev_roundtrip_${suffix}`;
const email = `${username}@localhost.invalid`;
const repoName = `clouddev-private-${suffix}`;
const gitKeyTitle = `CloudDev local test key ${suffix}`;
const cloneDirectory = `/workspace/projects/.clouddev-forgejo-${suffix}`;
const clonePath = `${cloneDirectory}/clone`;
const knownHostsPath = `/tmp/clouddev-forgejo-known-hosts-${suffix}`;
const relativeFile = "cross-device-acceptance.txt";
const fixtureContent = `clouddev-forgejo-roundtrip-${suffix}\n`;
const sharedSourceFile = process.env.CLOUDDEV_FORGEJO_SOURCE_FILE || "";
const composeBase = ["compose", "-f", "docker-compose.yml"];
let userPassword = "";
let accountCreated = false;
let workspacePathCreated = false;
let knownHostsCreated = false;

function localEnvironment() {
  const metadata = lstatSync(envPath);
  if (metadata.isSymbolicLink() || !metadata.isFile() || (metadata.mode & 0o077) !== 0) {
    throw new Error("The local Forgejo test requires a mode-0600 regular .env file.");
  }
  return parseEnvText(readFileSync(envPath, "utf8"));
}

function run(command, args, { input, env } = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryDirectory,
    encoding: "utf8",
    input,
    env: { ...process.env, ...env, CI: "1" },
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`Local Forgejo round-trip command failed (exit ${Number.isInteger(result.status) ? result.status : "spawn"}).`);
  }
  return result.stdout ?? "";
}

function compose(args, options) {
  return run("docker", [...composeBase, ...args], options);
}

function createForgejoUser() {
  const output = compose([
    "exec", "-T", "clouddev-git", "forgejo",
    "--config", "/var/lib/gitea/custom/conf/app.ini",
    "admin", "user", "create",
    "--username", username,
    "--random-password",
    "--random-password-length", "32",
    "--email", email,
    "--must-change-password=false",
  ]);
  accountCreated = true;
  const generatedPassword = output.match(/generated random password is ['"]([^'"\r\n]{16,})['"]/i)
    ?? output.match(/random password[:=]\s*['"]?([^'"\s]{16,})/i);
  if (!generatedPassword) throw new Error("Forgejo CLI did not return its generated temporary test password in the expected format.");
  userPassword = generatedPassword[1];

  const users = compose(["exec", "-T", "clouddev-git", "forgejo", "--config", "/var/lib/gitea/custom/conf/app.ini", "admin", "user", "list"]);
  const row = users.split(/\r?\n/).find(line => line.split(/\s+/)[1] === username);
  if (!row) throw new Error("Forgejo did not list the temporary test user after creation.");
  const columns = row.trim().split(/\s+/);
  assert.equal(columns[4], "false", "The round-trip account must not have administrator privileges.");
}

async function forgejoApi(route, { method = "GET", body, authenticated = true } = {}) {
  const headers = {
    accept: "application/json",
    ...(authenticated ? { authorization: `Basic ${Buffer.from(`${username}:${userPassword}`).toString("base64")}` } : {}),
    ...(body === undefined ? {} : { "content-type": "application/json" }),
  };
  const response = await fetch(`http://localhost:3000/api/v1${route}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { /* Keep error details out of test output. */ }
  if (!response.ok) throw new Error(`Forgejo API ${method} ${route} returned HTTP ${response.status}.`);
  return payload;
}

function workspaceGit(args) {
  return compose([
    "exec", "-T", "-u", "1000:1000",
    "-e", `GIT_SSH_COMMAND=ssh -i /workspace/home/.ssh/id_ed25519_clouddev -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=${knownHostsPath}`,
    "clouddev-ide", "git",
    ...args,
  ]).trim();
}

async function cleanup() {
  if (workspacePathCreated || knownHostsCreated) {
    try {
      compose([
        "exec", "-T", "-u", "1000:1000", "clouddev-ide", "node", "--input-type=module", "-e",
        `import{rmSync}from"node:fs";for(const p of ${JSON.stringify([...(workspacePathCreated ? [cloneDirectory] : []), ...(knownHostsCreated ? [knownHostsPath] : [])])})if(p.startsWith("/workspace/projects/.clouddev-forgejo-")||p.startsWith("/tmp/clouddev-forgejo-known-hosts-"))rmSync(p,{recursive:true,force:true});`,
      ]);
    } catch { /* Preserve the primary test result if the workspace is stopping. */ }
  }
  if (accountCreated) {
    try {
      compose([
        "exec", "-T", "clouddev-git", "forgejo",
        "--config", "/var/lib/gitea/custom/conf/app.ini",
      "admin", "user", "delete", "--username", username, "--purge",
      ]);
    } catch { /* The test account name is unique and contains no user data. */ }
  }
}

async function main() {
  const env = localEnvironment();
  assert.ok(env.FORGEJO_ADMIN_PASSWORD, "The local Forgejo bootstrap password must exist for initial service setup.");
  if (sharedSourceFile && !/^\/workspace\/projects\/\.clouddev-cross-device\.[A-Za-z0-9]{6}\/cross-device-acceptance\.txt$/.test(sharedSourceFile)) {
    throw new Error("The requested shared test file is outside the validated CloudDev cross-device fixture.");
  }
  compose(["exec", "-T", "clouddev-ide", "node", "/opt/clouddev-ide/src/healthcheck.mjs"]);
  createForgejoUser();

  const repository = await forgejoApi("/user/repos", {
    method: "POST",
    body: {
      name: repoName,
      description: "Temporary CloudDev private Git round-trip check",
      private: true,
      auto_init: true,
    },
  });
  assert.equal(repository?.private, true, "Forgejo must create the test repository as private.");

  const gitIdentity = compose([
    "exec", "-T", "-u", "1000:1000", "clouddev-ide", "node", "--input-type=module", "-e",
    'import{existsSync,readFileSync}from"node:fs";import{setupGitKey}from"/opt/clouddev-ide/src/git-setup.mjs";const p="/workspace/home/.ssh/id_ed25519_clouddev.pub";if(!existsSync(p))await setupGitKey({home:"/workspace/home"});process.stdout.write(readFileSync(p,"utf8"));',
  ]);
  const publicKey = gitIdentity.split(/\r?\n/).find(line => line.startsWith("ssh-ed25519 "));
  assert.match(publicKey ?? "", /^ssh-ed25519 [A-Za-z0-9+/]+={0,2}(?: .*)?$/);
  const key = await forgejoApi("/user/keys", {
    method: "POST",
    body: { title: gitKeyTitle, key: publicKey, read_only: false },
  });
  assert.equal(typeof key?.id, "number", "Forgejo must attach the dedicated workspace Git key to the regular account.");

  const anonymous = await fetch(`http://localhost:3000/api/v1/repos/${username}/${repoName}`, {
    headers: { accept: "application/json" },
    redirect: "manual",
    signal: AbortSignal.timeout(10000),
  });
  assert.ok([401, 403, 404].includes(anonymous.status), "Anonymous Forgejo API access must not reveal the private repository.");

  const scannedKeys = compose(["exec", "-T", "-u", "1000:1000", "clouddev-ide", "ssh-keyscan", "-T", "5", "-p", "2222", "clouddev-git"]);
  assert.match(scannedKeys, /^\[?clouddev-git\]?:2222 /m, "The private Forgejo SSH service must answer key scan.");
  compose([
    "exec", "-T", "-u", "1000:1000", "clouddev-ide", "node", "--input-type=module", "-e",
    `import{writeFileSync}from"node:fs";writeFileSync(${JSON.stringify(knownHostsPath)},${JSON.stringify(scannedKeys)},{flag:"wx",mode:0o600});`,
  ]);
  knownHostsCreated = true;
  compose(["exec", "-T", "-u", "1000:1000", "clouddev-ide", "mkdir", "-m", "700", "-p", cloneDirectory]);
  workspacePathCreated = true;

  const remoteUrl = `ssh://git@clouddev-git:2222/${username}/${repoName}.git`;
  workspaceGit(["clone", remoteUrl, clonePath]);
  const branch = workspaceGit(["-C", clonePath, "branch", "--show-current"]);
  assert.ok(branch, "The freshly initialized private repository must expose its default branch.");

  let expectedContent = fixtureContent.trim();
  if (sharedSourceFile) {
    expectedContent = compose([
      "exec", "-T", "-u", "1000:1000", "clouddev-ide", "node", "--input-type=module", "-e",
      `import{readFileSync}from"node:fs";process.stdout.write(readFileSync(${JSON.stringify(sharedSourceFile)},"utf8"));`,
    ]).trim();
    assert.ok(expectedContent.includes("mobile browser follow-up"), "The shared test file must contain its mobile edit.");
    compose([
      "exec", "-T", "-u", "1000:1000", "clouddev-ide", "node", "--input-type=module", "-e",
      `import{writeFileSync}from"node:fs";writeFileSync(${JSON.stringify(`${clonePath}/${relativeFile}`)},${JSON.stringify(expectedContent+"\n")},{flag:"wx",mode:0o600});`,
    ]);
  } else {
    compose([
      "exec", "-T", "-u", "1000:1000", "clouddev-ide", "node", "--input-type=module", "-e",
      `import{writeFileSync}from"node:fs";writeFileSync(${JSON.stringify(`${clonePath}/${relativeFile}`)},${JSON.stringify(fixtureContent)},{flag:"wx"});`,
    ]);
  }
  workspaceGit(["-C", clonePath, "add", relativeFile]);
  workspaceGit(["-C", clonePath, "-c", "user.name=CloudDev Roundtrip Test", "-c", `user.email=${email}`, "commit", "-m", "Verify private repository push"]);
  workspaceGit(["-C", clonePath, "push", "-u", "origin", "HEAD"]);
  workspaceGit(["-C", clonePath, "fetch", "origin"]);
  const pushedValue = workspaceGit(["-C", clonePath, "show", `origin/${branch}:${relativeFile}`]);
  assert.equal(pushedValue, expectedContent, "Forgejo must return the committed file after push and fetch.");

  const privateRepository = await forgejoApi(`/repos/${username}/${repoName}`);
  assert.equal(privateRepository.private, true);
  assert.equal(privateRepository.default_branch, branch);

  compose(["restart", "clouddev-git"]);
  compose(["up", "-d", "--wait", "--wait-timeout", "180", "clouddev-git"]);
  const persistedRepository = await forgejoApi(`/repos/${username}/${repoName}`);
  assert.equal(persistedRepository.private, true);
  workspaceGit(["-C", clonePath, "fetch", "origin"]);
  const persistedValue = workspaceGit(["-C", clonePath, "show", `origin/${branch}:${relativeFile}`]);
  assert.equal(persistedValue, expectedContent, "The private repository and pushed file must survive Forgejo restart.");

  process.stdout.write(`Forgejo round-trip passed: regular non-admin user, private repository, authenticated clone/edit/commit/push/fetch, and repository persistence after Forgejo restart${sharedSourceFile ? "; mobile-edited shared workspace file committed" : ""}. Temporary user and workspace files are removed.\n`);
}

main().then(async () => { await cleanup(); }, async error => {
  await cleanup();
  process.stderr.write(`Forgejo round-trip failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
  process.exitCode = 1;
});
