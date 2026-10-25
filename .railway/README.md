# Railway infrastructure configuration

`.railway/railway.ts` is the project's Infrastructure as Code source. It uses
the official `railway` package pinned to `3.16.0`. Run `npm run check:railway`
for a local TypeScript check.

This file declares the service defaults and private variable references. It is
not, by itself, a complete first-deployment template. Railway's IaC `preserve()`
keeps a value already stored in the target Railway project. It does not create a
secret for a fresh deployment. Add the per-deployment `secret()` expressions
from `.railway/template-variables.json` in the Railway Template Composer and
keep the file synchronized with every `preserve()` entry. Run
`npm run check:railway-template` to verify that mapping.

## Resources declared in IaC

The project graph declares the always-on workspace, Forgejo, managed
PostgreSQL, and OmniRoute. The workspace, Forgejo, and OmniRoute data each have
their own volume. PostgreSQL is provisioned through Railway's managed Postgres
helper. All resources are placed in `europe-west4-drams3a`. The stateful
services run one replica. IaC sets `sleepApplication: false` on the application
services and requests a TCP proxy for workspace SSH on port 2222.

The shared workspace has one 5 GiB volume mounted at `/workspace`. Its home is
`/workspace/home` and its project root is `/workspace/projects`. Forgejo has a
separate 5 GiB volume at `/var/lib/gitea`; OmniRoute has a separate 1 GiB volume
at `/app/data`. Volume-backed services cannot scale horizontally on Railway.
Those sizes are starting values, not capacity guarantees. Resize through
Railway after reviewing storage needs and backups.

## Template Composer setup

The IaC reference says generated Railway HTTPS domains are not declared in
`.railway/railway.ts`. When preparing a project for Template Composer, bind the
public repository source and enable these generated domains:

| Service | HTTP port | TCP proxy | Public access |
| --- | ---: | ---: | --- |
| `clouddev-ide` | 8080 | 2222 | Required. Caddy checks a signed workspace cookie for CloudCLI, browser VS Code, and the launchpad. SSH accepts operator keys only. |
| `clouddev-git` | 3000 | 2222 | Required. Forgejo keeps its own login and disables registration. Git SSH uses Forgejo account keys, not the workspace SSH keys. |
| `clouddev-router` | 20128 | none | Private service only. Its dashboard is available at `/omniroute/` through the workspace cookie and then OmniRoute's native login. Do not add a public router domain. |
| `clouddev-postgres` | none | none | Keep private. Do not create a public domain or TCP proxy. |

OmniRoute's dashboard listens on private port 20128. Its auxiliary API bridge
uses port 20131 but binds to router loopback. In the pinned image, the bridge
did not serve the model, OpenAI chat, or Anthropic routes required by the
workspace. `REQUIRE_API_KEY=true` requires an inference key. Workspace Caddy
exposes a loopback-only adapter at `127.0.0.1:20129`, forwards CLI health checks
to the dashboard, and rewrites `/v1/*` to the dashboard's documented
`/omniroute/api/v1/*` routes. It proxies the dashboard UI under `/omniroute/`
after checking the workspace cookie. Do not assign a public router domain or
TCP proxy. The launchpad is part of `clouddev-ide` and has no extra domain.
IaC requests one TCP proxy on each SSH-enabled service. Railway permits HTTP
and TCP exposure on the same service. Verify both proxy endpoints after
deployment and read the service-specific `RAILWAY_TCP_PROXY_DOMAIN` and
`RAILWAY_TCP_PROXY_PORT` values. Do not use `railway ssh` for VS Code
Remote-SSH. The workspace SSH key and Forgejo Git key are separate identities.

The public source repository is
`https://github.com/Schero94/clouddev-ai-sovereign-workspace`. IaC now binds it
to `clouddev-ide` at repository root `.` with Dockerfile
`services/ide/Dockerfile`, and to `clouddev-git` at root `services/forgejo`
with Dockerfile `Dockerfile`. The `clouddev-router` health overlay uses the same
repository root and Dockerfile `services/omniroute/Dockerfile`; its upstream
image remains pinned by that Dockerfile. Verify these settings in Composer.
Generated HTTPS domains are still created there. No generated domain or
template ID is fabricated here.

## Secrets and first login

Use Railway's documented `${{secret(...)}}` template function in the Template
Composer to generate a distinct value for each deployment. The exact variables
and expressions are in `.railway/template-variables.json`. Do not copy secrets
between services or deploy a template draft until every generated value has been
set there.

| Variable group | Handling |
| --- | --- |
| `CODE_SERVER_PASSWORD` | Generate with the Composer expression. The workspace sign-in page needs it on every start. Show it to the operator for first sign-in, then seal it after they have stored it safely. |
| `CLOUDDEV_WORKSPACE_AUTH_SECRET` | Generate independently and seal it at deployment. It signs HttpOnly workspace cookies and authenticates Caddy's private forward-auth checks. |
| `FORGEJO_ADMIN_PASSWORD` | Generate independently. Keep it readable for first sign-in, then remove the bootstrap variable or seal it after changing the password. |
| `INITIAL_PASSWORD` | Generate independently. Keep it readable for OmniRoute's first sign-in. Change the password, then remove this bootstrap variable. |
| `FORGEJO_POSTGRES_PASSWORD` | Generate independently and seal it. Only the Forgejo service consumes it. |
| `JWT_SECRET`, `API_KEY_SECRET`, `STORAGE_ENCRYPTION_KEY`, `MACHINE_ID_SALT`, `OMNIROUTE_WS_BRIDGE_SECRET` | Generate a separate value for each variable and seal them at deployment. Preserve `STORAGE_ENCRYPTION_KEY` in protected backups. |
| `SSH_AUTHORIZED_KEYS` | Require one or more operator Ed25519 public keys. This is public key material, not a private key. Keep the corresponding private key on the operator's client. |

Every other service variable is a literal default or a private Railway reference
in `.railway/railway.ts`. PostgreSQL credentials come from Railway's managed
Postgres service and are referenced by Forgejo. Railway supplies generated
service-domain and TCP-proxy variables after those endpoints are enabled in the
Composer.

Provider API keys are not template variables. The operator adds them after
deployment through OmniRoute's authenticated dashboard. `ai-setup` then stores
only the scoped inference key in the persistent workspace configuration. That
key is available to coding-agent processes and remains a documented residual
risk. Provider master keys stay in OmniRoute.

Railway sealed variables are passed to builds and running services but are not
visible in the dashboard or retrievable through the API. Railway does not let
an operator unseal a variable. The workspace browser, Forgejo bootstrap, and OmniRoute
initial-login passwords must stay readable until the operator has recorded
them and completed first sign-in. Afterward, replace them with known strong
values or remove bootstrap-only variables, then seal values that no longer need
to be retrieved. Never print them in logs.

## Safe plan and deployment procedure

1. Select the published
   `Schero94/clouddev-ai-sovereign-workspace` repository as the source for a
   new Railway project through the Template Composer.
2. Review service roots, three HTTP domains, the workspace and Forgejo TCP
   proxies, the region, all secret generators, and volume sizes in Composer.
3. Link only a fresh test project, run `railway config plan`, and inspect every
   addition, change, and deletion.
4. Apply the reviewed plan only to that dedicated test project. Confirm service
   domains, the SSH proxy variables, the volume mounts, and the Serverless
   setting with a read-back. `deploy.sleepApplication: false` in source is not
   proof that a live deployment received the value.
5. Complete the macOS Remote-SSH and mobile session-handoff test before calling
   the template verified. Publish from the Railway Template Composer. Add the
   deploy button only after Railway assigns the actual template URL.

Use a dedicated empty validation project in the operator's personal Railway
workspace. Do not apply the plan to any existing project. Record the current
plan review, deployment, and live read-back in `GATES.md` before calling Railway
validation complete.

## Official references

- [Infrastructure as Code](https://docs.railway.com/infrastructure-as-code)
- [Infrastructure as Code reference](https://docs.railway.com/infrastructure-as-code/reference)
- [Create a Template](https://docs.railway.com/templates/create)
- [Template best practices](https://docs.railway.com/templates/best-practices)
- [Publish and share templates](https://docs.railway.com/templates/publish-and-share)
- [Variables and sealed values](https://docs.railway.com/variables)
- [Regions](https://docs.railway.com/deployments/regions)
- [Volumes](https://docs.railway.com/reference/volumes)
- [TCP Proxy](https://docs.railway.com/networking/tcp-proxy)
- [Serverless](https://docs.railway.com/deployments/serverless)
