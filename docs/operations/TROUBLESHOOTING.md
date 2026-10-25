# Troubleshooting

## Railway CLI shows the wrong workspace

Run `railway whoami --json` and `railway status --json` before planning. Stop if the account or project is not the personal CloudDev test target. Do not apply a plan to the linked validation project or to an unrelated production project.

## An IaC value looks different from the Template Composer

`preserve()` keeps a value already stored in Railway. It does not create a value for a fresh template deployment. Compare every `preserve()` entry with `.railway/template-variables.json`, then run `npm run check:railway-template`. Railway domains and per-deployment secret functions are set in the Composer.

## The workspace browser asks for a password

The workspace cookie gate requires the generated `CODE_SERVER_PASSWORD` at first sign-in. Store it in a password manager, sign in, and then seal or replace bootstrap values where the runbook allows. Do not paste passwords into logs, tickets, or shell history.

## VS Code Remote-SSH cannot connect

Check that `SSH_AUTHORIZED_KEYS` contains the operator's Ed25519 public key, the private key remains on the client, and the TCP proxy maps to port 2222. SSH password and keyboard-interactive authentication are disabled. Do not substitute `railway ssh` for the configured TCP proxy.

## Codex or Claude Code cannot find a model

Open the authenticated OmniRoute dashboard and check the provider connection. Create a restricted inference key, then run `ai-setup`. Use `ai-models` to list models visible to that key and `ai-status` to inspect the private gateway connection. Do not pass a provider master key to the workspace.

## An agent task is missing or interrupted

Check `clouddev-tasks list` and CloudCLI's recent sessions. A browser or SSH client disconnect does not stop a detached task. A workspace process restart does stop it and marks the registry row `interrupted`. Resume only from an upstream session that the provider supports. Prompts are not replayed automatically.

## The GitHub Pages workflow fails

Open the failed `Documentation` workflow run. `npm run docs:check` reproduces the local checks. Strict mode fails on a missing navigation page or broken internal link. For the deploy job, confirm the repository Pages publishing source is **GitHub Actions** and that the run targets `main`. Pull requests build and check the site but do not deploy it.

## A restore test fails

Do not overwrite the source volumes. Restore to an isolated test project, keep the OmniRoute encryption key from the backup set, and record which store failed. Follow the four-store procedure in [Backup and restore](../security/BACKUP_RESTORE.md). A database-only restore does not prove workspace, Forgejo repository, or OmniRoute recovery.
