# CloudDev AI acceptance gates

No gate is complete until its verification was run and evidence was recorded.
The always-on cross-device flow is a release-blocking product requirement.

- [x] G18: Public documentation builds from the existing Markdown sources with strict navigation/link validation and no private build inputs in the artifact.
  CHECK: npm run docs:build
  EXPECT: /Documentation built in/
  EVIDENCE: `npm run docs:check` passed on 2026-10-25. MkDocs Material 9.8.0 built with strict navigation/link validation, the artifact scanner checked all 65 generated files (3.2 MiB) for hidden paths and credential-shaped strings, and `pip-audit` reported no known vulnerabilities in the locked docs environment. Browser preview returned the site and release-status page without horizontal overflow or console errors.

- [x] G19: The operations overview reports current release-gate status without publishing raw evidence, local paths, or secrets.
  CHECK: node --test tests/unit/docs-site.test.mjs
  EXPECT: /# fail 0/
  EVIDENCE: `node --test tests/unit/docs-site.test.mjs` passed all 6 tests on 2026-10-25. Tests cover gate parsing, duplicate/malformed rows, HTML escaping, evidence omission, artifact path/credential checks, operator navigation, and SHA-pinned workflow permissions/deploy guards.

- [x] G20: GitHub Pages is enabled for the public repository and the latest `main` build is available at the GitHub Pages URL.
  EVIDENCE: Pages workflow `40243212219` succeeded for `main` commit `1643fb465d7a7e25c851ae76437c4c465a5bc676`. The live release-status page returned HTTP 200 and reported 16/24 gates while G20 was still open in that commit. Playwright verified the published home page at 1440 px and 390 px, both launchpad screenshots loaded, document width stayed below the viewport width, and the browser reported 0 errors and 0 warnings. The next docs build regenerates the status page from the updated gate ledger.

- [x] G21: Markdown, documentation assets, and local browser/agent state are excluded from every declared Docker build context.
  CHECK: npm run check:docker-context
  EXPECT: pass
  EVIDENCE: `npm run check:docker-context` passed all 5 tests on 2026-10-25 after excluding `examples/`. Tests cover the root and nested contexts, Markdown variants, local browser/agent state, explicit Dockerfile copy paths, configurable preview ports, and absence of a container-publishing workflow. No new image build ran because the Docker CLI's configured Colima socket is unavailable. Registry history remains unverified: Docker Hub lookup returned 404, and the GitHub Packages token lacks `read:packages`.

- [x] G1: Current CloudCLI package, auth boundary, workspace discovery and session recovery behavior are verified against the pinned upstream release.
  CHECK: node --test services/ide/test/cloudcli-runtime.integration.test.mjs
  EXPECT: pass
  EVIDENCE: `npm run test:session-handoff` passed against CloudCLI 1.37.5 in the built Node 24 image. It verified a provider transcript indexed into the shared project and a client-disconnected run retained in the task registry.

- [x] G2: IDE, CloudCLI, Codex, Claude Code, SSH, agent configuration, projects and task state use one persistent `/workspace` mount; application processes other than sshd/supervisor run as UID 1000 without capabilities.
  CHECK: npm test
  EXPECT: pass
  EVIDENCE: `npm test` passed on 2026-10-25: 124 passed, 0 failed, 3 skipped. Image and runtime tests assert the shared mount paths, unprivileged UIDs and restricted process capabilities.

- [x] G3: Every browser route is authenticated, SSH accepts keys only, and no shared service port or administrator secret is exposed to agent processes.
  CHECK: npm run test:security
  EXPECT: pass
  EVIDENCE: `npm run test:security` passed across 89 source files. `CLOUDDEV_VERIFY_RESTART=1 node scripts/verify-local.mjs` also passed live local browser auth, anonymous inference denial, key-only SSH and isolated environment checks.

- [ ] G4: CloudCLI is protected by authenticated TLS proxying and serves alongside VS Code at `/vscode/`; WebSocket upgrades work on the Railway HTTPS domain.
  EVIDENCE: Partial local evidence only. `npm run test:cross-device` passed the pinned Caddy cookie gate, CloudCLI Bearer-token handling and WebSocket upgrade over local HTTP. Railway-generated HTTPS and the deployed auth edge have not been tested.

- [ ] G5: Starting Codex or Claude from native VS Code produces a session CloudCLI can discover and resume, and follow-up changes share the same project files.
  EVIDENCE: Partial local evidence only. `npm run test:session-handoff` passed the pinned CloudCLI session-indexing integration, but the current mobile follow-up was not started from native VS Code Desktop and the full handoff has not been tested on Railway.

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

- [x] G11: A safe `railway config plan` in a dedicated fresh test project shows the expected services, volumes, references, TCP proxy, and no destructive changes.
  EVIDENCE: Railway CLI 5.70.0 plan passed on 2026-10-25 in a newly created, empty validation project in the confirmed personal workspace. The current graph was empty and the plan showed exactly four service/database creates, three volume creates, EU West, private references, TCP proxies, `sleepApplication: false`, and no deletes. The plan was not applied. Project identifiers are intentionally omitted from this public ledger.

- [ ] G12: A fresh Railway deployment in `europe-west4-drams3a` proves TCP SSH, public HTTPS auth, no serverless sleep, shared storage, desktop/mobile handoff and recovery after service restart.
  EVIDENCE: Open. A dedicated empty validation project exists in the personal workspace, but it has no services or deployment. No live domains, proxies, volumes, sleep settings, or cross-device behavior are claimed.

- [x] G13: Restore drills prove the workspace, Forgejo, PostgreSQL and OmniRoute data can be recovered from documented backups.
  CHECK: npm run test:encrypted-restore
  EXPECT: /# tests 2\n# suites 0\n# pass 2\n# fail 0\n# cancelled 0\n# skipped 0/
  EVIDENCE: `npm run test:encrypted-restore` passed on 2026-10-25 using an ephemeral age 1.3.2 test identity. It encrypted five artifacts covering four stores, restored PostgreSQL globals/database, workspace, Forgejo volume and OmniRoute SQLite, verified markers, roles, SQLite integrity and user tables, and confirmed existing containers were unchanged. This is a local fixture restore, not a Railway restore or recovery of existing user data.

- [ ] G14: Marketplace template is created, published, and successfully test-deployed. No template ID or verified badge is claimed before Railway confirms it.
  EVIDENCE: Open. No Railway template ID or URL exists. Creation and publication are held until image-security gates G15/G17 are closed and the fresh template has been test-deployed in the personal workspace.

- [ ] G15: OmniRoute dashboard dependency vulnerabilities are patched in a rebuilt upstream image and authenticated runtime checks pass before its public domain is enabled.
  EVIDENCE: Open on 2026-10-26. The exact local Compose candidate image `sha256:b8a2191a8b9c5b4287fe329e9662b436b2e874c34766dc9e0613b9ef3d089bcc` has 2 critical and 48 high findings, including two critical Next.js advisories in 16.3.8. The newest published stable release checked is 3.8.52. The `release/v3.8.53` source declares Next.js 16.4.2 and DOMPurify 3.4.17, but no versioned image had been published when checked; the current `next` image still uses Next.js 16.3.8. Upstream Release acceptance run `40238715433` remained queued at 00:00 CET. Do not deploy the moving tag. No patched image has passed health, authentication, inference, and persistence checks. Details and source links are in `docs/security/IMAGE_SCAN.md`.

- [x] G16: Every IaC `preserve()` variable has an explicit Railway Template Composer value or a documented operator input. Generated credentials use per-deployment `secret()` functions; provider master keys are excluded.
  CHECK: npm run check:railway-template
  EXPECT: pass
  EVIDENCE: `npm run check:railway-template` passed 4 tests on 2026-10-25. Tests match all 11 `preserve()` entries against `.railway/template-variables.json`, enforce the exact ten generated-secret names and one required SSH public-key input, document all 57 IaC application variables, exclude provider API keys, and verify GitHub sources for the three app services. This verifies the checked-in Composer specification, not a live Railway template, which remains uncreated.

- [ ] G17: All four local Compose images are scanned, high and critical findings are triaged, and the exact release images pass the documented deployment security criteria.
  CHECK: npm run scan:images
  EXPECT: /No HIGH or CRITICAL vulnerabilities were found in the configured Compose candidate images/
  EVIDENCE: Open on 2026-10-26. `npm run scan:images` rebuilt the three Dockerfile-backed candidates sequentially, pulled the pinned PostgreSQL 18.6 digest, resolved the configured image references to immutable IDs, and exited 1. Results: OmniRoute `sha256:b8a2191a8b9c5b4287fe329e9662b436b2e874c34766dc9e0613b9ef3d089bcc` 2 critical / 48 high; IDE `sha256:af99cbfb7b878cfc996c2533a0b06efb6895f2329ea220a3def04516826ffb57` 4 critical / 250 high; Forgejo `sha256:9c7edcf4ddcc7bac6cc25930968bca44def6898adea458f138c50e7e10eb2405` 0 critical / 4 high; PostgreSQL 18.6 `sha256:898c60cb390d1085bc97bdd6a1ae968757421df394b071848b52b1c09c89d6a5` 1 critical / 26 high. Trivy found 2, 2, 0, and 1 unique critical IDs respectively. Existing Compose containers were not restarted; the local database service remains on 18.1. Details are in `docs/security/IMAGE_SCAN.md`.

- [x] G22: Off-platform backup artifacts are encrypted to an operator-controlled recipient without plaintext archives on durable storage, and an isolated restore validates all four local stores.
  CHECK: npm run test:encrypted-backup
  EXPECT: /# tests 9\n# suites 0\n# pass 9\n# fail 0\n# cancelled 0\n# skipped 0/
  EVIDENCE: `npm run test:encrypted-backup` passed 9/9 tests on 2026-10-25 with age 1.3.2 and locally pinned restore images. The integration generated a temporary key, encrypted the workspace, Forgejo volume, PostgreSQL database and globals, and OmniRoute fixture, restored them in a separate Compose project, then removed only its test containers, volumes and key.

- [ ] G23: Public repository metadata and the documentation crawl/social cards are read back from the published site, and the repository social preview is uploaded.
  EVIDENCE: GitHub description, homepage, and 13 topics were read back. Pages workflow `40243212219` succeeded for commit `1643fb465d7a7e25c851ae76437c4c465a5bc676`; the live site includes `robots.txt`, a sitemap, page-specific Open Graph/Twitter tags, and the local 1200x630 social card. GitHub documents no API or `gh` command for the repository social preview. The 1200x630 PNG is 682,585 bytes and still needs upload at repository Settings > General > Social preview.

- [x] G24: An isolated application-level restore verifies a private Forgejo repository, its PostgreSQL roles, OmniRoute authentication/provider metadata, and workspace configuration.
  EVIDENCE: `npm run test:application-restore` passed 4/4 tests in 44 seconds on 2026-10-25. In generated isolated source and restore projects it created and restored a private Forgejo repo and checked non-admin API plus Git clone/fetch, restored PostgreSQL role and data, verified OmniRoute login and provider metadata, and checked persistent gateway/editor configuration. Existing containers were unchanged and all generated resources were cleaned. CloudCLI native-session resume is not verified by this fixture.
