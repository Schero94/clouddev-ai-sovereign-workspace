# Plan: CloudDev AI cross-device workspace

Depth: tree 4   Mode: orchestrated
Budget note: full product implementation and acceptance across a local multi-service stack, native desktop clients, mobile browser, and a fresh Railway project.

## Contract

Decided from the user requirements and verified CloudCLI/Railway documentation.

- Interfaces: one Railway `clouddev-ide` service owns code-server, CloudCLI, the launchpad, Caddy, SSH, Codex, Claude Code and agent task metadata. CloudCLI is served at `/`; code-server is served at `/vscode/`; launchpad is served at `/launchpad/`; sshd listens internally on 2222. Forgejo, PostgreSQL, and OmniRoute remain independent services.
- Storage: one persistent `/workspace` volume for the IDE service. `HOME=/workspace/home`, `CODEX_HOME=/workspace/home/.codex`, `CLAUDE_CONFIG_DIR=/workspace/home/.claude`, CloudCLI SQLite at `/workspace/home/.cloudcli/auth.db`, projects at `/workspace/projects`. Other services use their own volume/data stores.
- Authentication: Caddy forward-auth checks a signed HttpOnly workspace cookie through the loopback launchpad. The login password and cookie secret are isolated to the launchpad and Caddy config. CloudCLI keeps its Bearer account token; Forgejo and OmniRoute keep native authentication. code-server, CloudCLI and launchpad listeners are loopback-only. sshd is public only through an explicit TCP proxy, accepts operator-provisioned public keys, rejects passwords and root. PostgreSQL has no public domain.
- Registry contract: durable JSON or SQLite metadata only, mode 0600, atomic writes, no prompts or credentials. Registry rows record provider, project path, provider-native session reference, timestamps and state. On startup, every previously running row becomes `interrupted`; only upstream-supported manual resume is offered. No auto-replay and no claim that a process survived a service restart.
- Security: agents remain same-user processes and can read workspace files, the restricted inference key and the dedicated Git key if needed. They receive no Railway token, Forgejo admin token, provider master key, Docker socket, or root privileges. Railway private networking does not restrict outbound egress.
- Naming: Railway services use `clouddev-ide`, `clouddev-git`, `clouddev-postgres`, and `clouddev-router`. The launchpad is an embedded route, not a fifth service. No `railway.toml` or `railway.json`.

## Tree

- 1 CloudDev AI product
  - 1.1 Shared IDE runtime .......... `gates/workspace-runtime.md`
    - 1.1.1 CloudCLI, Caddy, code-server and SSH owned by `services/ide/**` worker
    - 1.1.2 persistent task registry and recovery owned by `services/ide/**` worker
  - 1.2 Onboarding surface .......... `gates/launchpad.md`
    - 1.2.1 cross-device links and status owned by `services/launchpad/**` worker
  - 1.3 Service and infrastructure integration .......... `gates/local-stack.md`
    - 1.3.1 Compose, health checks, persistence, Forgejo and mock gateway owned by driver
    - 1.3.2 Railway IaC, domains, TCP proxy and no-sleep verification owned by driver
  - 1.4 Release and acceptance .......... `gates/cross-device-acceptance.md`
    - 1.4.1 native VS Code, mobile handoff, restart and Git acceptance owned by driver
    - 1.4.2 privacy, security, licensing and Marketplace documentation owned by driver

## Status log

Append-only. One line per event.

- 2026-10-24: plan revised after the user made always-on cross-device use a release-blocking feature.
- 2026-10-24: CloudCLI 1.37.5 official docs and npm metadata checked. Context7 lookup failed because the monthly quota was exhausted.
- 2026-10-24: CloudCLI source inspection confirmed SQLite path defaults under `~/.cloudcli/auth.db`, chat runs are process-local, and WebSocket close removes the client without aborting the provider run.
- 2026-10-24: Railway official docs confirmed HTTP and TCP exposure can coexist, while mounted volumes prevent replicas and allow only one volume per service. The published IaC types declare `tcpProxies` and `deploy.sleepApplication`; live behavior still needs a fresh deployment read-back.
- 2026-10-24: Official Railway IaC docs confirm generated HTTPS service domains and template `secret()` functions must be configured in the Template Composer. `npm run check:railway` passed with `railway` 3.16.0 and TypeScript 7.0.2. A validation project exists in the corporate workspace, but it is not the personal-account target for this product; no plan was applied and no services were created.
- 2026-10-25: A pinned CloudCLI runtime test reproduced stale UI-selected models in session history. The runtime hook now persists the routed model before provider dispatch. The CloudCLI child process also receives the pinned Claude Code executable path explicitly.
- 2026-10-25: Local mock cross-device acceptance passed through key-authenticated SSH, a 390x844 CloudCLI browser, browser VS Code, a private Forgejo push/fetch, and workspace restart recovery. The task was not started from the native VS Code Desktop app. No Railway, physical-phone, Windows, Marketplace, or backup-restore gate was completed.
- 2026-10-25: `./scripts/verify-local.sh` passed after the local SSH fingerprint probe was narrowed to the configured Ed25519 host key. The earlier probe tried host-key algorithms that this image does not provide.
- 2026-10-25: Current Railway Template, IaC, Variables, kickback, and partner docs were checked. Railway `preserve()` retains an existing value and does not generate one for a new template deployment. Ten independent `secret()` expressions and the operator's SSH public key are now listed in a Composer manifest with a coverage test. The docs distinguish published-template kickbacks from the separate partner application. Context7's monthly quota was exhausted, so official Railway docs were fetched directly. npm reports Railway IaC 3.16.0 and Railway CLI 5.71.0; the installed global CLI is 5.70.0, and the latest CLI was checked with `npx`.
- 2026-10-25: Railway CLI identity and linked context were read back. It points to an empty validation project in a shared business workspace. Safari app control timed out twice, and the installed browser automation session had no browser. No personal Railway workspace was verified and no Railway mutations were made.
- 2026-10-25: Final local checks for this pass: `npm test` 113 passed, 0 failed, 3 skipped; `npm run test:security` passed across 85 source files; `npm run check:railway-template` passed 2 tests; IaC type-check, Compose config, and launchpad syntax checks passed. Gitleaks 8.30.1 reported no staged secrets after the WebSocket test nonce was made dynamic. The audited ledger has 21 of 35 boxes checked; 14 remain open, including native-client, Railway, restore, Marketplace, and OmniRoute image-security gates. A local commit `09a03e0` records the implementation; there is no remote.
- 2026-10-25: npm audits of the pinned OmniRoute CLI tree reported 10 advisories (6 low, 1 moderate, 1 high, 2 critical), and CloudCLI's tree reported 20 (5 low, 15 moderate). No container image scanner is available, and the published OmniRoute image still uses Next.js 16.3.8 and DOMPurify `^3.4.14`. G15 remains open. No public repository, Railway template, kickback application, or verified template URL has been created.
- 2026-10-25: Published the source repository under the user-authenticated `Schero94` GitHub account. Read-back confirms public visibility, default branch `main`, and commit `f3e65c5f5fa6e4b54c5d340544980d62c1aeb486`. The Git tree has no `.env`, `secrets/`, or `backups/` paths. A full history scan with Gitleaks 8.30.1 found no leaks. This satisfies the source-repository deliverable only; there is still no Railway template or kickback application.
