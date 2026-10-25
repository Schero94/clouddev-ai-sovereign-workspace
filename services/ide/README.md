# CloudDev AI IDE service

The IDE image combines code-server, CloudCLI, Caddy, key-only OpenSSH, and the
terminal AI wrappers. It is for one operator in one isolated workspace. The
image is built from the repository root so it can package the parent-owned
`services/launchpad/**` application without changing its source.

## Runtime layout

The image pins the official `codercom/code-server:4.143.1` and
`caddy:2.11.6-alpine` images, Node.js `24.22.0`, CloudCLI `1.37.5`, Codex
`0.164.0`, Claude Code `2.1.310`, and OmniRoute CLI `3.8.52`. npm lockfiles pin
the CLI dependency trees. It installs Git, OpenSSH client/server, Python 3,
build tools, tmux, pnpm, and the configured Open VSX extensions.

Use one persistent volume at `/workspace`:

- User home and CLI/editor settings: `/workspace/home`
- Projects: `/workspace/projects`
- Persistent OpenSSH host key: `/workspace/system/ssh`
- Public, non-secret task counts: `/workspace/public-status/recovery.json`

The `coder` passwd entry has `/workspace/home` as its home. code-server,
CloudCLI, Codex, and Claude Code run as UID 1000. Caddy runs as UID 1001 and
the launchpad as UID 1002. OpenSSH starts under the small root supervisor so it
can read root-owned operator keys from `/run/clouddev-ssh/authorized_keys/coder`.
Those login keys are re-injected from `SSH_AUTHORIZED_KEYS` on each boot. The
separate Forgejo Git identity belongs under the coder user's persistent
`~/.ssh` directory.

The shared volume root is set to `root:root` mode `0755` at boot. This lets
Caddy, the launchpad, and the IDE reach their UID-owned subdirectories. The
user's home and project roots keep their separate owners and modes.

## Browser access

Caddy listens on port 8080 and checks a signed, HttpOnly workspace cookie
through the launchpad's private auth endpoint. The launchpad presents a login
form using the per-deployment `CODE_SERVER_PASSWORD`. Cookies use
`SameSite=Strict` and `Secure` in production. Caddy holds only the internal
auth-check key in a root-owned, Caddy-readable config under
`/run/clouddev-caddy`; the workspace password goes only to the launchpad
process under UID 1002.

Caddy protects CloudCLI at `/`, code-server at `/vscode/`, and the launchpad
at `/launchpad/`. It exempts only `/healthz` and the workspace sign-in routes.
code-server uses `auth: none` on `127.0.0.1:8081`; that listener is not
published by the image. Caddy redirects unauthenticated browser requests to
the sign-in page before forwarding them. The cookie gate preserves CloudCLI's
Bearer `Authorization` header. Public HTTPS must be provided by the deployment
edge. Local Compose may use HTTP on loopback.
Launchpad uses development URL validation when `RAILWAY_PUBLIC_DOMAIN` is
empty, and production validation when it is set. `CLOUDDEV_LAUNCHPAD_NODE_ENV`
can explicitly select `development` or `production`.

CloudCLI's unauthenticated upstream listens on loopback port 3001. The
embedded launchpad listens on loopback port 3002. OmniRoute keeps its dashboard
and API bridge private. A loopback-only Caddy adapter at `127.0.0.1:20129`
routes the CLI health probe to the dashboard and rewrites OpenAI-compatible
`/v1/*` requests to OmniRoute's base-path API on dashboard port 20128. This
includes model discovery, OpenAI chat, and Anthropic Messages. The separately
bound API bridge does not serve these routes in the pinned image. The dashboard
is available at `/omniroute/` after workspace-cookie authentication and
OmniRoute's own login.

## SSH and Remote-SSH

OpenSSH accepts Ed25519 public keys only on port 2222. Set
`SSH_AUTHORIZED_KEYS` to one or more public-key lines. Startup validates them
and installs the authorized-keys file outside `/workspace`, owned by root.
OpenSSH's privilege-separated pre-auth process must be able to traverse the
path and read public-key material, so parent directories are mode 0755 and the
public-key file is mode 0644. UID 1000 cannot modify them.

With `UsePAM no`, Debian OpenSSH rejects a locked `/etc/shadow` account before
it checks the public key. At startup, the root supervisor sets a random,
unrecorded password for `coder` and discards it. `PasswordAuthentication no`,
`KbdInteractiveAuthentication no`, and `AuthenticationMethods publickey`
remain enforced. No password is provided to IDE services or usable over SSH.

The persistent server host key is created at
`/workspace/system/ssh/ssh_host_ed25519_key`. Startup derives its public
`SHA256:` fingerprint with `ssh-keygen -lf` and passes only that fingerprint
to the launchpad as `IDE_SSH_HOST_FINGERPRINT`. Compare it with the
first-connection prompt before accepting a new SSH host key.

`AllowTcpForwarding local` supports client-side Remote-SSH forwarding.
`PermitOpen 127.0.0.1:* localhost:*` limits forwarded destinations to loopback;
remote forwarding, stream-local forwarding, agent forwarding, and X11
forwarding are disabled. A local VS Code Remote-SSH connection was previously
verified, but the Railway TCP proxy and the complete native desktop to phone
handoff still need live acceptance.

Run `git-setup` in the IDE to create `~/.ssh/id_ed25519_clouddev`. It refuses
to replace an existing key without confirmation and prints only the public
half. Add that public key to the regular, non-admin Forgejo user. Do not use a
Forgejo administrator token in the workspace.

## AI gateway setup

Open the authenticated OmniRoute dashboard at `/omniroute/` to connect a provider and create a
restricted inference API key. Do not give the IDE a provider master key,
OmniRoute management key, Forgejo administrator token, or Railway token.

Run `ai-setup` in an interactive IDE terminal. It prompts for the private
inference key without echoing it, checks `/v1/models?kind=chat`, and saves the
key and selected models in `~/.config/clouddev-ai/gateway.json` with mode
0600. It also writes the Codex provider routing to the persistent user-level
`$CODEX_HOME/config.toml`; the provider key is referenced by environment name,
not copied into TOML or project configuration.

The `ai-codex` and `ai-claude` wrappers use OmniRoute CLI 3.8.52 and tmux so a
terminal task can continue after the SSH client disconnects. Reconnect with
`clouddev-tasks --attach ID` while the tmux session is running. CloudCLI
provider runs keep running after a browser/WebSocket disconnect.

CloudCLI 1.37.5's pinned provider-runtime boundary reloads the mode-0600
gateway file immediately before each Codex or Claude run. It writes the routed
model into CloudCLI's session row before dispatch, so the model shown when a
conversation is reopened matches the one sent to the gateway. The Claude Agent
SDK also receives the pinned Claude Code executable path explicitly. Gateway
setup therefore takes effect without restarting the workspace. The CloudCLI
integration test uses a local mock endpoint and does not make a paid provider
request.

The task registry at `~/.local/state/clouddev/tasks.json` is authoritative and
mode 0600. The launchpad receives only
`LAUNCHPAD_RECOVERY_SUMMARY=/workspace/public-status/recovery.json`. That file
is atomically replaced, mode 0644, and contains only versioned integer counts
for total, running, interrupted, completed, failed, and other tasks. It has no
task IDs, provider session IDs, prompts, paths, or credentials. Symlinked
summary paths are rejected.

On first browser visit, sign in with the workspace password and create the
single CloudCLI account when prompted. Its JWT is separate from the workspace
cookie. Keep both credentials distinct and rotate them independently.

On process restart, formerly running tasks are marked interrupted. The system
does not replay them. Resume is manual through CloudCLI after its provider
session transcript is available. Do not resume the same provider session in
CloudCLI while its tmux task is still active. A restarted container cannot
keep an in-memory provider process alive.

## Security limits

The image has no Docker socket and grants no Linux capabilities to Caddy,
launchpad, code-server, or CloudCLI. Launchpad receives the workspace password,
cookie signing key, a public SSH host-key fingerprint, and a public counts-only
recovery file. It is a trusted auth component under UID 1002. It does not read
the private task registry. CloudCLI receives only the restricted inference
credential needed for provider calls.

This is not a sandbox for hostile repository code or coding agents. CloudCLI,
code-server, and terminal agents share UID 1000. A coding agent can read the
workspace files and its mode-0600 gateway and Git identity keys, inspect its
own process environment, and make outbound network connections. A mode-0600
file limits access by other UIDs, not by the agent running as UID 1000. The
deployment has no enforced egress firewall.

## Local validation

Build from the repository root:

```sh
docker build -f services/ide/Dockerfile -t clouddev-ide:local .
```

Scoped checks:

```sh
npm --prefix services/ide test
npm --prefix services/ide run check
```

The Caddy proxy integration test runs when supplied `CLOUDDEV_CADDY_BIN` and
Node.js 24.7 or newer. The pinned-runtime mock test runs with CloudCLI installed.
Local mock acceptance confirmed that a detached Claude Code session can be
indexed and followed up in CloudCLI while browser VS Code sees the same file.
It did not start the task from the native VS Code Desktop application. A real
Railway deployment, physical phone testing, Windows Remote-SSH, and the full
desktop-to-phone-to-desktop flow are still separate checks.
