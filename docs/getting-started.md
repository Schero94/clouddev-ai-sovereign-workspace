# Start here

CloudDev AI runs as one private workspace service and three independent supporting services. It is a single-user deployment, not a shared SaaS workspace.

## Choose a path

### Run the local stack

Requirements: Docker Compose v2, Node.js 24, and `uv` for the documentation build.

```sh
./scripts/dev-env.sh
docker compose config --quiet
docker compose up --build
```

Open `http://localhost:8080/` and sign in with the local `CODE_SERVER_PASSWORD`. Open the launchpad to find CloudCLI, browser VS Code, Forgejo, OmniRoute, and the SSH connection details. Do not commit `.env`, private keys, or the local `secrets/` directory.

### Prepare a Railway deployment

1. Review [the release status](operations/RELEASE_STATUS.md) and [the security release hold](security/IMAGE_SCAN.md).
2. Use a new Railway test project in the intended personal workspace. Do not apply this configuration to an unrelated project.
3. Review `railway config plan`. Only apply a reviewed plan to that dedicated project.
4. In the Template Composer, set the EU West region, public HTTPS domains, TCP proxies, ten independent generated secrets, and the operator's Ed25519 public key. Keep PostgreSQL and OmniRoute private.
5. Check the full [Composer variable inventory](operations/RAILWAY_TEMPLATE_VARIABLES.md) and follow the [deployment runbook](operations/RAILWAY_MARKETPLACE.md).

The deployment instructions describe expected configuration. They do not establish that a live Railway deployment has those settings.

## First login and provider setup

1. Sign in to the workspace using its generated browser password.
2. Create CloudCLI's single local account on first use.
3. Sign in to Forgejo with the bootstrap account, change its password, and create a regular user with a private repository.
4. Run `git-setup` in the workspace and add its public key to that regular Forgejo user.
5. Sign in to OmniRoute, change its bootstrap password, add your provider account, and create a restricted inference key.
6. Run `ai-setup`, choose an available model, then check `ai-status` and `ai-models`.

No provider API key is generated for or included in the public template. Never put the provider master key in workspace variables or an agent environment.

## Connect from each device

- Native VS Code connects with Remote-SSH using the operator's private key and the workspace SSH endpoint. Railway's `railway ssh` command is not the Remote-SSH transport.
- Browser VS Code is served at `/vscode/` after workspace authentication.
- The mobile agent interface is served from the authenticated workspace origin. It uses the same projects and can reopen provider sessions supported by the upstream CLI.

Closing a client does not stop a detached task. Restarting the workspace stops in-memory processes. Review the task registry and use only the upstream-supported manual resume path.

## Keep the evidence straight

Local tests, a GitHub Pages build, a live Railway deployment, a Marketplace listing, and a successful restore are separate checks. The [operations control plane](operations/CONTROL_PLANE.md) shows which configuration surface owns each setting and which gates are still open.
