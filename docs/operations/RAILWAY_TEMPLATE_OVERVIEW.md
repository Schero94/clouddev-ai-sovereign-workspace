# Deploy and Host CloudDev AI on Railway

CloudDev AI deploys a private, single-user development workspace. It runs
code-server, key-only OpenSSH, CloudCLI, Codex CLI, Claude Code, Forgejo, and
OmniRoute as a Railway project. Persistent volumes hold project files, Git
repositories, provider configuration, and recoverable agent-session history.
Owners add their own SSH public key and provider accounts during setup.

## About hosting CloudDev AI

CloudDev AI keeps the editor, terminal agents, and CloudCLI mobile interface in
one always-on workspace service. VS Code Desktop connects through an explicit
Railway TCP proxy. Browser VS Code and CloudCLI use the same project files and
supported provider-session history. Separate Forgejo, PostgreSQL, and
OmniRoute services provide private Git hosting, metadata storage, and model
routing. The workspace uses a persistent volume and one replica. Railway
restarts stop active processes, so only sessions supported by an upstream
agent can be resumed after a restart. Provider accounts and keys are not
included. Each owner connects their account through the authenticated
OmniRoute dashboard and gives coding agents only a scoped inference key.

## Common use cases

- Edit the same projects from native VS Code, a desktop browser, or a phone.
- Run Codex CLI and Claude Code against the owner's authenticated OmniRoute
  providers.
- Keep private repositories and review changes through a self-hosted Forgejo
  interface.
- Disconnect a client while a server-side task continues, then reopen a
  supported session in another interface.
- Continue work after a restart by reviewing the durable task registry and
  manually resuming sessions supported by the relevant upstream agent.

## Deployment dependencies

- [Railway](https://railway.com) runs the four-service project and persistent
  volumes.
- [code-server](https://github.com/coder/code-server) provides browser VS Code.
- [CloudCLI](https://github.com/CloudCLI-AI/CloudCLI) provides the mobile-first
  agent and session interface.
- [OpenAI Codex CLI](https://github.com/openai/codex) and
  [Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview) run in
  the shared workspace service.
- [OmniRoute](https://github.com/cheaper-inference/OmniRoute) routes inference
  requests to provider accounts configured by the owner.
- [Forgejo](https://forgejo.org) stores private Git repositories. A separate
  [PostgreSQL](https://www.postgresql.org/) service stores Forgejo metadata.

## Implementation details

The checked-in Railway IaC file declares service resources, private variable
references, health checks, volumes, region, SSH TCP proxies, and the no-sleep
setting. The Railway Template Composer must still set GitHub sources, generated
HTTPS domains, per-deployment `secret()` variables, and the operator's SSH
public key. Use the exact values in
[RAILWAY_TEMPLATE_VARIABLES.md](RAILWAY_TEMPLATE_VARIABLES.md). Provider
credentials are added after deployment and are never part of the template.

## Why deploy CloudDev AI on Railway?

Railway provisions the workspace, Git service, database, gateway, and their
private networking in one project. The project configuration is kept in
`.railway/railway.ts`, while the Template Composer holds generated domains and
per-deployment secrets. Volume-backed services stay at one replica. Railway
Private Networking does not restrict outbound connections from the workspace.
Review the threat model, data flows, and restore procedure before placing
sensitive projects on the instance.
