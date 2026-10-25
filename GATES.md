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
  EVIDENCE: `npm test` passed on 2026-10-25: 115 passed, 0 failed, 3 skipped. Image and runtime tests assert the shared mount paths, unprivileged UIDs and restricted process capabilities.

- [x] G3: Every browser route is authenticated, SSH accepts keys only, and no shared service port or administrator secret is exposed to agent processes.
  CHECK: npm run test:security
  EXPECT: pass
  EVIDENCE: `npm run test:security` passed across 86 source files. `CLOUDDEV_VERIFY_RESTART=1 node scripts/verify-local.mjs` also passed live local browser auth, anonymous inference denial, key-only SSH and isolated environment checks.

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
  EVIDENCE: Open on 2026-10-25. `railway whoami --json` and `railway project list --json` show access only to the Joulee Tech workspace. The linked `clouddev-ai-validation` project is empty and is not the intended personal-account target. No plan was applied and no services were created.

- [ ] G12: A fresh Railway deployment in `europe-west4-drams3a` proves TCP SSH, public HTTPS auth, no serverless sleep, shared storage, desktop/mobile handoff and recovery after service restart.
  EVIDENCE: Open. No fresh personal-account Railway project is available to deploy into. No live domains, proxies, volumes, sleep settings, or cross-device behavior are claimed.

- [ ] G13: Restore drills prove the workspace, Forgejo, PostgreSQL and OmniRoute data can be recovered from documented backups.
  EVIDENCE: Partial local evidence on 2026-10-25. A logical dump of the local Forgejo database was restored into an isolated PostgreSQL 18.6 container, and 131 application tables matched. The test did not include role state, the Forgejo volume, workspace files, or OmniRoute; see `docs/security/BACKUP_RESTORE.md`. G13 remains open.

- [ ] G14: Marketplace template is created, published, and successfully test-deployed. No template ID or verified badge is claimed before Railway confirms it.
  EVIDENCE: Open. No Railway template ID or URL exists. Creation and publication are held until the intended Railway workspace is available and image-security gates G15/G17 are closed.

- [ ] G15: OmniRoute dashboard dependency vulnerabilities are patched in a rebuilt upstream image and authenticated runtime checks pass before its public domain is enabled.
  EVIDENCE: Open on 2026-10-25. Trivy 0.76.1 scanned the built local router image and found 2 critical and 48 high package findings, including two unique critical Next.js advisories in pinned Next.js 16.3.8. The public OmniRoute release remains 3.8.52, and upstream main still declares Next.js 16.3.8. Full results and image ID are in `docs/security/IMAGE_SCAN.md`. No patched router image or full source rebuild has passed health, authentication, inference, and dependency checks.

- [x] G16: Every IaC `preserve()` variable has an explicit Railway Template Composer value or a documented operator input. Generated credentials use per-deployment `secret()` functions; provider master keys are excluded.
  CHECK: npm run check:railway-template
  EXPECT: pass
  EVIDENCE: `npm run check:railway-template` passed 4 tests on 2026-10-25. Tests match all 11 `preserve()` entries against `.railway/template-variables.json`, enforce the exact ten generated-secret names and one required SSH public-key input, document all 57 IaC application variables, exclude provider API keys, and verify GitHub sources for the three app services. This verifies the checked-in Composer specification, not a live Railway template, which remains uncreated.

- [ ] G17: All four local Compose images are scanned, high and critical findings are triaged, and the exact release images pass the documented deployment security criteria.
  CHECK: npm run scan:images
  EXPECT: exit 0 after each local image has no remaining high or critical findings.
  EVIDENCE: Open on 2026-10-25. Trivy 0.76.1 scanned all four running local Compose images. The rebuilt IDE candidate moved `shell-quote` from 1.10.0 to 1.11.0 and removed that critical finding; it still has 5 unique critical and 122 unique high CVEs, including Next.js/DOMPurify and OS findings. The CLI lockfile overrides Next.js 16.4.3, DOMPurify 3.4.17, and Zod 4.6.6; its npm audit reports zero high/critical advisories, but the lockfile has not been rebuilt into the image. PostgreSQL 18.6 is pinned in Compose and passed an isolated startup check. The running database remains 18.1; its logical dump restored to a temporary 18.6 target with 131 matching Forgejo tables. Full image scans, the managed Railway database, and complete four-store restore remain open. See `docs/security/IMAGE_SCAN.md` and `docs/security/BACKUP_RESTORE.md`.
