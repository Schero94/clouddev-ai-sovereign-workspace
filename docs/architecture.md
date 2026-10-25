# Architecture

## Services

| Service | Responsibility | Public entry point |
| --- | --- | --- |
| `clouddev-ide` | code-server, CloudCLI, Codex CLI, Claude Code CLI, launchpad, Caddy, and key-only OpenSSH | Authenticated HTTPS and explicit SSH TCP proxy |
| `clouddev-git` | Rootless Forgejo with registration disabled | Forgejo sign-in, plus optional Git SSH |
| `clouddev-postgres` | Forgejo metadata database | Private networking only |
| `clouddev-router` | OmniRoute dashboard, provider credentials, and model routing | Private networking only; dashboard is proxied through the authenticated workspace |

The launchpad, CloudCLI, VS Code, and both terminal agents run in the workspace service. They use the same filesystem. Forgejo and OmniRoute retain their own authentication. The workspace cookie is not a cross-service SSO token.

## Shared workspace

The IDE service has one persistent volume at `/workspace`:

| Path | Contents |
| --- | --- |
| `/workspace/home` | User settings, CLI configuration, CloudCLI state, and provider session artifacts |
| `/workspace/projects` | Cloned repositories and project files |
| `/workspace/system` | Service-owned persistent identities and host keys |
| `/workspace/public-status` | Non-secret recovery summary for the launchpad |

Forgejo, PostgreSQL, and OmniRoute use separate persistent storage. Volume-backed Railway services run one replica. No horizontal scaling is promised.

## Browser and SSH boundaries

Caddy listens on the workspace's public HTTP port. Browser requests first pass a signed, HttpOnly workspace-cookie check. CloudCLI keeps its own Bearer token in the `Authorization` header. code-server and CloudCLI listeners remain on loopback. SSH accepts operator-provisioned public keys only and does not share the Forgejo Git key.

Railway private networking connects services but does not filter workspace egress. Coding agents can read files available to the workspace user and can make outbound requests. They may read the scoped inference key and regular Git key used for work. They receive no Railway token, Forgejo administrator credential, OmniRoute management secret, provider master key, Docker socket, or root privilege.

## Session recovery

CloudCLI stores provider conversations and session artifacts on the persistent workspace volume. A durable task registry records task state. On startup, a task that was running becomes interrupted. Restarting a Railway service kills its in-memory process. CloudDev AI does not automatically replay a prompt or claim a killed process kept running. Resume only through a provider-supported user action.

See the [threat model](security/THREAT_MODEL.md), [data flow](privacy/DATA_FLOW.md), and [restore guide](security/BACKUP_RESTORE.md) for more detail.
