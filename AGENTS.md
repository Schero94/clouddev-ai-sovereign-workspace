# CloudDev AI contributor instructions

CloudDev AI is a single-user, always-on cross-device workspace. Native VS Code Remote-SSH, browser VS Code, and CloudCLI mobile must use the same persistent project tree and provider session artifacts. Keep it single-user unless the product scope is explicitly revised.

## Rules

- Before changing files, read `.cursor/rules` if present and follow any applicable rules. Also read this file and the relevant project skills.
- Keep provider master keys in OmniRoute only. Never put a Railway token, Forgejo administrator token, or provider credential in the IDE service.
- Do not add a Docker socket, privileged container, default password, or public PostgreSQL endpoint.
- Require authentication for every public UI. The workspace Caddy gateway accepts a secure HttpOnly session cookie issued by the private launchpad sign-in page. CloudCLI still uses its own account/JWT API; Forgejo and OmniRoute keep native accounts. Do not add implicit cross-service SSO.
- Run CloudCLI, code-server, Codex CLI, Claude Code CLI, Caddy, and key-only OpenSSH in the shared workspace service. Do not use `railway ssh` as the VS Code Remote-SSH transport.
- Keep one Railway workspace volume mounted at `/workspace`; place `HOME` at `/workspace/home` and projects at `/workspace/projects`. Railway permits one volume per service and no replicas for a volume-backed service.
- CloudCLI's self-hosted web app has no built-in edge authentication. Keep it and browser code-server behind Caddy's authenticated cookie gate. Do not use HTTP Basic Auth because it conflicts with CloudCLI's Bearer-token API. The SSH service must reject password and keyboard-interactive authentication.
- The workspace password and session-signing secret may reach only the trusted launchpad auth process; the signing secret is also written into a root-owned, Caddy-readable proxy config. Neither secret may reach UID 1000 agents or the CloudCLI child. Keep CloudCLI's scoped inference credential separate.
- Persist provider session artifacts and a durable task registry. On boot, mark formerly running task records interrupted and expose only supported, user-initiated resume actions. A restart cannot preserve an in-memory agent process.
- Before CloudCLI provider dispatch, refresh the mode-0600 scoped gateway config, persist the selected routed model through CloudCLI's provider-model service, and pass it to the runtime. Keep `CLAUDE_CLI_PATH` set to the pinned packaged executable so Claude Agent SDK can start it without relying on an inherited PATH lookup.
- Do not claim desktop windows share editor UI state. They share persisted files and tested, resumable provider session history only.
- Set Railway IaC `deploy.sleepApplication` to `false` for the always-on workspace and verify the live setting after deployment. Configure the explicit SSH TCP Proxy through the IaC `tcpProxies` field when the current pinned DSL type-checks it; verify the live proxy endpoint after deployment.
- Treat repositories and coding-agent commands as untrusted. Do not automatically run cloned repository scripts.
- Keep all user state on declared persistent mounts. Do not claim backup success until a restore has been run.
- Exported local backups are encrypted to the operator's public age recipient. Keep the private identity outside Railway, this repository, `/workspace`, and agent environments. `STORAGE_ENCRYPTION_KEY` remains a separate OmniRoute recovery secret. Railway volume snapshots remain provider-managed and must not be called customer-key encrypted.
- The local encrypted backup command requires the operator to confirm workspace and Git writes are quiesced. It must not stop, restart, or write to an existing Compose project. Restore tests use a fresh, uniquely named project and remove only resources they created.
- Pin production images and CLI dependencies. Do not use `latest` in production configuration.
- Do not claim EU-only processing, GDPR compliance, tested performance, One-Click verification, or successful deployment without direct evidence.
- Keep Railway IaC in `.railway/railway.ts`. Do not add `railway.toml` or `railway.json`.
- Keep public generated domains, per-deployment `secret()` expressions, and Marketplace metadata in the Railway Template Composer where IaC cannot express them. `preserve()` retains a value that already exists in Railway. It does not generate a value for a fresh template deployment. Keep `.railway/template-variables.json` synchronized with every `preserve()` entry and run `npm run check:railway-template` after changes.
- Before relying on library or platform APIs, check current official documentation. If Context7 is unavailable, report the quota error and use current official docs, not stale memory.
- Use test-first changes for application behavior. Report local tests, integration tests, Railway plan/deploy, Marketplace publication, and restore drills as separate gates.

## Local checks

- `npm test`
- `npm run test:security`
- `docker compose config --quiet`
- `docker compose build`
- `npm run scan:images` (rebuilds the three Compose Dockerfile candidates and pulls pinned PostgreSQL without starting or restarting existing services; scans the resulting immutable image IDs)
- `./scripts/verify-local.sh` (requires a working Docker Engine)

See `GATES.md` for acceptance evidence and unresolved items.
