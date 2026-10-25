# GitHub Pages docs implementation plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Publish an English, searchable GitHub Pages manual from CloudDev AI's existing docs and expose a safe, current operational release-status view.

**Architecture:** Use Material for MkDocs 9.8.0 in an isolated, fully locked documentation environment. Preserve `docs/` as the source of truth. Generate a compact gate-status page from `GATES.md`, build strictly, scan the static artifact, and use a SHA-pinned GitHub Actions workflow that grants write permissions only to the Pages deployment job and deploys only `main`.

**Tech Stack:** MkDocs Material, uv lockfile, Node.js documentation generator/tests, GitHub Pages, GitHub Actions.

---

### Task 1: Add testable release-status generation

**Files:**
- Create: `scripts/generate-docs-status.mjs`
- Create: `tests/unit/docs-site.test.mjs`
- Modify: `package.json`
- Modify: `.gitignore`

1. Write tests for parsing checked and unchecked gate rows, safe table rendering, and omission of evidence/commands.
2. Run `node --test tests/unit/docs-site.test.mjs` and confirm the missing implementation fails.
3. Implement a pure parser/renderer and a CLI that writes `docs/operations/RELEASE_STATUS.md` from `GATES.md`.
4. Ignore only the generated status page and local docs build/virtualenv outputs.
5. Run the focused tests and verify a sample status page contains no `EVIDENCE` values or filesystem paths.

### Task 2: Add the documentation portal and operations guides

**Files:**
- Create: `mkdocs.yml`
- Create: `docs/index.md`
- Create: `docs/getting-started.md`
- Create: `docs/operations/CONTROL_PLANE.md`
- Create: `docs/operations/TROUBLESHOOTING.md`
- Modify: `docs/operations/RAILWAY_MARKETPLACE.md`
- Modify: `README.md`

1. Add a complete nav for setup, architecture, Railway deployment, variables, cross-device use, security, privacy, operations, backups, troubleshooting, and upstream licenses.
2. Document the ownership boundary between IaC values, Template Composer inputs, private service references, and post-deploy provider setup.
3. Link the generated release status page and the source `GATES.md`.
4. Add a real Pages URL only after a Pages deployment is observed. Until then, label the target URL as pending.

### Task 3: Lock and locally verify the documentation build

**Files:**
- Create: `docs-site/pyproject.toml`
- Create: `docs-site/uv.lock`
- Modify: `package.json`
- Create: `scripts/check-docs-artifact.mjs`

1. Pin Material for MkDocs to 9.8.0 and lock all transitive dependencies with hashes for Python 3.13.
2. Configure strict MkDocs link/nav checking, a project-relative `site_url`, and no analytics or remote custom scripts.
3. Add `docs:generate`, `docs:build`, and `docs:check` commands.
4. Test the artifact checker against safe output and fixture cases containing forbidden files or secret-shaped strings.
5. Run a full local site build, verify generated search/nav pages, and inspect the artifact file list.

### Task 4: Add a restricted GitHub Pages workflow

**Files:**
- Create: `.github/workflows/docs.yml`
- Modify: `tests/unit/docs-site.test.mjs`
- Modify: `GATES.md`

1. Pin checkout, setup-python, upload-pages-artifact, download-artifact, and deploy-pages to verified commit SHAs.
2. Build and artifact-check on pull requests and `main` pushes without write permissions.
3. Deploy only `main` pushes or a manual dispatch whose ref is `main`, in the `github-pages` environment with only `pages: write` and `id-token: write`.
4. Test the workflow contract, default-branch deployment guard, least-privilege permissions, and immutable action refs.
5. Document that the repository Pages source must be set to GitHub Actions by a repository administrator.

### Task 5: Publish and verify the public portal

**Files:**
- Modify: `README.md`
- Modify: `GATES.md`

1. Enable Pages with the `Schero94` repository owner only after verifying the exact public artifact content.
2. Push to `main`, observe the Actions run and deployment URL, and verify the final public page in a browser.
3. Mark the live Pages gate complete only after the deployed site returns the new docs and current gate status.
4. Leave Railway deployment, Marketplace, image security, native-device, and restore gates independent and open.
