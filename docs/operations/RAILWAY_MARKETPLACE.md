# Railway Marketplace and kickback release

The source repository is public at
[github.com/Schero94/clouddev-ai-sovereign-workspace](https://github.com/Schero94/clouddev-ai-sovereign-workspace).
There is no Railway template ID yet. The Railway CLI is linked to a shared
business workspace, not to the personal workspace required for this release.
No Railway services or template have been created from this checkout. The
product is not one-click verified.

The Railway documentation was checked on 2026-10-25. The current documented
flow is to create a template from a tested Railway project or start in the
Template Composer, then publish it from the template page. The `railway
templates create` CLI command creates an unpublished draft from a project. It
does not publish a Marketplace template by itself.

## Release gates before creating the template

1. Keep the public source repository free of `.env`, SSH private keys, Railway
   tokens, and provider credentials. The current GitHub history was scanned
   with Gitleaks before the source push and returned no findings.
2. Run the unit, security, Compose, image-build, mock-provider, SSH, Git, and
   session recovery checks. Record the actual output in `GATES.md`.
3. Close the OmniRoute image security hold in G15. Keep the router dashboard
   and inference endpoints private.
4. Sign in to the intended personal Railway workspace and create a fresh test
   project in that workspace. Do not use an existing personal or company
   project for the release test.
5. Run `railway config plan` in that project and inspect every addition,
   change, and deletion. Railway's agent skill requires a separate explicit
   approval of the exact plan before `railway config apply`; do not apply a
   plan by assumption.
6. After an approved plan is applied, verify the live region, domains, TCP
   proxy endpoints, private networking, volume mounts, and Serverless/App
   Sleeping setting. Run the Desktop to mobile to Desktop flow and restart
   recovery against that Railway deployment.
7. Restore the workspace, Forgejo, PostgreSQL, and OmniRoute data from a real
   backup in an isolated test. A backup procedure is not a tested restore.

## Configure the Template Composer

1. Use the clean test project and choose **Create Template**. Starting from a
   new template in Workspace Settings is also documented. Confirm the final
   draft contains only `clouddev-ide`, `clouddev-git`, `clouddev-postgres`,
   and `clouddev-router`.
2. Connect the public repository above. Set `clouddev-ide` to repository root `.`
   and Dockerfile `services/ide/Dockerfile`. Set `clouddev-git` to root
   `services/forgejo` and Dockerfile `Dockerfile`. Keep the pinned OmniRoute
   image declared by IaC.
3. Set every service and volume to `europe-west4-drams3a`. Keep the workspace,
   Forgejo, and router data volumes at their declared mount paths. Leave each
   stateful service at one replica.
4. Generate an HTTPS domain for `clouddev-ide` on port `8080` and for
   `clouddev-git` on port `3000`. Add a TCP proxy for port `2222` on each of
   those services. Do not create a public domain or proxy for PostgreSQL or
   OmniRoute.
5. Add every generated secret from
   [RAILWAY_TEMPLATE_VARIABLES.md](RAILWAY_TEMPLATE_VARIABLES.md) using its
   `${{secret(64, "0123456789abcdef")}}` value. `preserve()` in IaC keeps an
   existing Railway value. It does not generate a secret for a fresh template
   deployment. Keep the ten secret entries and their descriptions in
   `.railway/template-variables.json` synchronized with all `preserve()` calls.
6. Require `SSH_AUTHORIZED_KEYS` as a user-specific value containing one or
   more operator Ed25519 public keys. This cannot be filled with a maintainer
   key. Never ask for the matching private key.
7. Leave provider credentials out of the template. The deploying owner must
   connect their own provider in the authenticated OmniRoute dashboard, then
   create a scoped inference key through onboarding.
8. Check registration, health paths, restart policy, volume mounts, public
   access, and Serverless/App Sleeping in the draft. The always-on workspace
   must have sleeping disabled. Do not infer this from a local IaC type-check.
9. Create the template draft only after the configuration is complete. Then
   deploy that draft into a second fresh project and run the release checks.

## Publish and apply for kickbacks

1. From Railway's Template page, choose **Publish** on the reviewed draft and
   complete the Marketplace form. Include the overview, deployment instructions,
   support contact, source license, and images. Use the `AI/ML` category if it
   is still offered in the Composer.
   The prepared overview text is in
   [RAILWAY_TEMPLATE_OVERVIEW.md](RAILWAY_TEMPLATE_OVERVIEW.md).
2. Railway's current template docs say the kickback requires a Marketplace-
   published template and compliance with Railway's Terms of Service and Fair
   Use Policy. Unpublished and private templates do not qualify.
3. The current kickback documentation describes 15% of template usage costs,
   plus a 10% support bonus for actively answering questions in the Template
   Queue, for up to 25% total. This program is separate from Railway's Open
   Source & Technology Partners program.
4. The separate partner program is applied for at
   [railway.com/partners](https://railway.com/partners). Its documented open
   source onboarding includes template verification, a standalone deployment
   guide in the project's documentation, and a social promotion step. Partner
   verification and a verified badge are Railway decisions, not something the
   repository or CLI can grant.
5. After Railway returns a published template URL, add that exact URL to the
   Deploy on Railway button in `README.md`. Do not invent a code or claim
   verification before Railway confirms both.
6. Watch the Template Queue and respond to support requests. This is required
   for the additional support bonus under the current kickback rules.

The current CLI also supports publishing template metadata after Railway has
created a draft and returned its real code. Do not run this example until the
personal target workspace and deployment gates are confirmed:

```sh
npx --yes @railway/cli@5.71.0 templates publish <TEMPLATE_CODE> \
  --category AI/ML \
  --description "Deploy and Host CloudDev AI on Railway" \
  --readme-file docs/operations/RAILWAY_TEMPLATE_OVERVIEW.md \
  --json
```

The Template Composer remains available for the same publication workflow.

## Post-publication checks

- Deploy the published template into another fresh project.
- Check that generated secrets differ from the test deployment and the SSH
  public key belongs to the deploying operator.
- Test workspace browser auth and key-only Remote-SSH from clean clients.
- Test a private Forgejo push/fetch and an authenticated OmniRoute mock or
  approved provider request.
- Verify shared files and resumable session history across desktop and mobile.
- Restart the workspace and verify files, CLI settings, and supported manual
  session recovery.
- Restore all four persistent data sets from backup in an isolated project.

## Official Railway references

- [Create a template](https://docs.railway.com/templates/create)
- [Template best practices](https://docs.railway.com/templates/best-practices)
- [Publish and share templates](https://docs.railway.com/templates/publish-and-share)
- [Template kickbacks](https://docs.railway.com/templates/kickbacks)
- [Open Source & Technology Partners](https://docs.railway.com/templates/partners)
- [Open Source Kickback](https://railway.com/open-source-kickback)
- [Infrastructure as Code](https://docs.railway.com/infrastructure-as-code)
- [Infrastructure as Code reference](https://docs.railway.com/infrastructure-as-code/reference)
- [Variables and sealed values](https://docs.railway.com/variables)
- [TCP Proxy](https://docs.railway.com/networking/tcp-proxy)
- [Serverless](https://docs.railway.com/deployments/serverless)
