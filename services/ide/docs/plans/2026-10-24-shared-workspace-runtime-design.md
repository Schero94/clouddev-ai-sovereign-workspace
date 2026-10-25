# Shared workspace runtime design

## Scope

Implement the always-on runtime in `services/ide/**` only. The IDE image
contains CloudCLI, code-server, Caddy, key-only OpenSSH, the AI wrappers, and
the durable task registry. It packages, but does not modify,
`services/launchpad/**`. Root Compose, Railway IaC, and other service folders
remain outside this work.

## Processes and persistent state

The service uses one persistent volume at `/workspace`. The `coder` account's
home is `/workspace/home`, and projects live at `/workspace/projects`. Caddy
runs as UID 1001. Launchpad runs as UID 1002. code-server, CloudCLI, and agent
processes run as UID 1000. A minimal root entrypoint installs operator SSH
keys, prepares persistent paths, derives the public SSH host fingerprint,
validates Caddy configuration, and starts the service supervisor.

Caddy provides the browser entry gate. It listens on port 8080 and routes
`/`, `/vscode/`, and `/launchpad/` to loopback ports 3001, 8081, and 3002.
Before proxying those routes, `forward_auth` checks a signed HttpOnly workspace
cookie through the loopback launchpad. The login form uses
`CODE_SERVER_PASSWORD`; the launchpad signs an eight-hour cookie with
`CLOUDDEV_WORKSPACE_AUTH_SECRET`. Caddy holds only a derived internal check key
in its protected config. It preserves CloudCLI's own Bearer `Authorization`
header. code-server uses `auth: none` on `127.0.0.1:8081`, and Caddy has
`admin off`.

OpenSSH listens on port 2222, accepts Ed25519 keys only, and permits local TCP
forwarding only to `127.0.0.1:*` and `localhost:*`. Operator login keys live
at `/run/clouddev-ssh/authorized_keys/coder`, outside the workspace, owned by
root, and mode 0600. The host private key is persistent and root-owned at
`/workspace/system/ssh`. Its public SHA256 fingerprint is passed to the
launchpad as `IDE_SSH_HOST_FINGERPRINT`.

OmniRoute's dashboard stays on private port 20128. Its API bridge stays bound
to router loopback on port 20131. A loopback-only Caddy adapter routes the
OmniRoute CLI health check to the dashboard and rewrites `/v1/*` requests to
the documented `/omniroute/api/v1/*` API routes. The dashboard is proxied
under `/omniroute/` after workspace authentication. Launchpad uses development mode for local loopback Compose URLs
and production mode on Railway when `RAILWAY_PUBLIC_DOMAIN` is set. Operators
can override this through `CLOUDDEV_LAUNCHPAD_NODE_ENV`.

## Gateway configuration refresh

The pinned CloudCLI 1.37.5 provider registry exposes Codex and Claude runtime
objects. A small hook wraps their `runtime.run` boundary. Before each run it
reloads `~/.config/clouddev-ai/gateway.json`, checks its 0600 permissions,
updates the user-level `$CODEX_HOME/config.toml`, and sets only the restricted
inference values in CloudCLI's process environment. This supports `ai-setup`
after CloudCLI has started. The mode-0600 config is the source of truth; no
credential is copied into project configuration.

CloudCLI, code-server, and the terminal agents run as UID 1000. A coding agent
can therefore read the gateway file and any Git identity key owned by that
user. The inference key is available to CloudCLI because provider processes
need it. This service does not provide a filesystem or egress sandbox for
untrusted repository code.

## Tasks and recovery

The authoritative registry at
`/workspace/home/.local/state/clouddev/tasks.json` is mode 0600. Every task
transition atomically updates a separate mode-0644 file at
`/workspace/public-status/recovery.json`. That summary contains only integer
counts for total, running, interrupted, completed, failed, and other tasks.
Launchpad receives the summary through `LAUNCHPAD_RECOVERY_SUMMARY` and never
receives session IDs or the authoritative registry path.

Tmux keeps terminal Codex and Claude tasks alive after SSH disconnect. CloudCLI
keeps provider runs alive after browser disconnect. After a process restart,
the registry marks running tasks interrupted. It never replays them. Users
must manually resume a provider session in CloudCLI after transcript indexing;
they should not concurrently resume a session still running in tmux.

## Verification boundaries

IDE unit tests cover path permissions, summary contents, symlink rejection,
service environment allowlists, launchpad mode selection, and process
configuration. Pinned CloudCLI integration tests exercise its provider
registry and runtime boundary with a local mock endpoint. The Caddy integration
test exercises actual unauthenticated redirects, cookie authorization, and
Bearer-token pass-through when run with the pinned Caddy binary.

Docker image build, runtime SSH forwarding, a real desktop VS Code
Remote-SSH connection, Railway deployment, and cross-device acceptance remain
separate gates. Passing unit tests does not prove those live checks.
