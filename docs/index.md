# CloudDev AI documentation

CloudDev AI is a private, single-user development workspace for native VS Code, browser VS Code, and a mobile agent interface. The clients share project files and supported agent session history. They do not share editor-window state.

Start with the [setup guide](getting-started.md), then use the [operations control plane](operations/CONTROL_PLANE.md) to find where each setting lives and what proof is required before release.

## Before deploying

The Railway service graph and private references are in `.railway/railway.ts`. Per-deployment secrets, the operator's SSH public key, and public domains are set in the Railway Template Composer. Provider master keys are added by the owner after deployment in OmniRoute. The coding-agent workspace receives only a scoped inference key.

The template is not one-click verified until a fresh Railway project passes the release gates. Review the [current release status](operations/RELEASE_STATUS.md) before deployment. The page shows gate names and states only. Detailed test evidence remains in the repository's [`GATES.md`](https://github.com/Schero94/clouddev-ai-sovereign-workspace/blob/main/GATES.md).

## Sections

- [Start here](getting-started.md) for local setup and the Railway deployment sequence.
- [Architecture](architecture.md) for runtime boundaries and persistent data paths.
- [Railway operations](operations/CONTROL_PLANE.md) for variable ownership, release checks, and safe changes.
- [Security](security/THREAT_MODEL.md) and [privacy](privacy/DATA_FLOW.md) for documented limits and operator responsibilities.
- [Backup and restore](security/BACKUP_RESTORE.md) for the four persistent stores.

## Documentation status

The documentation build checks navigation and links before deployment. GitHub Pages is public. The workflow publishes only its generated static site artifact. A successful local build does not mean the GitHub Pages site or Railway template has been deployed.
