# Operations control plane

Use this page to find the source of truth before changing a deployment. Several settings belong to different systems. A passing repository check cannot confirm a Railway setting or a public Pages deployment.

## Setting ownership

| Setting or data | Source of truth | How to change it | How to verify |
| --- | --- | --- | --- |
| Railway IaC services, regions, internal references, volumes, health checks, no-sleep, and restart policy | `.railway/railway.ts` | Edit the IaC source and run `npm run check:railway`, then `railway config plan` in a dedicated test project | Review the full plan, then read back live service configuration after an approved apply |
| Generated secrets and operator SSH key | Railway Template Composer and `.railway/template-variables.json` | Set every generated value with its documented `secret()` expression; provide only the operator's public key | Run `npm run check:railway-template`; inspect the Composer draft before deployment |
| Public workspace and Forgejo domains | Railway Template Composer | Create HTTPS domains for ports 8080 and 3000; keep the workspace cookie gate and Forgejo sign-in enabled | Open each live domain and test anonymous rejection and signed-in access |
| Workspace and Forgejo SSH endpoints | Railway TCP proxy plus operator/client keys | Configure port 2222 proxies; use separate keys for Remote-SSH and Forgejo Git | Read the deployed proxy host/port, authenticate with the intended public key, and reject password authentication |
| Provider master credentials | Authenticated OmniRoute dashboard | Add the provider after deployment; do not enter its master key in Railway variables or the workspace | Check the provider in OmniRoute, then create and test a separate restricted inference key |
| Coding-agent model and scoped inference key | Persistent workspace configuration | Run `ai-setup`; select a model listed by `ai-models` | Run `ai-status`, send a mock or approved request, and verify the selected model is recorded |
| Git identity and private repository | Workspace Git key plus a non-admin Forgejo user | Run `git-setup`, add its public key to the regular Forgejo user, and clone a private repository | Commit, push, fetch, and confirm the file in Forgejo |
| Files, sessions, and task recovery | `/workspace` persistent volume and upstream provider session files | Edit files in any client; use the provider's supported manual resume after an interruption | Check the shared tree, session history, task registry, and restore procedure |
| Public documentation | `docs/`, `mkdocs.yml`, and `.github/workflows/docs.yml` | Edit Markdown, preview with `npm run docs:build`, then merge to `main` | Require the workflow's strict build and artifact scan before Pages deploys |
| Release claims | `GATES.md` | Update only with evidence from an actually run check | The generated [release-status page](RELEASE_STATUS.md) summarizes gate titles and states, not evidence |

## Safe change sequence

1. Identify the owning source above. Do not use a Railway variable to override a value owned by IaC without checking the plan.
2. For a code, docs, or configuration change, run the targeted local test first. Then run `npm test`, `npm run test:security`, `npm run check:compose`, `npm run check:railway`, or `npm run docs:check` as applicable.
3. Before any Railway apply, use a fresh test project in the intended personal workspace. Read the complete plan and verify that it touches only the four CloudDev services and their volumes.
4. After an authorized apply, read back region, domains, TCP proxies, volume mounts, networking, and Serverless/App Sleeping. Test the deployed behavior, not just the source declaration.
5. Update `GATES.md` with the exact evidence and date. The public status page deliberately excludes raw command output, paths, and environment data.

## Release readiness

The live [release status](RELEASE_STATUS.md) is built from the gate checklist. A green local test cannot close a Railway, Marketplace, physical-device, or restore gate. The main unresolved product risks remain separately visible in the [image scan](../security/IMAGE_SCAN.md), [backup and restore guide](../security/BACKUP_RESTORE.md), and [Marketplace release runbook](RAILWAY_MARKETPLACE.md).

Railway Private Networking does not filter outbound traffic. An agent can still make external connections from the workspace. Do not describe a proxy setting or a private service address as an egress sandbox.

## Pages deployment controls

The repository's Pages source is configured for **GitHub Actions**. The `Documentation` workflow builds on pull requests and changes to `main` using a pinned Ubuntu 24.04 runner. Pull requests never receive Pages deployment permissions. Only the `github-pages` deployment job can publish, and it runs for `main`. If the workflow cannot deploy, check **Settings → Pages → Build and deployment → Source → GitHub Actions**. The current Pages helper actions emit Node 20 deprecation warnings that GitHub forces onto Node 24. Update the SHA pins when their upstreams publish Node 24-native releases. The site is public even if repository visibility later changes, so only reviewed documentation is included.

Material for MkDocs 9.8.0 is pinned in `docs-site/uv.lock`. Its upstream support ends on 2027-05-05. Review its security notices and evaluate Zensical before that date. The site generator does not update itself.
