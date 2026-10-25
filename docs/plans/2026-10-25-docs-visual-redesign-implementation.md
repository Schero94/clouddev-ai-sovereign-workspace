# Documentation visual redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the default-looking documentation landing page with a distinctive, responsive CloudDev AI design while keeping MkDocs Material, the documentation content, search, and navigation.

**Architecture:** Use the existing pinned Material for MkDocs site. Add a local stylesheet and SVG brand mark, use Markdown/HTML for the landing page, and extend the current Node test suite with source-level assertions. Do not add a frontend framework or remote assets.

**Tech Stack:** Material for MkDocs 9.8.0, Markdown, CSS, SVG, Node.js built-in test runner, Playwright CLI.

---

### Task 1: Add a failing design contract test

**Files:**
- Modify: `tests/unit/docs-site.test.mjs`
- Read: `mkdocs.yml`, `docs/index.md`

**Steps:**
1. Add assertions for the local stylesheet, SVG brand asset, dark-first theme, landing-page calls to action, cross-device labels, and accurate restart-recovery language.
2. Run `node --test tests/unit/docs-site.test.mjs` and confirm the new assertions fail because the assets and landing page are not present.

### Task 2: Implement the theme and landing page

**Files:**
- Modify: `mkdocs.yml`
- Modify: `docs/index.md`
- Create: `docs/stylesheets/landing.css`
- Create: `docs/assets/clouddev-mark.svg`

**Steps:**
1. Add the custom stylesheet, logo, and favicon to the existing MkDocs configuration.
2. Set a graphite-first palette while keeping the theme toggle and search.
3. Build the responsive hero, shared-workspace diagram, release-status/deployment actions, and documentation route cards.
4. Add responsive, keyboard-focus, and reduced-motion styles without external assets.
5. Run the focused unit test and fix any content or configuration failures.

### Task 3: Verify the generated site

**Files:**
- Inspect: `.docs-site/site/index.html`
- Inspect: `.docs-site/site/stylesheets/landing.css`

**Steps:**
1. Run `npm run docs:check` and confirm the strict build and artifact checker pass.
2. Serve the generated site locally with the repository's pinned MkDocs toolchain.
3. Use Playwright CLI to inspect desktop and mobile viewports, verify the two primary links, confirm the sidebar/search remain usable, and check for horizontal overflow.
4. Capture final desktop and mobile screenshots under `output/playwright/` if the CLI supports stable viewport sizing.

### Task 4: Review changes and report evidence

**Files:**
- Review: `mkdocs.yml`, `docs/index.md`, `docs/stylesheets/landing.css`, `docs/assets/clouddev-mark.svg`, `tests/unit/docs-site.test.mjs`

**Steps:**
1. Run the focused tests and `npm run docs:check` once more after visual fixes.
2. Inspect `git diff` and confirm unrelated user changes remain untouched.
3. Report executed checks separately from the live GitHub Pages deployment state.
