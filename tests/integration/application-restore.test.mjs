import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { after, before, describe, test } from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const composeFixture = path.join(root, "tests/fixtures/application-restore/compose.yml");
const sessionBoundaryPath = path.join(root, "tests/fixtures/application-restore/session-boundary.txt");
const backupScript = path.join(root, "scripts/backup-encrypted.sh");
const imageRefs = {
  postgres: "postgres:18.6-alpine3.24@sha256:898c60cb390d1085bc97bdd6a1ae968757421df394b071848b52b1c09c89d6a5",
  forgejo: "clouddev-ai-sovereign-workspace-local-clouddev-git:latest",
  router: "clouddev-ai-sovereign-workspace-local-clouddev-router:latest",
  ide: "clouddev-ai-sovereign-workspace-local-clouddev-ide:latest",
};
const artifactNames = [
  "forgejo-volume.tar.gz.age",
  "omniroute.tar.gz.age",
  "postgres-globals.sql.age",
  "postgres.dump.age",
  "workspace.tar.gz.age",
];
const markerSuffix = randomUUID().replaceAll("-", "").slice(0, 12);
const projectPrefix = `clouddev-app-restore-${process.pid}-${markerSuffix}`;
const sourceProject = `${projectPrefix}-source`;
const restoreProject = `${projectPrefix}-restore`;
const context = {};

function invoke(program, args, { cwd = root, env = process.env, input, raw = false, maxBuffer = 128 * 1024 * 1024 } = {}) {
  return spawnSync(program, args, { cwd, env, input, encoding: raw || input instanceof Buffer ? undefined : "utf8", maxBuffer });
}

function requireSuccess(result, label) {
  if (result.error || result.status !== 0) {
    const status = Number.isInteger(result.status) ? `exit ${result.status}` : "could not start";
    let diagnostic = `${result.stderr ?? ""}${result.stdout ?? ""}`;
    for (const name of [
      "postgresSourcePassword", "postgresRestorePassword", "forgejoDatabasePassword", "forgejoAdminPassword",
      "forgejoPassword", "omniPassword", "jwtSecret", "apiKeySecret", "omniEncryptionKey",
      "machineIdSalt", "omniWsSecret", "gatewayApiKey", "providerCredential", "ageRecipient",
    ]) {
      const secret = context[name];
      if (typeof secret === "string" && secret) diagnostic = diagnostic.replaceAll(secret, "[redacted]");
    }
    diagnostic = diagnostic.trim().slice(-3000);
    throw new Error(`${label} failed (${status})${diagnostic ? `: ${diagnostic}` : "."}`);
  }
  return result.stdout ?? Buffer.alloc(0);
}

function docker(args, options = {}) {
  return invoke("docker", args, options);
}

function randomSecret(bytes = 32) {
  return randomBytes(bytes).toString("hex");
}

function imageId(reference) {
  const result = docker(["image", "inspect", reference, "--format", "{{.Id}}"]);
  requireSuccess(result, "Local application image check");
  const id = result.stdout.trim();
  if (!/^sha256:[a-f0-9]{64}$/.test(id)) throw new Error("A required local image did not resolve to an immutable image ID.");
  return id;
}

function containerSnapshot() {
  const listed = requireSuccess(docker(["ps", "--all", "--quiet", "--no-trunc"]), "Pre-existing container inventory");
  const ids = listed.trim().split(/\s+/).filter(Boolean);
  if (ids.length === 0) return [];
  const inspected = requireSuccess(docker([
    "inspect", "--format", "{{.Id}}|{{.Name}}|{{.State.Status}}|{{.State.StartedAt}}|{{.RestartCount}}", ...ids,
  ]), "Pre-existing container state read");
  return inspected.trim().split(/\r?\n/).filter(Boolean).sort();
}

function composeArgs(project, envPath, args) {
  return ["compose", "--project-name", project, "--env-file", envPath, "--file", composeFixture, ...args];
}

function compose(project, envPath, args, options = {}) {
  return requireSuccess(docker(composeArgs(project, envPath, args), options), `Isolated Compose operation for ${project}`);
}

function composeEnvironment(project, values) {
  const envPath = path.join(context.tempDirectory, `${project}.env`);
  const content = Object.entries(values)
    .map(([name, value]) => `${name}=${String(value).replaceAll("\\", "\\\\").replaceAll("\n", "")}`)
    .join("\n") + "\n";
  writeFileSync(envPath, content, { mode: 0o600, flag: "wx" });
  chmodSync(envPath, 0o600);
  return envPath;
}

function sourceVariables(images) {
  return {
    ...images,
    POSTGRES_DB: "forgejo",
    POSTGRES_USER: "clouddev_source_admin",
    POSTGRES_PASSWORD: context.postgresSourcePassword,
    FORGEJO_POSTGRES_ADMIN_USER: "clouddev_source_admin",
    FORGEJO_POSTGRES_ADMIN_PASSWORD: context.postgresSourcePassword,
    FORGEJO_POSTGRES_ROLE: "clouddev_forgejo",
    FORGEJO_POSTGRES_DATABASE: "forgejo",
    FORGEJO_POSTGRES_PASSWORD: context.forgejoDatabasePassword,
    FORGEJO_ADMIN_USERNAME: "clouddev_restore_admin",
    FORGEJO_ADMIN_EMAIL: "restore-admin@localhost.invalid",
    FORGEJO_ADMIN_PASSWORD: context.forgejoAdminPassword,
    TEST_FORGEJO_USERNAME: context.forgejoUsername,
    TEST_FORGEJO_PASSWORD: context.forgejoPassword,
    TEST_FORGEJO_EMAIL: context.forgejoEmail,
    TEST_FORGEJO_REPO: context.forgejoRepo,
    INITIAL_PASSWORD: context.omniPassword,
    JWT_SECRET: context.jwtSecret,
    API_KEY_SECRET: context.apiKeySecret,
    STORAGE_ENCRYPTION_KEY: context.omniEncryptionKey,
    MACHINE_ID_SALT: context.machineIdSalt,
    OMNIROUTE_WS_BRIDGE_SECRET: context.omniWsSecret,
    TEST_OMNIROUTE_PROVIDER_NAME: context.providerName,
    TEST_PROVIDER_API_KEY: context.providerCredential,
    TEST_GATEWAY_API_KEY: context.gatewayApiKey,
  };
}

function restoreVariables(images) {
  return {
    ...sourceVariables(images),
    POSTGRES_USER: "clouddev_restore_operator",
    POSTGRES_PASSWORD: context.postgresRestorePassword,
    FORGEJO_POSTGRES_ADMIN_USER: "clouddev_restore_operator",
    FORGEJO_POSTGRES_ADMIN_PASSWORD: context.postgresRestorePassword,
  };
}

function runInClient(project, envPath, script, { user = "1000:1000", env = {} } = {}) {
  return requireSuccess(docker(composeArgs(project, envPath, [
    "exec", "--no-tty", "--user", user,
    ...Object.entries(env).flatMap(([key]) => ["--env", key]),
    "clouddev-ide", "node", "--input-type=module",
  ]), { input: script, env: { ...process.env, ...env } }), "Application verification client");
}

function runClientCommand(project, envPath, args, { user = "1000:1000" } = {}) {
  return requireSuccess(docker(composeArgs(project, envPath, ["exec", "--no-tty", "--user", user, "clouddev-ide", ...args])), "Workspace fixture operation");
}

function forgejoApiScript({ create }) {
  return `
const base = "http://clouddev-git:3000/api/v1";
const basic = (user, pass) => "Basic " + Buffer.from(user + ":" + pass).toString("base64");
async function request(route, { user, pass, method = "GET", body } = {}) {
  const response = await fetch(base + route, {
    method,
    headers: {
      accept: "application/json",
      ...(user ? { authorization: basic(user, pass) } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { /* Do not include server text in errors. */ }
  if (!response.ok) throw new Error("Forgejo API request failed with HTTP " + response.status + ".");
  return payload;
}
${create ? `
const regularUser = await request("/user", {
  user: process.env.TEST_FORGEJO_USERNAME,
  pass: process.env.TEST_FORGEJO_PASSWORD,
});
if (regularUser.login !== process.env.TEST_FORGEJO_USERNAME || regularUser.is_admin !== false) {
  throw new Error("Forgejo source identity is not a regular non-admin user.");
}
const repo = await request("/user/repos", {
  user: process.env.TEST_FORGEJO_USERNAME,
  pass: process.env.TEST_FORGEJO_PASSWORD,
  method: "POST",
  body: { name: process.env.TEST_FORGEJO_REPO, description: "Synthetic isolated restore acceptance", private: true, auto_init: true },
});
if (repo.private !== true || !/^[A-Za-z0-9._/-]{1,128}$/.test(repo.default_branch ?? "")) throw new Error("Forgejo did not create the expected private repository.");
const anonymous = await fetch(base + "/repos/" + process.env.TEST_FORGEJO_USERNAME + "/" + process.env.TEST_FORGEJO_REPO, {
  headers: { accept: "application/json" }, redirect: "manual", signal: AbortSignal.timeout(15000),
});
if (![401, 403, 404].includes(anonymous.status)) throw new Error("Anonymous access exposed the private repository.");
process.stdout.write(JSON.stringify({ private: repo.private, defaultBranch: repo.default_branch, anonymousStatus: anonymous.status }));
` : `
const repo = await request("/repos/" + process.env.TEST_FORGEJO_USERNAME + "/" + process.env.TEST_FORGEJO_REPO, {
  user: process.env.TEST_FORGEJO_USERNAME,
  pass: process.env.TEST_FORGEJO_PASSWORD,
});
if (repo.private !== true || !/^[A-Za-z0-9._/-]{1,128}$/.test(repo.default_branch ?? "")) throw new Error("Restored Forgejo repository metadata did not match.");
const content = await request("/repos/" + process.env.TEST_FORGEJO_USERNAME + "/" + process.env.TEST_FORGEJO_REPO + "/contents/restore-acceptance.txt", {
  user: process.env.TEST_FORGEJO_USERNAME,
  pass: process.env.TEST_FORGEJO_PASSWORD,
});
if (content.type !== "file" || content.encoding !== "base64") throw new Error("Restored Forgejo API file is missing.");
const apiValue = Buffer.from(content.content.replaceAll("\\n", ""), "base64").toString("utf8");
if (apiValue !== ${JSON.stringify(context.forgejoFileContent)}) throw new Error("Restored Forgejo API returned different file content.");
process.stdout.write(JSON.stringify({ private: repo.private, defaultBranch: repo.default_branch, file: content.path }));
`}
`;
}

const omniRouteScript = `
const base = "http://clouddev-router:20128/omniroute";
const password = process.env.TEST_OMNIROUTE_PASSWORD;
const providerName = process.env.TEST_OMNIROUTE_PROVIDER_NAME;
const login = await fetch(base + "/api/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json", accept: "application/json" },
  body: JSON.stringify({ password }),
  redirect: "error",
  signal: AbortSignal.timeout(20000),
});
if (!login.ok) throw new Error("OmniRoute dashboard login failed with HTTP " + login.status + ".");
const setCookies = login.headers.getSetCookie?.() ?? [login.headers.get("set-cookie") ?? ""];
const cookie = setCookies.map(value => value.match(/(?:^|;\\s*)(auth_token=[^;]+)/)?.[1]).find(Boolean);
if (!cookie) throw new Error("OmniRoute login did not issue its dashboard session cookie.");
async function request(route, options = {}) {
  const response = await fetch(base + route, {
    ...options,
    headers: { accept: "application/json", cookie, ...(options.body ? { "content-type": "application/json" } : {}), ...(options.headers ?? {}) },
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { /* Avoid printing response data. */ }
  if (!response.ok) {
    const detail = JSON.stringify(payload?.error ?? payload?.message ?? payload ?? null);
    throw new Error("OmniRoute API request failed with HTTP " + response.status + (detail && detail !== "null" ? ": " + detail.slice(0, 300) : "."));
  }
  return payload;
}
${"__CREATE_PROVIDER__"}
const result = await request("/api/providers");
const connections = Array.isArray(result?.connections) ? result.connections : [];
const restored = connections.find(item => item.name === providerName && item.provider === "ollama-local");
if (!restored) throw new Error("OmniRoute provider listing did not include the expected fixture connection: " + JSON.stringify(connections.map(({ id, provider, name, authType }) => ({ id, provider, name, authType }))));
if ([restored.apiKey, restored.accessToken, restored.refreshToken, restored.idToken].some(value => value === process.env.TEST_PROVIDER_API_KEY)) {
  throw new Error("OmniRoute returned the synthetic provider credential instead of redacting it.");
}
const status = await request("/api/auth/status");
if (status.authenticated !== true) throw new Error("OmniRoute session status was not authenticated.");
process.stdout.write(JSON.stringify({ authenticated: true, provider: restored.provider, name: restored.name, credentialsRedacted: true }));
`;

function providerCreateScript() {
  return omniRouteScript.replace("__CREATE_PROVIDER__", `
const created = await request("/api/providers", {
  method: "POST",
  headers: { "x-skip-model-sync": "true" },
  body: JSON.stringify({
    provider: "ollama",
    name: providerName,
    apiKey: process.env.TEST_PROVIDER_API_KEY,
    providerSpecificData: { baseUrl: "http://127.0.0.1:11434" },
    priority: 1,
  }),
});
if (created?.connection?.name !== providerName) throw new Error("OmniRoute did not create the synthetic local provider metadata.");
`);
}

function providerReadScript() {
  return omniRouteScript.replace("__CREATE_PROVIDER__", "");
}

function workspaceSeedScript() {
  return `
import { chownSync, mkdirSync, chmodSync, statSync } from "node:fs";
import { saveGatewayConfig } from "/opt/clouddev-ide/src/ai-cli.mjs";
import { ensureCodexGatewayConfig } from "/opt/clouddev-ide/src/codex-config.mjs";
const home = "/workspace/home";
mkdirSync(home, { recursive: true, mode: 0o700 });
chownSync("/workspace", 1000, 1000);
chownSync(home, 1000, 1000);
process.setuid(1000);
saveGatewayConfig(home, {
  baseUrl: "http://127.0.0.1:20129",
  apiKey: process.env.TEST_GATEWAY_API_KEY,
  models: { codex: "restore-test/codex-model", claude: "restore-test/claude-model" },
});
ensureCodexGatewayConfig({ codexHome: "/workspace/home/.codex", baseUrl: "http://127.0.0.1:20129" });
process.stdout.write("workspace-config-seeded");
`;
}

function workspaceCheckScript() {
  return `
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { loadGatewayConfig } from "/opt/clouddev-ide/src/ai-cli.mjs";
const config = loadGatewayConfig("/workspace/home");
assert.equal(config.baseUrl, "http://127.0.0.1:20129");
assert.equal(config.apiKey, process.env.TEST_GATEWAY_API_KEY);
assert.equal(config.models.codex, "restore-test/codex-model");
assert.equal(config.models.claude, "restore-test/claude-model");
const configFile = statSync("/workspace/home/.config/clouddev-ai/gateway.json");
assert.equal(configFile.mode & 0o777, 0o600);
assert.equal(configFile.uid, 1000);
const codexPath = "/workspace/home/.codex/config.toml";
const codex = readFileSync(codexPath, "utf8");
assert.match(codex, /^model_provider = "omniroute"/m);
assert.ok(codex.includes('base_url = "http://127.0.0.1:20129/v1"'));
assert.match(codex, /env_key = "OMNIROUTE_API_KEY"/);
assert.equal(statSync(codexPath).mode & 0o777, 0o600);
assert.equal(statSync(codexPath).uid, 1000);
process.stdout.write("workspace-configuration-restored");
`;
}

function parseJsonOutput(value, label) {
  try { return JSON.parse(String(value)); }
  catch { throw new Error(`${label} returned invalid verification data.`); }
}

function ageDecrypt(filename) {
  const result = invoke("age", ["--decrypt", "--identity", context.identityPath, path.join(context.backupDirectory, filename)], { cwd: context.tempDirectory, raw: true });
  return requireSuccess(result, `Encrypted artifact verification for ${filename}`);
}

function restoreArchive(project, envPath, filename, service, targetPath) {
  const archive = ageDecrypt(filename);
  compose(project, envPath, [
    "run", "--rm", "--no-deps", "--pull", "never", "--user", "0:0",
    "--entrypoint", "tar", service, "-C", targetPath, "-xzf", "-",
  ], { input: archive });
}

function assertSafeProjectName(project) {
  if (!project.startsWith(`${projectPrefix}-`) || !/^[a-z0-9][a-z0-9_-]+$/.test(project)) {
    throw new Error("Refusing cleanup for a project outside this run's generated name scope.");
  }
}

function cleanupProject(project, envPath) {
  assertSafeProjectName(project);
  if (!envPath || !existsSync(envPath)) return;
  const containerIds = docker(["ps", "--all", "--quiet", "--filter", `label=com.docker.compose.project=${project}`]);
  const volumeList = docker(["volume", "ls", "--quiet", "--filter", `label=com.docker.compose.project=${project}`]);
  if (containerIds.status !== 0 || volumeList.status !== 0) throw new Error(`Could not verify cleanup scope for generated project ${project}.`);
  for (const volume of volumeList.stdout.trim().split(/\r?\n/).filter(Boolean)) {
    if (!volume.startsWith(`${project}_`)) throw new Error(`Refusing to remove a volume outside generated project ${project}.`);
  }
  const result = docker(composeArgs(project, envPath, ["down", "--volumes", "--remove-orphans"]), { cwd: context.tempDirectory });
  requireSuccess(result, `Cleanup for generated project ${project}`);
  const remainingContainers = docker(["ps", "--all", "--quiet", "--filter", `label=com.docker.compose.project=${project}`]);
  const remainingVolumes = docker(["volume", "ls", "--quiet", "--filter", `label=com.docker.compose.project=${project}`]);
  const remainingNetworks = docker(["network", "ls", "--quiet", "--filter", `label=com.docker.compose.project=${project}`]);
  if (remainingContainers.status !== 0 || remainingVolumes.status !== 0 || remainingNetworks.status !== 0
    || remainingContainers.stdout.trim() || remainingVolumes.stdout.trim() || remainingNetworks.stdout.trim()) {
    throw new Error(`Generated project ${project} left labeled containers, volumes, or networks after cleanup.`);
  }
}

function verifyComposeSafety(project, envPath, expectedImages) {
  const config = parseJsonOutput(compose(project, envPath, ["config", "--format", "json"]), "Compose fixture");
  if (JSON.stringify(config).includes("/var/run/docker.sock")) throw new Error("The restore fixture must not mount the Docker socket.");
  if (config.networks?.default?.internal !== true) throw new Error("The restore fixture network must be internal.");
  for (const [serviceName, expectedImage] of Object.entries(expectedImages)) {
    const service = config.services?.[serviceName];
    if (!service || service.image !== expectedImage) throw new Error(`Compose image mismatch for ${serviceName}: ${service?.image ?? "missing"} != ${expectedImage}.`);
    if (Object.hasOwn(service, "build") || Object.hasOwn(service, "ports") || service.privileged === true || service.pull_policy !== "never") {
      throw new Error(`Compose fixture exposes an unsafe or mutable option on ${serviceName}.`);
    }
    for (const mount of service.volumes ?? []) {
      const volumeDefinition = config.volumes?.[mount.source];
      if (mount.type !== "volume" || !volumeDefinition || !volumeDefinition.name?.startsWith(`${project}_`)) {
        throw new Error(`Compose fixture uses a non-project volume on ${serviceName}.`);
      }
    }
  }
  for (const volume of Object.values(config.volumes ?? {})) {
    if (volume.external === true || !volume.name?.startsWith(`${project}_`)) {
      throw new Error("Compose fixture references a volume outside its isolated project.");
    }
  }
}

function setupRestore() {
  const requiredPrograms = ["docker", "age", "age-keygen"];
  for (const program of requiredPrograms) {
    if (invoke("sh", ["-c", `command -v ${program}`]).status !== 0) throw new Error(`Required local tool is unavailable: ${program}.`);
  }
  requireSuccess(docker(["info", "--format", "{{.ServerVersion}}"]), "Docker Engine check");

  context.images = Object.fromEntries(Object.entries(imageRefs).map(([name, reference]) => [name, imageId(reference)]));
  context.imageValues = {
    CLOUDDEV_POSTGRES_IMAGE: context.images.postgres,
    CLOUDDEV_FORGEJO_IMAGE: context.images.forgejo,
    CLOUDDEV_ROUTER_IMAGE: context.images.router,
    CLOUDDEV_IDE_IMAGE: context.images.ide,
  };
  context.tempDirectory = mkdtempSync(path.join(os.tmpdir(), "clouddev-application-restore-"));
  chmodSync(context.tempDirectory, 0o700);
  context.backupDirectory = path.join(context.tempDirectory, "encrypted-backup");
  context.identityPath = path.join(context.tempDirectory, "age-identity.txt");
  context.preExistingContainers = containerSnapshot();

  context.postgresSourcePassword = randomSecret();
  context.postgresRestorePassword = randomSecret();
  context.forgejoDatabasePassword = randomSecret();
  context.forgejoAdminPassword = randomSecret();
  context.forgejoUsername = `restore_user_${markerSuffix}`;
  context.forgejoPassword = randomSecret();
  context.forgejoEmail = `${context.forgejoUsername}@localhost.invalid`;
  context.forgejoRepo = `private-restore-${markerSuffix}`;
  context.forgejoFileContent = `synthetic-forgejo-restore-${markerSuffix}\n`;
  context.omniPassword = `TestOnly-${randomSecret(24)}`;
  context.jwtSecret = randomSecret();
  context.apiKeySecret = randomSecret();
  context.omniEncryptionKey = randomSecret();
  context.machineIdSalt = randomSecret();
  context.omniWsSecret = randomSecret();
  context.providerName = `restore-local-provider-${markerSuffix}`;
  context.providerCredential = `synthetic-not-a-provider-master-key-${randomSecret(12)}`;
  context.gatewayApiKey = `restore-test-scoped-key-${randomSecret(24)}`;
  requireSuccess(invoke("age-keygen", ["-o", context.identityPath], { cwd: context.tempDirectory }), "Temporary age key generation");
  chmodSync(context.identityPath, 0o600);
  const recipient = requireSuccess(invoke("age-keygen", ["-y", context.identityPath], { cwd: context.tempDirectory }), "Temporary age recipient derivation").trim();
  if (!/^age1[a-z0-9]+$/.test(recipient)) throw new Error("Temporary age recipient was invalid.");
  context.ageRecipient = recipient;

  context.sourceEnv = composeEnvironment(sourceProject, sourceVariables(context.imageValues));
  context.restoreEnv = composeEnvironment(restoreProject, restoreVariables(context.imageValues));
  const sourceComposeEnv = { ...process.env, ...sourceVariables(context.imageValues) };

  const expectedServiceImages = {
    "clouddev-postgres": context.images.postgres,
    "clouddev-git": context.images.forgejo,
    "clouddev-router": context.images.router,
    "clouddev-ide": context.images.ide,
  };
  verifyComposeSafety(sourceProject, context.sourceEnv, expectedServiceImages);
  verifyComposeSafety(restoreProject, context.restoreEnv, expectedServiceImages);
  const sourceStartup = docker(composeArgs(sourceProject, context.sourceEnv, ["up", "--detach", "--wait", "--wait-timeout", "240", "--no-build", "--pull", "never"]), { env: sourceComposeEnv });
  if (sourceStartup.status !== 0) {
    const serviceLogs = docker(composeArgs(sourceProject, context.sourceEnv, ["logs", "--no-color", "--tail", "100", "clouddev-git"]), { cwd: context.tempDirectory });
    if (serviceLogs.status === 0) sourceStartup.stderr = `${sourceStartup.stderr ?? ""}\nForgejo fixture logs:\n${serviceLogs.stdout}`;
  }
  requireSuccess(sourceStartup, "Isolated source application startup");
  context.sourceCreated = true;

  compose(sourceProject, context.sourceEnv, ["exec", "--no-tty", "--user", "0:0", "clouddev-ide", "chown", "-R", "1000:1000", "/workspace"]);
  runInClient(sourceProject, context.sourceEnv, workspaceSeedScript(), { user: "0:0", env: { TEST_GATEWAY_API_KEY: context.gatewayApiKey } });

  requireSuccess(docker(composeArgs(sourceProject, context.sourceEnv, [
    "exec", "--no-tty", "clouddev-git", "forgejo", "--config", "/var/lib/gitea/custom/conf/app.ini",
    "admin", "user", "create", "--username", context.forgejoUsername, "--password", context.forgejoPassword,
    "--email", context.forgejoEmail, "--must-change-password=false",
  ])), "Synthetic non-admin Forgejo account creation");

  const forgejoSetup = parseJsonOutput(runInClient(sourceProject, context.sourceEnv, forgejoApiScript({ create: true })).toString(), "Forgejo source setup");
  if (forgejoSetup.private !== true || !forgejoSetup.defaultBranch || ![401, 403, 404].includes(forgejoSetup.anonymousStatus)) {
    throw new Error("Forgejo source fixture did not establish a private repository for a regular user.");
  }
  context.forgejoBranch = forgejoSetup.defaultBranch;

  runInClient(sourceProject, context.sourceEnv, providerCreateScript());
  runClientCommand(sourceProject, context.sourceEnv, ["mkdir", "-m", "700", "-p", `/workspace/projects/${context.forgejoRepo}`]);
  const sourceBasic = Buffer.from(`${context.forgejoUsername}:${context.forgejoPassword}`).toString("base64");
  const sourceRemote = `http://clouddev-git:3000/${context.forgejoUsername}/${context.forgejoRepo}.git`;
  const sourceClonePath = `/workspace/projects/${context.forgejoRepo}/clone`;
  runClientCommand(sourceProject, context.sourceEnv, ["git", "-c", `http.extraHeader=Authorization: Basic ${sourceBasic}`, "clone", "--quiet", sourceRemote, sourceClonePath]);
  runClientCommand(sourceProject, context.sourceEnv, [
    "node", "--input-type=module", "-e",
    `import{writeFileSync}from"node:fs";writeFileSync(${JSON.stringify(`${sourceClonePath}/restore-acceptance.txt`)},${JSON.stringify(context.forgejoFileContent)},{flag:"wx"});`,
  ], { user: "1000:1000" });
  runClientCommand(sourceProject, context.sourceEnv, [
    "git", "-C", sourceClonePath, "-c", `http.extraHeader=Authorization: Basic ${sourceBasic}`, "add", "restore-acceptance.txt",
  ]);
  runClientCommand(sourceProject, context.sourceEnv, [
    "git", "-C", sourceClonePath, "-c", "user.name=CloudDev Restore Test", "-c", `user.email=${context.forgejoEmail}`,
    "-c", `http.extraHeader=Authorization: Basic ${sourceBasic}`, "commit", "-m", "Add synthetic restore fixture",
  ]);
  runClientCommand(sourceProject, context.sourceEnv, ["git", "-C", sourceClonePath, "-c", `http.extraHeader=Authorization: Basic ${sourceBasic}`, "push", "-u", "origin", `HEAD:${forgejoSetup.defaultBranch}`]);
  const pushed = runClientCommand(sourceProject, context.sourceEnv, ["git", "-C", sourceClonePath, "show", `origin/${forgejoSetup.defaultBranch}:restore-acceptance.txt`]).toString().trim();
  if (pushed !== context.forgejoFileContent.trim()) throw new Error("The source private Forgejo Git push did not preserve its file.");

  const backupEnv = {
    ...sourceComposeEnv,
    COMPOSE_FILE: composeFixture,
    COMPOSE_PROJECT_NAME: sourceProject,
    AGE_RECIPIENT: context.ageRecipient,
  };
  requireSuccess(invoke("bash", [backupScript, "--acknowledge-quiesced", context.backupDirectory], {
    cwd: context.tempDirectory,
    env: backupEnv,
  }), "Encrypted application backup using the required quiescence acknowledgement");

  const filenames = readFileSync(path.join(context.backupDirectory, "SHA256SUMS"), "utf8")
    .trim().split(/\r?\n/).map(line => line.trim().split(/\s+/).at(-1)).sort();
  if (JSON.stringify(filenames) !== JSON.stringify([...artifactNames].sort())) {
    throw new Error("The application backup did not contain the four store archives and PostgreSQL globals artifact.");
  }
  for (const filename of artifactNames) {
    const file = path.join(context.backupDirectory, filename);
    if (!existsSync(file) || statSync(file).size < 32) throw new Error(`Encrypted application backup artifact is missing or empty: ${filename}.`);
  }
  const checksums = readFileSync(path.join(context.backupDirectory, "SHA256SUMS"), "utf8").trim().split(/\r?\n/);
  for (const line of checksums) {
    const [expected, filename] = line.trim().split(/\s+/);
    const actual = createHash("sha256").update(readFileSync(path.join(context.backupDirectory, filename))).digest("hex");
    if (actual !== expected) throw new Error("An encrypted application backup checksum did not match.");
  }
  const manifest = readFileSync(path.join(context.backupDirectory, "manifest.txt"), "utf8");
  if (/(?:AGE-SECRET-KEY|STORAGE_ENCRYPTION_KEY|POSTGRES_PASSWORD|FORGEJO_ADMIN_PASSWORD|restore-acceptance\.txt)/i.test(manifest)) {
    throw new Error("The public backup manifest unexpectedly contains sensitive or private fixture content.");
  }

  const restoreComposeEnv = { ...process.env, ...restoreVariables(context.imageValues) };
  requireSuccess(docker(composeArgs(restoreProject, context.restoreEnv, [
    "up", "--detach", "--wait", "--wait-timeout", "120", "--no-build", "--pull", "never", "clouddev-postgres",
  ]), { env: restoreComposeEnv }), "Isolated restore PostgreSQL startup");
  context.restoreCreated = true;

  const globals = ageDecrypt("postgres-globals.sql.age");
  const restoreGlobals = docker(composeArgs(restoreProject, context.restoreEnv, [
    "exec", "--no-tty", "--env", "PGPASSWORD", "clouddev-postgres",
    "psql", "--username=clouddev_restore_operator", "--dbname=postgres", "--set=ON_ERROR_STOP=1",
  ]), { cwd: context.tempDirectory, env: { ...restoreComposeEnv, PGPASSWORD: context.postgresRestorePassword }, input: globals });
  requireSuccess(restoreGlobals, "Isolated PostgreSQL role restore");

  const createDatabase = docker(composeArgs(restoreProject, context.restoreEnv, [
    "exec", "--no-tty", "--env", "PGPASSWORD", "clouddev-postgres",
    "psql", "--username=clouddev_restore_operator", "--dbname=postgres", "--set=ON_ERROR_STOP=1",
    "--command", "ALTER DATABASE forgejo OWNER TO clouddev_forgejo",
  ]), { cwd: context.tempDirectory, env: { ...restoreComposeEnv, PGPASSWORD: context.postgresRestorePassword } });
  requireSuccess(createDatabase, "Restored Forgejo database ownership setup");

  const databaseDump = ageDecrypt("postgres.dump.age");
  const restoreDatabase = docker(composeArgs(restoreProject, context.restoreEnv, [
    "exec", "--no-tty", "--env", "PGPASSWORD", "clouddev-postgres",
    "pg_restore", "--exit-on-error", "--no-owner", "--no-privileges", "--username=clouddev_forgejo", "--dbname=forgejo",
  ]), { cwd: context.tempDirectory, env: { ...restoreComposeEnv, PGPASSWORD: context.forgejoDatabasePassword }, input: databaseDump });
  requireSuccess(restoreDatabase, "Isolated Forgejo PostgreSQL database restore");

  const roleProbe = docker(composeArgs(restoreProject, context.restoreEnv, [
    "exec", "--no-tty", "--env", "PGPASSWORD", "clouddev-postgres",
    "psql", "--username=clouddev_forgejo", "--dbname=forgejo", "--tuples-only", "--no-align", "--set=ON_ERROR_STOP=1",
    "--command", "SELECT current_user || ':' || current_database()",
  ]), { cwd: context.tempDirectory, env: { ...restoreComposeEnv, PGPASSWORD: context.forgejoDatabasePassword } });
  if (requireSuccess(roleProbe, "Restored PostgreSQL application role login").toString().trim() !== "clouddev_forgejo:forgejo") {
    throw new Error("The restored PostgreSQL Forgejo role could not authenticate to its database.");
  }
  const roleDatabaseState = docker(composeArgs(restoreProject, context.restoreEnv, [
    "exec", "--no-tty", "--env", "PGPASSWORD", "clouddev-postgres",
    "psql", "--username=clouddev_restore_operator", "--dbname=postgres", "--tuples-only", "--no-align", "--set=ON_ERROR_STOP=1",
    "--command", "SELECT r.rolcanlogin::text || ':' || r.rolsuper::text || ':' || pg_get_userbyid(d.datdba) FROM pg_roles r CROSS JOIN pg_database d WHERE r.rolname='clouddev_forgejo' AND d.datname='forgejo'",
  ]), { cwd: context.tempDirectory, env: { ...restoreComposeEnv, PGPASSWORD: context.postgresRestorePassword } });
  if (requireSuccess(roleDatabaseState, "Restored PostgreSQL role attributes and database owner").toString().trim() !== "true:false:clouddev_forgejo") {
    throw new Error("The restored PostgreSQL database is not owned by its restored non-superuser Forgejo role.");
  }
  context.postgresRoleVerified = true;

  restoreArchive(restoreProject, context.restoreEnv, "forgejo-volume.tar.gz.age", "clouddev-git", "/var/lib/gitea");
  restoreArchive(restoreProject, context.restoreEnv, "omniroute.tar.gz.age", "clouddev-router", "/app/data");
  restoreArchive(restoreProject, context.restoreEnv, "workspace.tar.gz.age", "clouddev-ide", "/workspace");
  requireSuccess(docker(composeArgs(restoreProject, context.restoreEnv, [
    "up", "--detach", "--wait", "--wait-timeout", "240", "--no-build", "--pull", "never",
  ]), { env: restoreComposeEnv }), "Restored application startup");

  const restoredForgejo = parseJsonOutput(runInClient(restoreProject, context.restoreEnv, forgejoApiScript({ create: false })).toString(), "Restored Forgejo application check");
  if (restoredForgejo.private !== true || restoredForgejo.defaultBranch !== context.forgejoBranch || restoredForgejo.file !== "restore-acceptance.txt") {
    throw new Error("Authenticated Forgejo API checks failed against restored application state.");
  }
  const restoreClone = `/workspace/projects/${context.forgejoRepo}/restored-clone`;
  const restoreBasic = Buffer.from(`${context.forgejoUsername}:${context.forgejoPassword}`).toString("base64");
  const remote = `http://clouddev-git:3000/${context.forgejoUsername}/${context.forgejoRepo}.git`;
  runClientCommand(restoreProject, context.restoreEnv, ["git", "-c", `http.extraHeader=Authorization: Basic ${restoreBasic}`, "clone", "--quiet", remote, restoreClone]);
  const fetched = runClientCommand(restoreProject, context.restoreEnv, ["git", "-C", restoreClone, "show", "HEAD:restore-acceptance.txt"]).toString().trim();
  if (fetched !== context.forgejoFileContent.trim()) throw new Error("Authenticated Git access did not return the restored private repository file.");
  runClientCommand(restoreProject, context.restoreEnv, ["git", "-C", restoreClone, "-c", `http.extraHeader=Authorization: Basic ${restoreBasic}`, "fetch", "origin"]);
  const fetchedAgain = runClientCommand(restoreProject, context.restoreEnv, ["git", "-C", restoreClone, "show", `origin/${restoredForgejo.defaultBranch}:restore-acceptance.txt`]).toString().trim();
  if (fetchedAgain !== context.forgejoFileContent.trim()) throw new Error("Authenticated Git fetch did not preserve the restored private repository file.");

  context.omniRestored = parseJsonOutput(runInClient(restoreProject, context.restoreEnv, providerReadScript()).toString(), "Restored OmniRoute metadata verification");
  if (!context.omniRestored.authenticated || context.omniRestored.provider !== "ollama-local" || context.omniRestored.name !== context.providerName) {
    throw new Error("Restored OmniRoute authentication or provider metadata did not match the fixture.");
  }

  runInClient(restoreProject, context.restoreEnv, workspaceCheckScript(), { env: { TEST_GATEWAY_API_KEY: context.gatewayApiKey } });
  context.workspaceVerified = true;
}

const runApplicationRestore = process.env.CLOUDDEV_RUN_APPLICATION_RESTORE === "1";

describe("isolated local application-level restore acceptance", {
  skip: runApplicationRestore ? false : "Run with npm run test:application-restore to exercise isolated Docker projects",
}, () => {
  before(() => {
    setupRestore();
  }, { timeout: 600_000 });

  after(() => {
    let cleanupError;
    for (const [project, envPath] of [[restoreProject, context.restoreEnv], [sourceProject, context.sourceEnv]]) {
      try { cleanupProject(project, envPath); }
      catch (error) { cleanupError ??= error; }
    }
    if (context.tempDirectory && existsSync(context.tempDirectory)) rmSync(context.tempDirectory, { recursive: true, force: true });
    if (cleanupError) throw cleanupError;
    if (context.preExistingContainers) {
      const afterCleanup = containerSnapshot();
      assert.deepEqual(afterCleanup, context.preExistingContainers, "generated Compose cleanup must leave pre-existing containers unchanged");
    }
  }, { timeout: 60_000 });

  test("uses exact prebuilt images and an isolated Compose network and project-owned volumes", () => {
    for (const project of [sourceProject, restoreProject]) assertSafeProjectName(project);
    assert.equal(context.sourceCreated, true);
    assert.equal(context.restoreCreated, true);
    assert.deepEqual(context.images, Object.fromEntries(Object.entries(imageRefs).map(([name, ref]) => [name, imageId(ref)])));
  });

  test("backs up and restores PostgreSQL globals and the Forgejo application database", () => {
    const globals = ageDecrypt("postgres-globals.sql.age").toString("utf8");
    assert.match(globals, /CREATE ROLE clouddev_forgejo/);
    assert.match(globals, /CREATE ROLE clouddev_source_admin/);
    assert.doesNotMatch(globals, /FORGEJO_ADMIN_PASSWORD|AGE-SECRET-KEY/);
    assert.equal(context.postgresRoleVerified, true);
    assert.equal(context.forgejoFileContent.trim().startsWith("synthetic-forgejo-restore-"), true);
  });

  test("restores private Forgejo API and authenticated non-admin Git access", () => {
    assert.equal(context.forgejoUsername.startsWith("restore_user_"), true);
    assert.equal(context.forgejoRepo.startsWith("private-restore-"), true);
    assert.equal(context.forgejoEmail.endsWith("@localhost.invalid"), true);
  });

  test("restores authenticated OmniRoute provider metadata and workspace configuration without claiming CloudCLI session resume", () => {
    assert.equal(context.omniRestored.authenticated, true);
    assert.equal(context.omniRestored.credentialsRedacted, true);
    assert.equal(context.workspaceVerified, true);
    const boundary = readFileSync(sessionBoundaryPath, "utf8");
    assert.match(boundary, /CloudCLI native session recovery is not verified/);
    assert.match(boundary, /creates no CloudCLI account, provider transcript, or provider session/);
    assert.match(boundary, /no paid provider request/);
  });
});
