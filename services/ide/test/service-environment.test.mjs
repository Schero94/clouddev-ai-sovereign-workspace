import assert from "node:assert/strict";
import { test } from "node:test";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildServiceEnvironment } from "../src/service-environment.mjs";

const ideRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const launchpadRoot = process.env.CLOUDDEV_LAUNCHPAD_PACKAGE_ROOT
  ? path.resolve(process.env.CLOUDDEV_LAUNCHPAD_PACKAGE_ROOT)
  : path.resolve(ideRoot, "../../services/launchpad");
const { configFromEnvironment, validateConfig } = await import(pathToFileURL(path.join(launchpadRoot, "src/server.mjs")).href);

const secrets = {
  RAILWAY_TOKEN: "railway-admin-secret",
  FORGEJO_ADMIN_TOKEN: "forgejo-admin-secret",
  OMNIROUTE_MASTER_KEY: "router-master-secret",
  OMNIROUTE_ADMIN_TOKEN: "router-admin-secret",
  CODE_SERVER_PASSWORD: "browser-password-secret-0123456789abcdef",
  CLOUDDEV_WORKSPACE_PASSWORD: "isolated-launchpad-password-secret-0123456789abcdef",
  CLOUDDEV_WORKSPACE_AUTH_SECRET: "workspace-auth-secret-0123456789abcdef0123456789abcdef",
  SSH_AUTHORIZED_KEYS: "ssh-ed25519 public-key-material",
  IDE_SSH_HOST_FINGERPRINT: "SHA256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  LAUNCHPAD_ADMIN_TOKEN: "must-not-inherit",
  PATH: "/usr/local/bin:/usr/bin:/bin",
};

test("does not pass deployment or platform secrets to Caddy, code-server, launchpad, or sshd", () => {
  for (const profile of ["caddy", "code-server", "launchpad", "sshd"]) {
    const env = buildServiceEnvironment(profile, {
      source: secrets,
      home: "/workspace/home",
      projectsDirectory: "/workspace/projects",
      caddyHome: "/workspace/system/caddy",
      launchpadHome: "/workspace/system/launchpad",
    });
    for (const [name, value] of Object.entries(secrets)) {
      if (name === "IDE_SSH_HOST_FINGERPRINT") {
        assert.equal(env[name], profile === "launchpad" ? value : undefined, `${profile} fingerprint exposure must be explicit`);
        continue;
      }
      if (name === "CODE_SERVER_PASSWORD") {
        assert.equal(env[name], undefined, `${profile} must not inherit the source variable name`);
        assert.equal(Object.values(env).includes(value), false, `${profile} must not receive the browser password`);
        continue;
      }
      if (name === "CLOUDDEV_WORKSPACE_PASSWORD") {
        assert.equal(env[name], profile === "launchpad" ? value : undefined,
          `${profile} workspace login password exposure must be explicit`);
        continue;
      }
      if (name === "CLOUDDEV_WORKSPACE_AUTH_SECRET") {
        assert.equal(env[name], profile === "launchpad" ? value : undefined,
          `${profile} workspace session secret exposure must be explicit`);
        continue;
      }
      if (name !== "PATH") assert.equal(env[name], undefined, `${profile} must not receive ${name}`);
      if (name !== "PATH") assert.equal(Object.values(env).includes(value), false, `${profile} must not receive a secret value`);
    }
  }
});

test("gives CloudCLI only the restricted inference key and required persistent runtime paths", () => {
  const env = buildServiceEnvironment("cloudcli", {
    source: secrets,
    home: "/workspace/home",
    projectsDirectory: "/workspace/projects",
    gatewayConfig: {
      baseUrl: "http://127.0.0.1:20129",
      apiKey: "restricted-inference-key",
    },
  });
  assert.equal(env.HOME, "/workspace/home");
  assert.equal(env.CODEX_HOME, "/workspace/home/.codex");
  assert.equal(env.CLAUDE_CONFIG_DIR, "/workspace/home/.claude");
  assert.equal(env.WORKSPACES_ROOT, "/workspace/projects");
  assert.equal(env.SERVER_PORT, "3001");
  assert.equal(env.CLAUDE_CLI_PATH, "/opt/clouddev-ide/agent-tools/node_modules/@anthropic-ai/claude-code/bin/claude.exe");
  assert.equal(env.CLOUDDEV_TASK_SUMMARY_PATH, "/workspace/public-status/recovery.json");
  assert.equal(env.HOST, "127.0.0.1");
  assert.equal(env.OMNIROUTE_API_KEY, "restricted-inference-key");
  assert.equal(env.ANTHROPIC_AUTH_TOKEN, "restricted-inference-key");
  assert.equal(env.RAILWAY_TOKEN, undefined);
  assert.equal(env.FORGEJO_ADMIN_TOKEN, undefined);
  assert.equal(env.OMNIROUTE_MASTER_KEY, undefined);
  assert.equal(env.OMNIROUTE_ADMIN_TOKEN, undefined);
  assert.equal(env.CODE_SERVER_PASSWORD, undefined);
  assert.equal(env.IDE_SSH_HOST_FINGERPRINT, undefined);
  assert.equal(env.CLOUDDEV_WORKSPACE_PASSWORD, undefined);
  assert.equal(env.CLOUDDEV_WORKSPACE_AUTH_SECRET, undefined);
});

test("gives launchpad only its public aggregate path and host public fingerprint", () => {
  const env = buildServiceEnvironment("launchpad", {
    source: secrets,
    launchpadHome: "/workspace/system/launchpad",
  });
  assert.equal(env.LAUNCHPAD_RECOVERY_SUMMARY, "/workspace/public-status/recovery.json");
  assert.equal(env.IDE_SSH_HOST_FINGERPRINT, secrets.IDE_SSH_HOST_FINGERPRINT);
  assert.equal(env.CLOUDDEV_WORKSPACE_PASSWORD, secrets.CLOUDDEV_WORKSPACE_PASSWORD);
  assert.equal(env.CLOUDDEV_WORKSPACE_AUTH_SECRET, secrets.CLOUDDEV_WORKSPACE_AUTH_SECRET);
  assert.equal(env.CLOUDDEV_TASK_REGISTRY_PATH, undefined);
  assert.equal(env.CLOUDDEV_TASK_SUMMARY_PATH, undefined);
  for (const secretName of ["RAILWAY_TOKEN", "FORGEJO_ADMIN_TOKEN", "OMNIROUTE_MASTER_KEY", "OMNIROUTE_ADMIN_TOKEN", "CODE_SERVER_PASSWORD", "SSH_AUTHORIZED_KEYS", "LAUNCHPAD_ADMIN_TOKEN"]) {
    assert.equal(env[secretName], undefined, `launchpad must not receive ${secretName}`);
  }
  assert.equal(Object.values(env).includes(secrets.CLOUDDEV_WORKSPACE_PASSWORD), true,
    "the isolated launchpad auth service needs the workspace login password");
  assert.equal(Object.values(env).includes(secrets.CLOUDDEV_WORKSPACE_AUTH_SECRET), true,
    "the isolated launchpad auth service needs the cookie signing key");
  assert.equal(Object.values(env).includes("router-master-secret"), false);
});

test("rejects a malformed host-key fingerprint instead of passing it to launchpad", () => {
  assert.throws(() => buildServiceEnvironment("launchpad", {
    source: { ...secrets, IDE_SSH_HOST_FINGERPRINT: "private host key" },
  }), /SHA256 OpenSSH/);
});

test("uses loopback HTTP only for local launchpad and retains HTTPS validation on Railway", () => {
  const localSource = {
    WORKSPACE_PUBLIC_URL: "http://localhost:8080",
    GIT_PUBLIC_URL: "http://localhost:3000",
    ROUTER_PUBLIC_URL: "http://localhost:20128",
  };
  const local = buildServiceEnvironment("launchpad", { source: { ...secrets, ...localSource } });
  assert.equal(local.NODE_ENV, "development");
  assert.doesNotThrow(() => validateConfig(configFromEnvironment({ ...localSource, ...local })));

  const railwaySource = {
    RAILWAY_PUBLIC_DOMAIN: "clouddev-ide.up.railway.app",
    WORKSPACE_PUBLIC_URL: "https://clouddev-ide.up.railway.app",
    GIT_PUBLIC_URL: "https://clouddev-git.up.railway.app",
    ROUTER_PUBLIC_URL: "https://clouddev-router.up.railway.app",
  };
  const railway = buildServiceEnvironment("launchpad", { source: { ...secrets, ...railwaySource } });
  assert.equal(railway.NODE_ENV, "production");
  assert.doesNotThrow(() => validateConfig(configFromEnvironment({ ...railwaySource, ...railway })));
  assert.throws(() => validateConfig(configFromEnvironment({
    ...railwaySource,
    ...railway,
    WORKSPACE_PUBLIC_URL: "http://clouddev-ide.up.railway.app",
  })), /HTTPS/);

  assert.equal(buildServiceEnvironment("launchpad", {
    source: { ...secrets, CLOUDDEV_LAUNCHPAD_NODE_ENV: "production" },
  }).NODE_ENV, "production");
  assert.equal(buildServiceEnvironment("launchpad", {
    source: { ...secrets, CLOUDDEV_LAUNCHPAD_NODE_ENV: "development" },
  }).NODE_ENV, "development");
  assert.throws(() => buildServiceEnvironment("launchpad", {
    source: { ...secrets, CLOUDDEV_LAUNCHPAD_NODE_ENV: "preview" },
  }), /development or production/);
});

test("fails closed for unknown process environment profiles", () => {
  assert.throws(() => buildServiceEnvironment("router", { source: secrets }), /Unknown service environment/);
});
