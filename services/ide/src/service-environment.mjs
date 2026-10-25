const DEFAULT_PATH = "/opt/clouddev-ide/agent-tools/node_modules/.bin:/opt/clouddev-ide/omniroute-cli/node_modules/.bin:/usr/local/bin:/usr/bin:/bin";
const USER = "coder";
const TASK_SUMMARY_PATH = "/workspace/public-status/recovery.json";
const LAUNCHPAD_CONFIG_KEYS = [
  "WORKSPACE_PUBLIC_URL", "RAILWAY_PUBLIC_DOMAIN", "IDE_PUBLIC_URL", "GIT_PUBLIC_URL", "ROUTER_PUBLIC_URL",
  "RAILWAY_TCP_PROXY_DOMAIN", "RAILWAY_TCP_PROXY_PORT", "IDE_SSH_PROXY_HOST", "IDE_SSH_PROXY_PORT",
  "GIT_SSH_PROXY_HOST", "GIT_SSH_PROXY_PORT", "IDE_PRIVATE_HOST", "IDE_PRIVATE_PORT",
  "GIT_PRIVATE_HOST", "GIT_PRIVATE_PORT", "POSTGRES_HOST", "POSTGRES_PORT", "ROUTER_PRIVATE_HOST", "ROUTER_PRIVATE_PORT",
];

function sshFingerprint(source) {
  const fingerprint = source.IDE_SSH_HOST_FINGERPRINT;
  if (fingerprint === undefined || fingerprint === "") return undefined;
  if (typeof fingerprint !== "string" || !/^SHA256:[A-Za-z0-9+/]{43}$/.test(fingerprint)) {
    throw new Error("IDE_SSH_HOST_FINGERPRINT must be a SHA256 OpenSSH public-key fingerprint.");
  }
  return fingerprint;
}

function launchpadNodeEnvironment(source) {
  const override = source.CLOUDDEV_LAUNCHPAD_NODE_ENV;
  if (override !== undefined && override !== "") {
    if (override !== "production" && override !== "development") {
      throw new Error("CLOUDDEV_LAUNCHPAD_NODE_ENV must be development or production.");
    }
    return override;
  }
  return typeof source.RAILWAY_PUBLIC_DOMAIN === "string" && source.RAILWAY_PUBLIC_DOMAIN.length > 0
    ? "production"
    : "development";
}

function copyIfPresent(target, source, key) {
  if (typeof source[key] === "string" && source[key].length > 0) target[key] = source[key];
}

function languageEnvironment(source) {
  const result = {};
  for (const key of ["LANG", "LC_ALL", "LC_CTYPE", "TERM", "TZ"]) copyIfPresent(result, source, key);
  return result;
}

function coderEnvironment({ source, home, projectsDirectory }) {
  const result = {
    PATH: typeof source.PATH === "string" ? source.PATH : DEFAULT_PATH,
    HOME: home,
    USER,
    LOGNAME: USER,
    SHELL: "/bin/bash",
    CODEX_HOME: `${home}/.codex`,
    CLAUDE_CONFIG_DIR: `${home}/.claude`,
    CLOUDDEV_PROJECTS_DIR: projectsDirectory,
    CLOUDDEV_OMNIROUTE_BASE_URL: source.CLOUDDEV_OMNIROUTE_BASE_URL || "http://127.0.0.1:20129",
    TMPDIR: "/tmp",
    ...languageEnvironment(source),
  };
  return result;
}

export function buildServiceEnvironment(profile, {
  source = process.env,
  home = "/workspace/home",
  projectsDirectory = "/workspace/projects",
  caddyHome = "/workspace/system/caddy",
  launchpadHome = "/workspace/system/launchpad",
  gatewayConfig = null,
} = {}) {
  if (profile === "caddy") {
    return {
      PATH: "/usr/bin:/bin",
      HOME: caddyHome,
      XDG_CONFIG_HOME: `${caddyHome}/config`,
      XDG_DATA_HOME: `${caddyHome}/data`,
      TMPDIR: "/tmp",
    };
  }
  if (profile === "sshd") return { PATH: "/usr/sbin:/usr/bin:/sbin:/bin" };
  if (profile === "launchpad") {
    const environment = {
      PATH: "/usr/local/bin:/usr/bin:/bin",
      HOME: launchpadHome,
      USER: "launchpad",
      LOGNAME: "launchpad",
      HOST: "127.0.0.1",
      LAUNCHPAD_PORT: "3002",
      LAUNCHPAD_BASE_PATH: "/launchpad",
      NODE_ENV: launchpadNodeEnvironment(source),
      LAUNCHPAD_RECOVERY_SUMMARY: TASK_SUMMARY_PATH,
      CLOUDDEV_WORKSPACE_PASSWORD: source.CLOUDDEV_WORKSPACE_PASSWORD,
      CLOUDDEV_WORKSPACE_AUTH_SECRET: source.CLOUDDEV_WORKSPACE_AUTH_SECRET,
      TMPDIR: "/tmp",
    };
    if (typeof environment.CLOUDDEV_WORKSPACE_PASSWORD !== "string" || environment.CLOUDDEV_WORKSPACE_PASSWORD.length < 32) {
      throw new Error("Launchpad requires the generated workspace browser password.");
    }
    if (typeof environment.CLOUDDEV_WORKSPACE_AUTH_SECRET !== "string"
      || !/^[A-Za-z0-9_-]{32,128}$/.test(environment.CLOUDDEV_WORKSPACE_AUTH_SECRET)) {
      throw new Error("Launchpad requires a generated workspace authentication secret.");
    }
    for (const key of LAUNCHPAD_CONFIG_KEYS) copyIfPresent(environment, source, key);
    const fingerprint = sshFingerprint(source);
    if (fingerprint) environment.IDE_SSH_HOST_FINGERPRINT = fingerprint;
    return environment;
  }
  if (profile === "code-server") {
    return { ...coderEnvironment({ source, home, projectsDirectory }) };
  }
  if (profile === "cloudcli") {
    const env = {
      ...coderEnvironment({ source, home, projectsDirectory }),
      NODE_ENV: "production",
      HOST: "127.0.0.1",
      SERVER_PORT: "3001",
      CLAUDE_CLI_PATH: "/opt/clouddev-ide/agent-tools/node_modules/@anthropic-ai/claude-code/bin/claude.exe",
      WORKSPACES_ROOT: projectsDirectory,
      DATABASE_PATH: `${home}/.cloudcli/auth.db`,
      CLOUDDEV_TASK_REGISTRY_PATH: `${home}/.local/state/clouddev/tasks.json`,
      CLOUDDEV_TASK_SUMMARY_PATH: TASK_SUMMARY_PATH,
      CLOUDDEV_GATEWAY_CONFIG_PATH: `${home}/.config/clouddev-ai/gateway.json`,
      CLOUDCLI_PACKAGE_ROOT: "/opt/clouddev-ide/cloudcli-ui/node_modules/@cloudcli-ai/cloudcli",
    };
    const apiKey = gatewayConfig?.apiKey;
    const baseUrl = gatewayConfig?.baseUrl;
    if (typeof apiKey === "string" && apiKey.length > 0 && typeof baseUrl === "string" && baseUrl.length > 0) {
      env.OMNIROUTE_API_KEY = apiKey;
      env.ANTHROPIC_AUTH_TOKEN = apiKey;
      env.ANTHROPIC_BASE_URL = baseUrl;
    }
    return env;
  }
  throw new Error(`Unknown service environment profile: ${profile}`);
}
