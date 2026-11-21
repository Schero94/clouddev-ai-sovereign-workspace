---
title: Deploy CloudDev AI on Railway
description: Click-by-click Railway template setup and deployment guidance, with the current Marketplace and verification limits stated plainly.
tags:
  - Railway deployment
  - Railway template composer
  - CloudDev AI setup
  - Railway Marketplace
  - persistent workspace
---

# Deploy on Railway

## Current status

CloudDev AI is published on the Railway Marketplace at [railway.com/deploy/clouddev-release-20261121](https://railway.com/deploy/clouddev-release-20261121). A no-input test deployment passed. The template is not yet Railway-verified, and the live deployment gate G12 remains open in the [release status](../operations/RELEASE_STATUS.md) until SSH login, cross-device handoff, and restart recovery are proven on Railway.

## Deploy from the Marketplace

1. Open [the CloudDev AI listing](https://railway.com/deploy/clouddev-release-20261121).
2. Select **Deploy Now**.
3. Review the requested values. Nothing needs typing: `SSH_AUTHORIZED_KEYS` is optional. Leave it empty for iPad, phone, and browser use, or add an Ed25519 public key for desktop Remote-SSH. Do not paste a private key. Railway's template variable functions should generate independent secrets for each deployment.
4. Select **Deploy** and wait for the project services to report ready.
5. Open the generated HTTPS domain for `clouddev-ide` and continue with [first login](first-login.md).

Railway's [template deployment guide](https://docs.railway.com/templates/deploy) documents this flow. If the Marketplace listing is not visible, stop. The template has not been published to your account or is not yet available.

## Maintainer release path

Use a new test project in the intended personal Railway workspace. Do not apply the plan to an unrelated or production project.

### Create a template draft

1. Sign in to the Railway dashboard and choose the personal workspace that will own the release.
2. Open **Workspace Settings**, choose **Templates**, then select **New Template**. Railway also documents converting a project from its project settings with **Generate Template from Project**.
3. If you start from the tested project, check that the Composer contains exactly these services: `clouddev-ide`, `clouddev-git`, `clouddev-postgres`, and `clouddev-router`.
4. Confirm each source, build context, Dockerfile, health check, private variable reference, and restart setting against [the template overview](../operations/RAILWAY_TEMPLATE_OVERVIEW.md) and the checked-in `.railway/railway.ts`.
5. Select **Create Template** to save an unpublished draft.

Railway's current [Create a Template guide](https://docs.railway.com/templates/create) describes the **New Template** flow, project conversion, service configuration, variables, domains, health checks, volumes, and generated template variables.

### Review Composer settings

1. Set the workspace and its volume to `europe-west4-drams3a`. Keep the volume-backed services at one replica. Keep Railway Serverless/App Sleeping disabled for the workspace, then verify the setting on the deployed service.
2. Attach the persistent volumes at the paths declared by the IaC. Keep PostgreSQL and OmniRoute private. Do not add a public domain or public TCP proxy for either service.
3. Generate the deployment secrets with the Railway Template Composer's documented `secret()` function. Use `${{secret(64, "0123456789abcdef")}}` as a separate value for every generated-secret variable in the [variable inventory](../operations/RAILWAY_TEMPLATE_VARIABLES.md). `preserve()` keeps an existing Railway value; it does not generate a value for a first deployment.
4. Keep first-login bootstrap values readable only long enough to sign in and rotate them. Store them in a password manager, then seal or remove bootstrap values as the variable inventory directs. Provider credentials are never included in the template.
5. Generate an HTTPS domain for `clouddev-ide` on port `8080` and `clouddev-git` on port `3000`. Configure TCP proxies for SSH port `2222` only where the release checklist requires them. Do not expose the PostgreSQL or OmniRoute listener.
6. Compare every variable and proxy against [the full Composer inventory](../operations/RAILWAY_TEMPLATE_VARIABLES.md). Keep `SSH_AUTHORIZED_KEYS` optional and empty by default. Never fill it with a maintainer key.

### Test, then publish

1. Run `railway config plan` in the dedicated test project and inspect every create, update, and delete before applying anything.
2. Deploy only to that test project. Verify region, public domains, SSH TCP proxy, private networking, volume mounts, health checks, generated secrets, and the no-sleep setting from the live Railway dashboard.
3. Complete the [release checklist](../operations/CONTROL_PLANE.md#release-readiness), including a fresh deploy, client handoff, and a restore drill. A local test or IaC type-check is not a Railway deployment result.
4. From the Railway workspace **Templates** page, choose **Publish** beside the reviewed draft. Complete the Marketplace form with the product description, source repository, documentation, license, and support details.
5. Wait for Railway's result. Publication does not itself establish Railway verification or a partner badge.

Railway's [Publish and Share guide](https://docs.railway.com/templates/publish-and-share) explains the publication form, template URL, and button. The published template code is `clouddev-release-20261121`.

## Screenshots still needed

No Railway dashboard screenshots are included because there is no verified live test project to capture. Capture the real screens after that test exists, then add the files and their descriptions here:

- `docs/assets/screenshots/railway-template-composer-services.png`
- `docs/assets/screenshots/railway-first-deploy-variables.png`
- `docs/assets/screenshots/railway-marketplace-listing.png`

Do not replace these names with mock UI or a screenshot from another Railway project.

## Before you continue

- Review [security hardening](../security/SECURITY_HARDENING.md) and the [image release hold](../security/IMAGE_SCAN.md).
- Read [first login](first-login.md) before sharing bootstrap credentials.
- Railway Private Networking does not restrict outbound requests from coding agents. Review the [threat model](../security/THREAT_MODEL.md).
- A local restore procedure is not a tested restore. See [backup and restore](../security/BACKUP_RESTORE.md).
