# CloudDev AI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build and verify the single-user CloudDev AI workspace locally and provide reproducible Railway IaC and Marketplace configuration.

**Architecture:** Four stateful/core Railway services provide the IDE, Forgejo, PostgreSQL, and OmniRoute. A small, separately authenticated launchpad links those interfaces and reports health. Docker Compose exercises the full stack locally. No SSO, Docker socket, platform token, or paid-provider call is included.

**Tech Stack:** code-server, Forgejo, PostgreSQL, OmniRoute, Node.js LTS, TypeScript Railway IaC, Docker Compose, shell wrappers, Node's built-in test runner.

---

### Task 1: Establish repository conventions and acceptance gates

**Files:**
- Create: `AGENTS.md`
- Create: `docs/plans/2026-10-24-clouddev-ai-design.md`
- Create: `docs/plans/2026-10-24-clouddev-ai-implementation.md`
- Create: `GATES.md`
- Create: `.gitignore`

**Steps:**
1. Record the product boundaries, security invariants, and test commands in `AGENTS.md` and `GATES.md`.
2. Run a repository scan for leaked secrets and forbidden legacy Railway config.
3. Initialize the repository and commit the design baseline before implementation.

### Task 2: Implement the authenticated launchpad test-first

**Files:**
- Create: `services/launchpad/package.json`
- Create: `services/launchpad/src/server.mjs`
- Create: `services/launchpad/src/server.test.mjs`
- Create: `services/launchpad/Dockerfile`

**Steps:**
1. Add failing tests for unauthenticated rejection, valid Basic authentication, malformed service URLs, health timeouts, and redacted errors.
2. Run `node --test services/launchpad/src/server.test.mjs` and confirm the expected failures.
3. Implement a minimal server with strict environment validation, bounded health probes, constant-time credential comparison, rate limiting, security headers, and no secret-bearing logs.
4. Re-run tests and inspect responses for headers and accidental credential disclosure.

### Task 3: Build the non-root persistent IDE image

**Files:**
- Create: `services/ide/Dockerfile`
- Create: `services/ide/entrypoint.sh`
- Create: `services/ide/bashrc`
- Create: `services/ide/scripts/ai-codex`
- Create: `services/ide/scripts/ai-claude`
- Create: `services/ide/scripts/ai-status`
- Create: `services/ide/scripts/ai-models`
- Create: `services/ide/scripts/ai-setup`
- Create: `services/ide/scripts/ai-wrappers.test.sh`
- Create: `services/ide/workspace/.vscode/tasks.json`

**Steps:**
1. Write wrapper tests for missing gateway, missing key, unavailable models, CLI exit propagation, and persistent model selection.
2. Run the wrapper tests and confirm expected failures.
3. Build on a versioned code-server image, install pinned Node.js LTS, Python, Git, OpenSSH, build tools, pnpm, Codex CLI, Claude Code CLI, and OmniRoute CLI. Run the service as the non-root code-server user.
4. Add wrappers that fail closed, avoid printing tokens, and store user-selected models in persistent home storage.
5. Re-run tests, build the image, and inspect its configured user, tools, and extension source.

### Task 4: Configure Forgejo and PostgreSQL safely

**Files:**
- Create: `services/forgejo/app.ini`
- Create: `services/forgejo/entrypoint.sh`
- Create: `services/forgejo/entrypoint.test.sh`

**Steps:**
1. Test configuration rendering, disabled registration, sign-in-required viewing, private repository defaults, and idempotent admin creation.
2. Implement a non-root Forgejo container with PostgreSQL settings supplied at runtime and an idempotent documented CLI bootstrap.
3. Keep admin credentials out of IDE variables, stdout, and Git.
4. Run static tests and build the image.

### Task 5: Pin and configure OmniRoute

**Files:**
- Create: `services/omniroute/README.md`
- Create: `services/omniroute/healthcheck.sh`
- Create: `services/omniroute/healthcheck.test.sh`

**Steps:**
1. Verify the pinned image digest, supported persistent data directory, startup password behavior, health endpoint, and supported remote CLI commands against the selected release.
2. Add tests for production configuration, persistent SQLite path, and startup health behavior.
3. Wire health checks and documentation without emitting provider secrets or prompts.
4. Run the health tests and a container startup check.

### Task 6: Assemble local Compose and integration tests

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `scripts/dev-env.sh`
- Create: `scripts/verify-local.sh`
- Create: `tests/integration/local-stack.test.mjs`
- Create: `tests/integration/mock-provider.mjs`

**Steps:**
1. Add integration tests for service health, private repository create/clone/commit/push, mock OpenAI-compatible inference, and persistence across container restart.
2. Start the stack and confirm the tests fail for the missing services.
3. Add isolated volumes, health checks, service-only networking, and generated local secrets without committing `.env`.
4. Run builds and the full local integration suite. Do not call paid APIs.

### Task 7: Add Railway IaC

**Files:**
- Create: `.railway/railway.ts`
- Create: `.railway/package.json`
- Create: `.railway/README.md`
- Create: `scripts/check-railway-iac.sh`

**Steps:**
1. Type-check the authoring file against the pinned official `railway` package.
2. Declare the four core services plus launchpad, PostgreSQL, private references, separate persistent volumes, EU West placement, and health checks.
3. Keep generated secrets and public domains in Template Composer-managed configuration. Document this ownership boundary.
4. Run the type checker and `railway config plan` only when a project is linked; never apply the plan without an explicit deployment request.

### Task 8: Write operator, security, privacy, and release documentation

**Files:**
- Create: `README.md`
- Create: `SECURITY.md`
- Create: `LICENSE`
- Create: `docs/privacy/DATA_FLOW.md`
- Create: `docs/privacy/GDPR_READINESS.md`
- Create: `docs/privacy/SUBPROCESSORS.md`
- Create: `docs/privacy/DPA_CHECKLIST.md`
- Create: `docs/security/THREAT_MODEL.md`
- Create: `docs/security/SECURITY_HARDENING.md`
- Create: `docs/security/BACKUP_RESTORE.md`
- Create: `docs/operations/RAILWAY_MARKETPLACE.md`
- Create: `docs/operations/UPSTREAM_LICENSES.md`

**Steps:**
1. Document verified configuration and separate platform, provider, and operator responsibilities.
2. Include tested and untested gates separately, backup restore commands, resource estimates as estimates, and the actual template publication process.
3. Review all user-facing copy and scan for unsupported compliance claims, invented test results, and accidental secrets.

### Task 9: Run final local acceptance and report open gates

**Files:**
- Modify: `GATES.md`
- Modify: `README.md`

**Steps:**
1. Run formatting, unit tests, security scans, image builds, Compose health checks, and integration tests.
2. Record exact command output, test count, and any unavailable checks.
3. Verify Git status, tracked files, and commit history.
4. Keep Railway deploy, Marketplace publication, and restore-drill claims open unless those exact operations succeeded.
