# Gates: shared workspace runtime

Scope: code-server, CloudCLI, coding agents, browser proxy, key-only SSH and durable recovery in one Railway workspace service.

- [x] G1: CloudCLI version and persistent DB/session paths match verified upstream metadata and runtime source.
  CHECK: node --test services/ide/test/cloudcli-runtime.integration.test.mjs
  EXPECT: pass
  EVIDENCE: Pinned CloudCLI 1.37.5 test passed in the Node 24 image, including SQLite session discovery and a detached terminal transcript.

- [x] G2: CloudCLI and code-server are behind Caddy authentication, and both routes pass browser/WebSocket smoke tests.
  CHECK: node --test services/ide/test/caddy-proxy.integration.test.mjs
  EXPECT: pass
  EVIDENCE: The pinned Caddy proxy integration passed through `npm run test:cross-device`.

- [x] G3: sshd is key-only, root login is disabled, authorized keys are root-owned, and the host fingerprint persists.
  CHECK: node --test services/ide/test/authorized-keys.test.mjs services/ide/test/ssh-account-state.test.mjs
  EXPECT: pass
  EVIDENCE: Both policy suites passed in `npm test`; the root-owned authorized-key assertion passed inside the built image during `./scripts/verify-local.sh`. The local key-only SSH endpoint returned the launchpad fingerprint.

- [x] G4: `/workspace` contains persistent home and projects, with runtime services running unprivileged.
  CHECK: node --test services/ide/test/service-environment.test.mjs services/ide/test/image-config.test.mjs
  EXPECT: pass
  EVIDENCE: Both suites passed in `npm test`; live local checks confirmed the `/workspace/home` account home and project path.

- [x] G5: boot reconciliation marks formerly running tasks interrupted and exposes no unsupported auto-replay.
  CHECK: node --test services/ide/test/task-registry.test.mjs
  EXPECT: pass
  EVIDENCE: The task-registry suite passed in `npm test`; `npm run test:recovery` restarted the local IDE and confirmed interrupted state without a surviving tmux process or automatic replay.
