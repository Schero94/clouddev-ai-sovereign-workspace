# CloudDev AI contributor instructions

CloudDev AI is a single-user workspace. Keep it that way unless the product scope is explicitly revised.

## Rules

- Before changing files, read `.cursor/rules` if present and follow any applicable rules. Also read this file and the relevant project skills.
- Keep provider master keys in OmniRoute only. Never put a Railway token, Forgejo administrator token, or provider credential in the IDE service.
- Do not add a Docker socket, privileged container, default password, or public PostgreSQL endpoint.
- Require authentication for every public UI. Keep IDE, Forgejo, and OmniRoute native authentication separate. Do not add implicit SSO.
- Treat repositories and coding-agent commands as untrusted. Do not automatically run cloned repository scripts.
- Keep all user state on declared persistent mounts. Do not claim backup success until a restore has been run.
- Pin production images and CLI dependencies. Do not use `latest` in production configuration.
- Do not claim EU-only processing, GDPR compliance, tested performance, One-Click verification, or successful deployment without direct evidence.
- Keep Railway IaC in `.railway/railway.ts`. Do not add `railway.toml` or `railway.json`.
- Keep public generated domains, secret generation, and Marketplace template metadata in the Railway Template Composer where IaC cannot express them.
- Before relying on library or platform APIs, check current official documentation. If Context7 is unavailable, report the quota error and use current official docs, not stale memory.
- Use test-first changes for application behavior. Report local tests, integration tests, Railway plan/deploy, Marketplace publication, and restore drills as separate gates.

## Local checks

- `npm test`
- `npm run test:security`
- `docker compose config --quiet`
- `docker compose build`
- `./scripts/verify-local.sh` (requires a working Docker Engine)

See `GATES.md` for acceptance evidence and unresolved items.
