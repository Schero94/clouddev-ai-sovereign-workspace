# GitHub Pages documentation design

## Goal

Give CloudDev AI one public documentation site with a clear deployment path and a current, safe-to-publish view of release readiness.

## Current context

The repository already has detailed guides under `docs/operations`, `docs/security`, and `docs/privacy`, plus an English README and the acceptance ledger in `GATES.md`. There is no documentation navigation, local site build, documentation workflow, or GitHub Pages publishing source. The repository is public and does not yet have a Pages site configured.

## Approaches considered

1. Publish the repository's Markdown with GitHub's default Jekyll workflow. This adds little tooling, but provides weak control over navigation and consistency across the existing nested documents.
2. Build a static site from the repository's Markdown with Material for MkDocs. This adds a pinned Python documentation toolchain, but reuses the source files and provides navigation, search, strict link checks, and one operator-facing control page.
3. Use Zensical, the successor from the Material team. It is actively developed, but its official versioning documentation still describes 0.0.x alpha releases.

The chosen approach is Material for MkDocs pinned at the current security release, 9.8.0. Its upstream support ends on 2027-05-05. The project will keep an explicit migration review for Zensical and will not silently take unpinned generator updates.

## Site and control surface

- Keep the existing `docs/` tree as the source of technical and privacy content.
- Add a navigation index, a first-deployment guide, an operations control-plane guide, and a troubleshooting guide.
- Generate a release-status page from gate identifiers, titles, and checked state in `GATES.md`. Do not publish raw gate evidence, commands, local paths, environment values, or secrets from that file.
- Build with `mkdocs --strict` and run an artifact allowlist/content check before upload.
- Build on pull requests and pushes to `main`. Deploy only after a successful build on `main` or a manual workflow dispatch targeting `main`.
- Pin GitHub Actions to verified commit SHAs and keep deploy permissions confined to the Pages deployment job.
- Publish only the generated site artifact. GitHub Pages is public, so repository credentials and hidden files must never enter the artifact.

## Operations and failure behavior

The control-plane page will distinguish Railway IaC defaults, Template Composer inputs, operator-owned provider setup, and live runtime actions. It will link the current release ledger and state which gates are local, Railway-live, or externally controlled. If Pages has not been enabled, the checked-in workflow remains testable and the Pages settings step stays open. A successful local build or GitHub Actions build is not a published-site claim.

## Verification

- Unit-test the release-status parser, status rendering, sensitive-evidence exclusion, and workflow security constraints.
- Build the documentation locally in strict mode using the pinned lockfile.
- Verify the generated artifact has an index, expected navigation, and no `.env`, secrets, database files, backups, or evidence snippets.
- Verify the workflow only deploys from `main`, separates build and deploy permissions, and pins all actions by SHA.
- After publication, read back the Pages site URL and inspect the deployed documentation in a browser.

## Approval and scope

The request to add GitHub Pages documentation and improve operational control, followed by "mach weiter", authorizes this design and its implementation. The site does not change the workspace runtime, Railway resources, provider credentials, or any production setting.
