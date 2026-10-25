# Product launch readiness implementation plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Bring CloudDev AI's public product site, README, provider onboarding, security evidence, and Railway release materials to a consistent, verifiable launch standard.

**Architecture:** Keep the existing MkDocs Material site and Railway IaC. Add focused docs and genuine screenshots in `docs/`, preserve one source of truth for release readiness, and update GitHub metadata only after local content passes its checks. Keep image-security and live Railway gates open until measured evidence exists.

**Tech Stack:** MkDocs Material 9.8.0, Markdown, local SVG/CSS assets, Node.js built-in tests, Docker Compose, Playwright CLI, Railway CLI/MCP, GitHub CLI.

---

### Task 1: Establish release gates and provider boundaries

**Files:**
- Create: `gates/product-docs.md`
- Create: `gates/readme-discovery.md`
- Create: `gates/provider-onboarding.md`
- Create: `gates/security-release.md`
- Create: `gates/railway-marketplace.md`
- Modify: `PLAN.md` by appending a dated entry only

**Steps:**
1. Record a runnable gate for each requested deliverable and a separate manual gate for each live acceptance.
2. Record that ChatGPT-plan sign-in and API-key routing are distinct. Prohibit token extraction, account rotation, quota evasion, and shared credentials.
3. Run the gate checker in status-only mode and confirm each new gate is open with pending evidence.

### Task 2: Capture and design real product screenshots

**Files:**
- Create: `docs/assets/screenshots/`
- Create: `docs/assets/clouddev-social-preview.svg`
- Create: `tests/unit/docs-screenshots.test.mjs`
- Modify: `package.json`

**Steps:**
1. Confirm the Docker engine is available before starting the local stack.
2. Use Playwright CLI to capture the real launchpad, browser IDE, provider setup, and mobile UI at desktop and phone widths.
3. Capture the Railway Composer through the approved personal account if available. Otherwise use the current official Railway example with attribution or leave that live capture gate open.
4. Redact credentials, emails, account names, project identifiers, private repository content, and personal information before saving screenshots.
5. Add alt text, captions, and source/version context beside each image.
6. Add tests that fail for missing image files, empty alt text, and broken image references.

### Task 3: Build the documentation journey

**Files:**
- Modify: `docs/index.md`
- Create: `docs/features.md`
- Create: `docs/how-to/deploy-on-railway.md`
- Create: `docs/how-to/first-login.md`
- Create: `docs/how-to/connect-clients.md`
- Create: `mkdocs.yml` navigation entries
- Modify: `tests/unit/docs-site.test.mjs`

**Steps:**
1. Write failing contract tests for feature coverage, click-by-click instructions, screenshot references, captions, current release status, and honest limitations.
2. Make the landing page answer what CloudDev AI is, which interfaces share files, and how to start.
3. Write the Railway guide using current UI labels and the exact four services and Composer variables in the repository.
4. Document first login, desktop/browser/mobile connection, and recovery without implying shared editor-window state.
5. Build responsive pages from the current visual system with locally hosted CSS and images.
6. Run `npm run docs:check` and `npm test`.

### Task 4: Document provider compatibility safely

**Files:**
- Create: `docs/providers/COMPATIBILITY.md`
- Create: `docs/how-to/providers.md`
- Create: `tests/unit/provider-docs.test.mjs`

**Steps:**
1. Verify the pinned OmniRoute release's CLI setup commands, live provider catalog, and OAuth/API-key categories against official upstream docs.
2. Document Codex ChatGPT sign-in separately from OpenAI API-key routing through OmniRoute. Do not claim subscription proxying unless the pinned release and current official terms support it.
3. Document DeepSeek API onboarding and billing from DeepSeek's current official docs.
4. Explain that free/no-key providers are discovered through the current catalog and can change their availability, limits, and terms.
5. State that fallback routing must respect provider quotas and terms. Ban usage circumvention and credential sharing.
6. Run the provider-doc contract tests and `npm run test:mock-provider`; use no paid credentials.

### Task 5: Rewrite the README and improve repository discovery

**Files:**
- Modify: `README.md`
- Create: `tests/unit/readme-launch.test.mjs`
- Modify: `package.json`
- Update/read back: GitHub description, homepage, topics, social preview

**Steps:**
1. Write failing tests for verified features, screenshots, local quick start, provider guide, Railway setup, security, privacy, restore, costs, troubleshooting, licenses, changelog, and deploy-button state.
2. Rewrite the README in concise technical English with the actual screenshots and architecture.
3. Keep the pre-publication state explicit until Railway returns a real template URL. Do not invent a button URL or claim one-click verification.
4. Run README tests, `npm run docs:check`, and `git diff --check`.
5. Set GitHub description, homepage, and relevant topics using the Schero94 identity. Read the metadata back through the GitHub API. Upload the social preview only through a supported GitHub surface.

### Task 6: Close image-security blockers and verify the stack

**Files:**
- Modify only with evidence: `services/omniroute/Dockerfile`, `services/ide/Dockerfile`, lockfiles, or `scripts/scan-local-images.sh`
- Modify: `docs/security/IMAGE_SCAN.md`
- Modify tests only for changed build behavior

**Steps:**
1. Start Docker Engine and confirm it is healthy before building.
2. Re-scan exact pinned images and classify direct/transitive findings with primary-source links.
3. Patch only with an upstream supported image or a complete reproducible source rebuild. Do not override a package version inside prebuilt bundles.
4. Rebuild, scan all Compose images, and run health, auth, mock-inference, and persistence tests on the exact candidates.
5. Run `npm run test:security`, `npm run check:compose`, and `./scripts/verify-local.sh`.
6. Keep the release blocked if critical/high findings remain without a reviewed residual-risk decision.

### Task 7: Validate Railway IaC and prepare the Marketplace template

**Files:**
- Modify only if current docs/tests show a mismatch: `.railway/railway.ts`
- Modify: `.railway/template-variables.json`
- Modify: `docs/operations/RAILWAY_MARKETPLACE.md`
- Modify: `docs/operations/RAILWAY_TEMPLATE_VARIABLES.md`
- Modify: `tests/unit/railway-template-contract.test.mjs`

**Steps:**
1. Check current Railway Composer and IaC docs against the pinned `railway` package.
2. Run `npm run check:railway-template` and `npm run check:railway`.
3. Switch Railway CLI authentication to the Schero94 personal workspace before any plan or resource creation. Do not use the Joulee Tech workspace.
4. Confirm a dedicated empty personal test project, run `railway config plan`, and inspect every create/change/delete before applying.
5. Deploy only after image-security gates pass. Verify services, variables, region, domains, TCP proxy, volumes, and disabled sleeping.
6. Publish only after fresh-project acceptance and required restore checks pass. Insert the returned template URL into the README and docs.

### Task 8: Final browser, docs, and repository verification

**Files:**
- Review all changed docs, tests, and assets
- Update `GATES.md` and append evidence to `PLAN.md`

**Steps:**
1. Run `npm test`, `npm run test:security`, `npm run check:docker-context`, `npm run check:railway-template`, `npm run check:railway`, `npm run docs:check`, and Compose checks.
2. Capture and verify the actual public Pages site at desktop and phone sizes with Playwright CLI.
3. Read back GitHub description, homepage, topics, and the latest Pages workflow result.
4. Run fresh Railway, cross-device, security, and restore gates only in the dedicated personal test project.
5. Re-measure all reported counts and separate local checks from live Railway, Marketplace, and restore evidence.
