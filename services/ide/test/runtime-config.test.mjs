import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => readFileSync(path.join(root, relative), "utf8");

test("pins images and CLI dependencies and declares one persistent workspace volume", () => {
  const dockerfile = read("Dockerfile");
  const cloudcli = JSON.parse(read("cloudcli-ui/package.json"));
  assert.match(dockerfile, /^FROM node:26\.13\.1-bookworm-slim@sha256:5df79989ed685e09f0a98019db4cebfb22fb9df1a53c0161664a011f7ff6b0f1 AS node-runtime$/m);
  assert.match(dockerfile, /^FROM caddy:2\.11\.7-alpine@sha256:eb4d35b7452d1ab6171fbdbe8d9275b2301dad6dad92115d91e19fb9b24d510f AS caddy-runtime$/m);
  assert.match(dockerfile, /^FROM codercom\/code-server:4\.143\.1@sha256:[a-f0-9]{64} AS assembled$/m);
  assert.match(dockerfile, /shell-quote-1\.11\.0\.tgz/);
  assert.equal(cloudcli.dependencies["@cloudcli-ai/cloudcli"], "1.37.9");
  assert.equal(cloudcli.dependencies.playwright, "1.65.1", "CloudCLI Browser resolves playwright from its own tree");
  assert.match(dockerfile, /PLAYWRIGHT_BROWSERS_PATH=\/opt\/ms-playwright/);
  assert.match(dockerfile, /playwright install-deps chromium/);
  assert.match(dockerfile, /playwright install chromium/);
  assert.match(dockerfile, /apt-get purge -y xvfb xserver-common libxfont2 libfontenc1 xfonts-utils/, "headless Chromium needs no X server");
  const taskMaster = JSON.parse(read("task-master/package.json"));
  const taskMasterLock = JSON.parse(read("task-master/package-lock.json"));
  assert.equal(taskMaster.dependencies["task-master-ai"], "0.43.1");
  assert.equal(taskMasterLock.packages["node_modules/task-master-ai"].version, "0.43.1");
  assert.equal(taskMaster.overrides["simple-git"], "4.1.0");
  assert.match(dockerfile, /cp -R \/opt\/clouddev-ide\/task-master\/disabled-extract-zip \/opt\/clouddev-ide\/task-master\/node_modules\/extract-zip/);
  for (const [name, entry] of Object.entries(taskMasterLock.packages)) {
    if (name.endsWith("node_modules/simple-git")) assert.equal(entry.version, "4.1.0", name);
    if (name.endsWith("node_modules/undici")) assert.notEqual(entry.version.split(".")[0], "5", name);
    if (name.endsWith("node_modules/@opentelemetry/sdk-node")) assert.equal(entry.version, "0.217.0", name);
  }
  assert.match(read("task-master/disabled-extract-zip/index.js"), /throw new Error/);
  assert.match(dockerfile, /npm ci --prefix \/opt\/clouddev-ide\/task-master /);
  assert.match(dockerfile, /ln -s \/opt\/clouddev-ide\/task-master\/node_modules\/\.bin\/task-master \/usr\/local\/bin\/task-master/);
  assert.doesNotMatch(dockerfile, /npm install -g task-master-ai/);
  assert.doesNotMatch(dockerfile, /path-intellisense/, "its bundled minimatch, json5, and brace-expansion are vulnerable");
  assert.match(dockerfile, /astral-sh\/uv\/releases\/download\/0\.13\.9\//);
  assert.match(dockerfile, /a7fbaff2b9a271d85c1bdb540941090fd1ce011797b4abeb48e4dcd39c2471d5/);
  assert.match(dockerfile, /0797542018e541a9288855df555c8077eed06f7a47d206362030480e8ecc9f3d/);
  assert.match(dockerfile, /uv python install 3\.15\.2/);
  assert.match(dockerfile, /python3 --version \| grep -F 'Python 3\.15\.2'/);
  for (const extension of [
    "redhat.vscode-yaml@2.1.2026112008",
    "usernamehw.errorlens@3.30.0",
    "tamasfe.even-better-toml@0.21.2",
    "ms-python.python@2026.10.0",
    "ms-python.debugpy@2026.6.0",
    "dbaeumer.vscode-eslint@3.0.34",
    "esbenp.prettier-vscode@12.4.0",
    "bradlc.vscode-tailwindcss@0.16.0",
    "yzhang.markdown-all-in-one@3.6.2",
  ]) {
    assert.match(dockerfile, new RegExp(`^ {4}${extension.replace(/\./g, "\\.")} \\\\$`, "m"), extension);
  }
  const extensionList = dockerfile.slice(dockerfile.indexOf("for extension in"), dockerfile.indexOf("; do code-server"));
  for (const entry of extensionList.split("\\").slice(1).map(line => line.trim()).filter(Boolean)) {
    assert.match(entry, /^[a-z0-9-]+\.[a-z0-9-]+@\d[\w.]*$/, `${entry} is pinned`);
  }
  assert.match(read("entrypoint.sh"), /install-cloudcli-plugins\.sh/);
  assert.match(read("entrypoint.sh"), /install-gateway-config\.mjs/);
  const supervisorEnv = read("entrypoint.sh").slice(read("entrypoint.sh").indexOf("exec /usr/bin/env -i"));
  assert.doesNotMatch(supervisorEnv, /CLOUDDEV_GATEWAY_BOOTSTRAP_SECRET/);
  assert.doesNotMatch(supervisorEnv, /INITIAL_PASSWORD/);
  const pluginScript = read("scripts/install-cloudcli-plugins.sh");
  for (const repository of [
    "cloudcli-ai/cloudcli-plugin-starter",
    "cloudcli-ai/cloudcli-plugin-terminal",
    "grostim/cloudcli-cron",
    "jakeefr/cloudcli-plugin-prism",
    "strykereye2/cloudcli-plugin-session-manager",
    "NightmareAway/cloudcli-plugin-token-cost-calculator",
    "TadMSTR/cloudcli-plugin-task-queue",
    "szmidtpiotr/claude-github-issue",
    "HandyS11/cloudcli-plugin-claude-usage",
    "dongwook-chan/cloudcli-plugin-codex-usage",
    "realjustinwu/CloudCLI-GLM-Usage",
    "notetook/cloudcli-plugin-agent-monitor",
  ]) {
    assert.ok(pluginScript.includes(`https://github.com/${repository}.git\n`), repository);
  }
  assert.doesNotMatch(read("scripts/install-cloudcli-plugins.sh"), /cloudcli-plugin-ccx/);
  assert.doesNotMatch(dockerfile, /VOLUME /);
  assert.match(dockerfile, /HOME=\/workspace\/home/);
  assert.match(dockerfile, /WORKDIR \/workspace\/projects/);
  assert.match(dockerfile, /EXPOSE 8080 2222/);
  assert.doesNotMatch(dockerfile, /:latest/);
});

test("keeps code-server on loopback without a second password and puts all browser paths behind Caddy", () => {
  const dockerfile = read("Dockerfile");
  const caddyfile = read("Caddyfile.template");
  const serverConfig = read("src/write-server-config.mjs");
  const supervisor = read("src/supervisor.mjs");
  assert.match(caddyfile, /admin off/);
  assert.match(caddyfile, /forward_auth/);
  assert.match(caddyfile, /handle_path \/vscode\/\*/);
  assert.match(caddyfile, /handle_path \/launchpad\/\*/);
  assert.match(caddyfile, /@@VSCODE_UPSTREAM@@/);
  assert.match(caddyfile, /@@LAUNCHPAD_UPSTREAM@@/);
  assert.match(caddyfile, /@@CLOUDCLI_UPSTREAM@@/);
  assert.match(serverConfig, /bind-addr: 127\.0\.0\.1:8081/);
  assert.match(serverConfig, /auth: none/);
  assert.match(supervisor, /127\.0\.0\.1:8081/);
  assert.match(supervisor, /"--auth", "none"/);
  assert.match(read("src/service-environment.mjs"), /LAUNCHPAD_PORT: "3002"/);
  assert.match(dockerfile, /COPY --from=caddy-build \/out\/caddy \/usr\/bin\/caddy/);
  assert.match(dockerfile, /COPY services\/launchpad\/src\//);
});

test("isolates Caddy, launchpad, code-server, CloudCLI, and sshd under the agreed identities", () => {
  const dockerfile = read("Dockerfile");
  const supervisor = read("src/supervisor.mjs");
  const serviceCommand = read("src/run-service.mjs");
  const entrypoint = read("entrypoint.sh");
  assert.match(dockerfile, /useradd --uid 1001/);
  assert.match(dockerfile, /useradd --uid 1002/);
  assert.match(supervisor, /profile: "caddy"/);
  assert.match(supervisor, /profile: "launchpad"/);
  assert.match(supervisor, /profile: "code-server"/);
  assert.match(supervisor, /profile: "cloudcli"/);
  assert.match(serviceCommand, /--reuid=\$\{identity\.uid\}/);
  assert.match(serviceCommand, /--clear-groups/);
  assert.match(supervisor, /detached: true/);
  assert.match(entrypoint, /env -i/);
  assert.match(entrypoint, /caddy validate/);
  assert.match(entrypoint, /unset caddy_secret CODE_SERVER_PASSWORD/);
  assert.match(entrypoint, /CLOUDDEV_LAUNCHPAD_NODE_ENV=\"\$\{CLOUDDEV_LAUNCHPAD_NODE_ENV:-\}\"/);
  assert.match(entrypoint, /unset operator_keys SSH_AUTHORIZED_KEYS/);
  assert.doesNotMatch(entrypoint, /requires SSH_AUTHORIZED_KEYS/, "a fresh template starts without an SSH key");
  assert.match(entrypoint, /install-editor-seed\.mjs/);
  assert.match(entrypoint, /CLOUDDEV_WORKSPACE_PASSWORD=\"\$workspace_password\"/);
  assert.match(entrypoint, /CLOUDDEV_WORKSPACE_AUTH_SECRET=\"\$workspace_auth_secret\"/);
  assert.match(entrypoint, /unset caddy_secret CODE_SERVER_PASSWORD/);
  const scrubbedSupervisor = entrypoint.slice(entrypoint.indexOf("exec /usr/bin/env -i"));
  assert.doesNotMatch(scrubbedSupervisor, /CODE_SERVER_PASSWORD|SSH_AUTHORIZED_KEYS|RAILWAY_TOKEN|FORGEJO_ADMIN_TOKEN|OMNIROUTE_MASTER_KEY/);
  assert.doesNotMatch(`${entrypoint}\n${supervisor}`, /docker\.sock|--privileged/);
});

test("makes only the persistent volume root traversable for isolated service UIDs", () => {
  const entrypoint = read("entrypoint.sh");
  const workspaceRoot = entrypoint.indexOf('chown root:root "$WORKSPACE"');
  const workspaceMode = entrypoint.indexOf('chmod 0755 "$WORKSPACE"');
  const homeCreation = entrypoint.indexOf('install -d -o "$IDE_UID" -g "$IDE_GID" -m 0700 "$IDE_HOME"');
  assert.ok(workspaceRoot >= 0 && workspaceMode > workspaceRoot && homeCreation > workspaceMode);
  assert.match(entrypoint, /workspace_metadata=\$\(stat -c '%u:%g:%a' "\$WORKSPACE"\)/);
  assert.match(entrypoint, /workspace_metadata" != "0:0:755/);
  assert.ok(entrypoint.indexOf('workspace_metadata=$(stat') < entrypoint.indexOf('exec /usr/bin/env -i'));
});

test("injects the persistent public SSH fingerprint and keeps public login keys root-owned outside /workspace", () => {
  const entrypoint = read("entrypoint.sh");
  const sshdConfig = read("sshd_config");
  const environment = read("src/service-environment.mjs");
  assert.match(entrypoint, /ssh-keygen -lf \"\$HOST_KEY\.pub\"/);
  assert.match(entrypoint, /IDE_SSH_HOST_FINGERPRINT=\"\$fingerprint\"/);
  assert.match(entrypoint, /HOST_KEY_DIRECTORY=\$WORKSPACE\/system\/ssh/);
  assert.match(entrypoint, /SSH_AUTHORIZED_KEYS/);
  assert.doesNotMatch(entrypoint, /CLOUDDEV_SSH_AUTHORIZED_KEYS/);
  assert.match(sshdConfig, /^Port 2222$/m);
  assert.match(sshdConfig, /^AuthorizedKeysFile \/run\/clouddev-ssh\/authorized_keys\/%u$/m);
  assert.doesNotMatch(sshdConfig, /AuthorizedKeysFile \/workspace/);
  assert.match(environment, /IDE_SSH_HOST_FINGERPRINT/);
  assert.match(environment, /source\.RAILWAY_PUBLIC_DOMAIN/);
  assert.match(environment, /LAUNCHPAD_RECOVERY_SUMMARY: TASK_SUMMARY_PATH/);
});

test("restricts SSH forwarding to Remote-SSH loopback targets only", () => {
  const sshdConfig = read("sshd_config");
  assert.match(sshdConfig, /^AllowTcpForwarding local$/m);
  assert.match(sshdConfig, /^PermitOpen 127\.0\.0\.1:\* localhost:\*$/m);
  assert.match(sshdConfig, /^AllowStreamLocalForwarding no$/m);
  assert.match(sshdConfig, /^GatewayPorts no$/m);
  assert.match(sshdConfig, /^AllowAgentForwarding no$/m);
  assert.match(sshdConfig, /^X11Forwarding no$/m);
  assert.match(sshdConfig, /^PasswordAuthentication no$/m);
  assert.match(sshdConfig, /^PermitEmptyPasswords no$/m);
  assert.match(sshdConfig, /^KbdInteractiveAuthentication no$/m);
  assert.doesNotMatch(sshdConfig, /^AllowTcpForwarding yes$/m);
});

test("publishes only the atomic public recovery summary to the UID-isolated launchpad", () => {
  const registry = read("src/task-registry.mjs");
  const environment = read("src/service-environment.mjs");
  assert.match(registry, /DEFAULT_TASK_SUMMARY_PATH = "\/workspace\/public-status\/recovery\.json"/);
  assert.match(registry, /total: tasks\.length/);
  assert.match(registry, /openSync\(temporaryPath, "wx", 0o644\)/);
  assert.match(registry, /writeSummary\(state\)/);
  assert.match(registry, /renameSync\(temporaryPath, resolvedSummaryPath\)/);
  assert.match(environment, /LAUNCHPAD_RECOVERY_SUMMARY: TASK_SUMMARY_PATH/);
  assert.match(environment, /CLOUDDEV_TASK_SUMMARY_PATH: TASK_SUMMARY_PATH/);
  assert.doesNotMatch(environment, /LAUNCHPAD_TASK_REGISTRY|LAUNCHPAD_RECOVERY_REGISTRY/);
});

test("keeps temporary config and runtime files in the IDE service scope", () => {
  for (const file of ["entrypoint.sh", "src/supervisor.mjs", "Caddyfile.template", "sshd_config", "src/healthcheck.mjs"]) {
    assert.ok(statSync(path.join(root, file)).isFile());
  }
});
