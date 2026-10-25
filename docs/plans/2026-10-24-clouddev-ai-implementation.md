# CloudDev AI implementation plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a private, single-user Railway workspace whose mobile CloudCLI UI, browser VS Code, and native VS Code Remote-SSH share one running service, persistent project tree, agent history, and restart recovery state.

**Architecture:** `clouddev-ide` hosts code-server, the pinned CloudCLI UI, the launchpad, the pinned Codex and Claude Code CLIs, Caddy, and key-only OpenSSH. One Railway volume is mounted at `/workspace`; home and project directories are subpaths. Caddy authenticates all browser routes and sends CloudCLI to `/`, code-server to `/vscode/`, and the launchpad to `/launchpad/`. Railway TCP Proxy exposes only sshd on port 2222. Forgejo, PostgreSQL, and OmniRoute remain separate services. A durable registry records task/session references and startup reconciliation marks lost processes interrupted. It never claims an in-memory process survives a container restart.

**Tech Stack:** code-server, CloudCLI UI, Codex CLI, Claude Code CLI, OmniRoute, Caddy, OpenSSH, Forgejo, PostgreSQL, Docker Compose, Railway TypeScript IaC, Node.js tests.

---

### Task 1: Keep repository guidance and acceptance gates current

**Files:** `AGENTS.md`, `GATES.md`, `PLAN.md`, `gates/*.md`, design and implementation plans.

1. Record the one-service shared runtime, one-volume layout, proxy authentication, key-only SSH, task recovery, and Railway no-sleep requirement.
2. Make browser/desktop/mobile handoff and a restart recovery drill release gates.
3. Keep runtime process continuity distinct from provider history recovery.

### Task 2: Build and test the shared workspace runtime

**Files:** `services/ide/**`.

1. Pin the official CloudCLI npm package and verify its runtime, authentication, SQLite, provider/session, and resume behavior from its release package and docs.
2. Mount one persistent `/workspace`, with `HOME=/workspace/home`, `CODEX_HOME`, `CLAUDE_CONFIG_DIR`, `/workspace/projects`, and CloudCLI database under the persistent home.
3. Install OpenSSH server and expose an explicit `sshd` listener on 2222. Disable passwords and keyboard-interactive auth, reject root login, persist host keys, and render public operator keys into root-owned authorized-key files.
4. Put Caddy in front of CloudCLI and code-server. Use generated HTTP credentials, keep upstream listeners on loopback, support WebSocket upgrades, and verify `/vscode/` base-path behavior.
5. Run IDE, CloudCLI, and agent processes as the non-root user with no capabilities. Only the minimal startup setup and sshd master use root.
6. Add task registry transitions for start, completion, interruption, and explicit resume metadata. Never store prompt contents, credentials, or claim a process survived a restart.
7. Add unit tests for auth routes, SSH policy, runtime identity, shared paths, registry restart reconciliation, and secret redaction before implementation.

### Task 3: Integrate OmniRoute with both terminal and CloudCLI agents

**Files:** `services/ide/src/**`, `services/ide/scripts/**`, `services/ide/test/**`, `services/omniroute/**`.

1. Keep existing `ai-*` wrappers, model discovery, and restricted inference key behavior.
2. Configure Codex and Claude Code from the authenticated OmniRoute inference endpoint using supported CLI configuration. Do not inject provider master keys into the workspace.
3. Ensure CloudCLI's Codex SDK and Claude Agent SDK inherit supported gateway configuration and can reopen sessions created by the native CLIs. Persist the routed model in CloudCLI's session row before calling the provider runtime, and pass Claude Code's pinned executable path to the SDK.
4. Use a mock provider for catalog, streaming, error, and full-request-forwarding tests.

### Task 4: Keep Forgejo private and the workspace identity separate

**Files:** `services/forgejo/**`, `services/ide/scripts/git-setup`, Compose and integration tests.

1. Keep registration disabled, sign-in required, private repositories as the default, and PostgreSQL access restricted to the private network.
2. Provision the initial admin through documented CLI behavior and never pass administrator credentials into CloudCLI or agent environments.
3. Generate a distinct workspace Git key and test a private repository clone, change, commit, push, and fetch.

### Task 5: Update first-run launchpad for cross-device access

**Files:** `services/launchpad/**`.

1. Keep the launchpad small and serve it from the authenticated workspace origin at `/launchpad/`.
2. Link to CloudCLI mobile at the shared workspace root, browser VS Code at `/vscode/`, Forgejo, and authenticated OmniRoute management.
3. Show SSH host/port/user/key setup, always-on status, health, and recovery state without revealing private keys or tokens.
4. Do not add a second agent chat or session UI or a fifth Railway service.

### Task 6: Assemble local Compose and exercise the complete stack

**Files:** `docker-compose.yml`, `.env.example`, `scripts/**`, `tests/**`.

1. Use separate persistent volumes for workspace, Forgejo, PostgreSQL, and OmniRoute.
2. Publish the authenticated workspace HTTP port, an explicit local SSH test port, and test-only local Forgejo/OmniRoute ports documented for development. Do not publish PostgreSQL. The Railway TCP proxy is configured separately for sshd.
3. Test simultaneous browser sessions editing one file, CloudCLI session discover/resume, private Forgejo push, OmniRoute mock inference, restart persistence, and interruption recovery.
4. Test Caddy authentication for CloudCLI and code-server plus WebSocket transport.
5. Run all tests and build every image with a working Docker Engine. Never claim a successful restore without restoring actual backup data.

### Task 7: Complete and validate Railway IaC and template configuration

**Files:** `.railway/railway.ts`, `.railway/package.json`, `scripts/check-railway-iac.sh`, `.env.example`.

1. Declare pinned images/build contexts, private service references, health checks, distinct volumes, EU West placement, and zero horizontal replicas for stateful services.
2. Declare SSH `tcpProxies` and `deploy.sleepApplication: false` in the pinned IaC DSL. Generated Railway HTTP domains and per-deployment `secret()` template variables are configured in Template Composer because the IaC reference does not declare generated service domains.
3. Type-check and plan locally. Verify the live domain, TCP proxy, and no-sleep settings in a dedicated fresh Railway project.
4. Apply only after reviewing the exact plan. Do not apply to a pre-existing linked project.

### Task 8: Write security, privacy, backup, licensing, and operator docs

**Files:** `README.md`, `SECURITY.md`, `docs/privacy/**`, `docs/security/**`, `docs/operations/**`.

1. Describe browser and SSH auth boundaries, outbound egress, provider data flows, same-user agent risks, session persistence, restart semantics, and Railway volume constraints.
2. Document Railway deployment and Marketplace publication without an invented template ID.
3. Distinguish measured resource use from estimates and local test evidence from Railway acceptance.
4. List the upstream licenses, including CloudCLI's AGPL license and all shipped runtime tools.

### Task 9: Run final release gates and report remaining external acceptance

**Files:** `GATES.md`, `README.md`, gate evidence files.

1. Run unit, security, compose, image build, mock-provider, Forgejo, and local restart tests.
2. Run native VS Code Remote-SSH on macOS if available and a mobile browser session. Mark Windows and physical iPhone tests open if unavailable.
3. Run one fresh Railway EU West deployment before any claim of always-on or one-click verification.
4. Leave Marketplace publication and backup restore gates open until those exact actions are completed.

### Continuation results on 2026-10-25

- A failing pinned-runtime integration reproduced CloudCLI recording its UI-selected default model before the runtime hook replaced it. The hook now stores the configured routed model through CloudCLI's session model service before forwarding the run. The integration checks both provider session rows after closing and reopening the SQLite database.
- A real mobile chat follow-up then exposed CloudCLI's default `claude` binary lookup running outside the inherited CLI PATH. The workspace now passes the pinned native binary path explicitly as `CLAUDE_CLI_PATH`; the mobile follow-up returned the mock response and the selected routed model remained visible after a container restart.
- The local cross-device flow used a key-authenticated SSH shell, CloudCLI at a 390x844 Chromium viewport, browser VS Code, mock OmniRoute and a private Forgejo round-trip. It did not start the task from the native VS Code Desktop UI and does not count as Railway or physical-device acceptance.
