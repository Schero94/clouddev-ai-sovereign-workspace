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
  assert.match(dockerfile, /^FROM node:24\.22\.0-bookworm-slim@sha256:91acba91b842bec0bf7ea6f5e09c644c7ccad72c4996ed9616d861d1c7cd60d4 AS node-runtime$/m);
  assert.match(dockerfile, /^FROM caddy:2\.11\.7-alpine@sha256:eb4d35b7452d1ab6171fbdbe8d9275b2301dad6dad92115d91e19fb9b24d510f AS caddy-runtime$/m);
  assert.match(dockerfile, /^FROM codercom\/code-server:4\.143\.1@sha256:[a-f0-9]{64}$/m);
  assert.match(dockerfile, /shell-quote-1\.11\.0\.tgz/);
  assert.equal(cloudcli.dependencies["@cloudcli-ai/cloudcli"], "1.37.5");
  assert.match(dockerfile, /VOLUME \["\/workspace"\]/);
  assert.doesNotMatch(dockerfile, /VOLUME \[[^\]]*\/home\/coder/);
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
  assert.match(dockerfile, /COPY --from=caddy-runtime \/usr\/bin\/caddy \/usr\/bin\/caddy/);
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
