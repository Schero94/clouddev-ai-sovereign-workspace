# CloudDev AI acceptance gates

No gate is complete until its verification was run and evidence was recorded.
The always-on cross-device flow is a release-blocking product requirement.

- [x] G1: Current CloudCLI package, auth boundary, workspace discovery and session recovery behavior are verified against the pinned upstream release.
  CHECK: node --test services/ide/test/cloudcli-runtime.integration.test.mjs
  EXPECT: pass
  EVIDENCE: `npm run test:session-handoff` passed against CloudCLI 1.37.5 in the built Node 24 image. It verified a provider transcript indexed into the shared project and a client-disconnected run retained in the task registry.

- [x] G2: IDE, CloudCLI, Codex, Claude Code, SSH, agent configuration, projects and task state use one persistent `/workspace` mount; application processes other than sshd/supervisor run as UID 1000 without capabilities.
  CHECK: npm test
  EXPECT: pass
  EVIDENCE: `npm test` passed: 113 passed, 0 failed, 3 skipped. Image and runtime tests assert the shared mount paths, unprivileged UIDs and restricted process capabilities.

- [x] G3: Every browser route is authenticated, SSH accepts keys only, and no shared service port or administrator secret is exposed to agent processes.
  CHECK: npm run test:security
  EXPECT: pass
  EVIDENCE: `npm run test:security` passed across 85 source files. `CLOUDDEV_VERIFY_RESTART=1 node scripts/verify-local.mjs` also passed live local browser auth, anonymous inference denial, key-only SSH and isolated environment checks.

- [ ] G4: CloudCLI is protected by authenticated TLS proxying and serves alongside VS Code at `/vscode/`; WebSocket upgrades work.
  CHECK: npm run test:cross-device
  EXPECT: pass
  EVIDENCE: Partial local check only. `npm run test:cross-device` verifies cookie gating, bearer-token preservation and WebSocket upgrade over local HTTP. Railway-generated HTTPS and the deployed auth edge remain unverified.

- [ ] G5: Starting Codex or Claude from native VS Code produces a session CloudCLI can discover and resume, and follow-up changes share the same project files.
  CHECK: npm run test:session-handoff
  EXPECT: pass
  EVIDENCE: Partial local acceptance on 2026-10-25. A detached Claude Code task started through key-authenticated SSH was indexed in CloudCLI, followed up from mobile, and its file change appeared in browser VS Code and Forgejo. The task was not started from native VS Code Desktop; Railway acceptance is open.
  EVIDENCE: ℹ todo 0 | ℹ duration_ms 252.938527

- [x] G6: Agent activity continues after browser/desktop disconnect. Restart handling marks in-flight work interrupted and exposes supported recovery without claiming a killed process continued.
  CHECK: npm run test:recovery
  EXPECT: pass
  EVIDENCE: `npm run test:recovery` passed. It detached a process from the SSH client, then restarted the IDE, preserved the workspace file, marked registered work interrupted, and verified the old tmux process was gone. A CloudCLI session and its routed model remained visible after the local container restart.

- [x] G7: Forgejo, PostgreSQL, OmniRoute and the always-on workspace start locally with required persistence, health and authentication behavior.
  CHECK: ./scripts/verify-local.sh
  EXPECT: pass
  EVIDENCE: `./scripts/verify-local.sh` passed after the SSH keyscan probe was restricted to the image's configured Ed25519 host key. The stack rebuilt, all services reached healthy state, local authentication and the shared workspace passed, and no paid provider was used.

- [x] G8: A real private Forgejo repository round-trip works from the shared workspace and persists across restart.
  EVIDENCE: `CLOUDDEV_FORGEJO_SOURCE_FILE=/workspace/projects/.clouddev-cross-device.obnVqD/cross-device-acceptance.txt npm run test:forgejo-roundtrip` passed with a regular non-admin account. The mobile-edited file was cloned, committed, pushed, fetched and checked after a Forgejo restart. The script removed its temporary user and clone.

- [x] G9: A mock LLM endpoint verifies authenticated model listing and full Codex/Claude request forwarding through OmniRoute without paid API calls.
  EVIDENCE: `npm run test:mock-provider` passed with live Codex CLI and Claude Code CLI requests, OpenAI-compatible and Anthropic streaming, model access restrictions and anonymous inference denial. No paid provider API was used.

- [x] G10: Railway IaC type-checks against the current pinned official package.
  CHECK: npm run check:railway
  EXPECT: pass
  EVIDENCE: `npm run check:railway` passed with Railway 3.16.0 and TypeScript 7.0.2.

- [ ] G11: A safe `railway config plan` in a dedicated fresh test project shows the expected services, volumes, references, TCP proxy, and no destructive changes.
  EVIDENCE: Open. Read-only `railway status --json` shows the linked `clouddev-ai-validation` project is empty and belongs to a shared business workspace, not the intended personal-account target. No plan was applied and no services were created.

- [ ] G12: A fresh Railway deployment in `europe-west4-drams3a` proves TCP SSH, public HTTPS auth, no serverless sleep, shared storage, desktop/mobile handoff and recovery after service restart.
  EVIDENCE: pending

- [ ] G13: Restore drills prove the workspace, Forgejo, PostgreSQL and OmniRoute data can be recovered from documented backups.
  EVIDENCE: pending

- [ ] G14: Marketplace template is created, published, and successfully test-deployed. No template ID or verified badge is claimed before Railway confirms it.
  EVIDENCE: pending

- [ ] G15: OmniRoute dashboard dependency vulnerabilities are patched in a rebuilt upstream image and authenticated runtime checks pass before its public domain is enabled.
  EVIDENCE: Open on 2026-10-25. `npm audit --json` on the pinned OmniRoute CLI lock reported 10 advisories: 6 low, 1 moderate, 1 high, and 2 critical. The current upstream package and image remain at `3.8.52`; the published package declares Next.js `16.3.8` and DOMPurify `^3.4.14`. No Docker image vulnerability scanner is installed, so the full published image has not been scanned. A runtime-only Next.js overlay failed startup and was removed. See `services/omniroute/README.md`; do not deploy publicly until upstream ships a patched image or a full source rebuild passes the stated gates.

- [x] G16: Every IaC `preserve()` variable has an explicit Railway Template Composer value or a documented operator input. Generated credentials use per-deployment `secret()` functions; provider master keys are excluded.
  CHECK: npm run check:railway-template
  EXPECT: pass
  EVIDENCE: `npm run check:railway-template` passed on 2026-10-25. The test matches all 11 `preserve()` entries against `.railway/template-variables.json`, validates the generated-secret expression and required SSH public-key input, checks declared persistent mounts, and rejects provider master-key fields. Live Composer configuration remains unverified.
