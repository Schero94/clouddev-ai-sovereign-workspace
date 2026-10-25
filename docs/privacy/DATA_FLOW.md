# Data flows

This document describes the intended CloudDev AI single-user deployment. A live
Railway deployment has not been tested from this checkout. Railway hosting is
in Europe West only when every service and volume is actually provisioned in
`europe-west4-drams3a`.

## Components and stored data

| Component | Data handled | Persistent location |
| --- | --- | --- |
| Shared workspace | Source files, shell history, editor settings, CLI configuration, SSH host identity, Git identity, CloudCLI session index, task status | One Railway volume mounted at `/workspace` |
| Forgejo | Accounts, repositories, issues, pull requests, Git SSH host identity, application configuration | Forgejo volume at `/var/lib/gitea` and PostgreSQL database |
| PostgreSQL | Forgejo relational state and authentication metadata | Railway managed PostgreSQL storage |
| OmniRoute | Provider connections, encrypted provider keys, inference keys, dashboard settings, request and usage metadata | OmniRoute volume at `/app/data`; encryption key must also be backed up |
| Railway | Service configuration, environment variables, deployment events, resource metrics, network metadata | Railway control plane |
| AI providers | Prompts, relevant project context, tool outputs, and provider request metadata | Provider-controlled systems under the selected account and contract |

## Main flows

1. A browser connects to the shared workspace over Railway HTTPS. Caddy calls
   the launchpad's loopback auth verifier to check a signed HttpOnly workspace
   cookie before forwarding to CloudCLI, the launchpad, or code-server. The
   login form uses a per-deployment password and sets the cookie Secure on
   production HTTPS. The workspace TLS boundary ends at Railway's HTTP edge.
   CloudCLI's Bearer `Authorization` header passes through unchanged.
2. Native VS Code Remote-SSH connects through the workspace TCP proxy to sshd
   on internal port 2222. sshd accepts operator-provisioned Ed25519 public keys
   only. The workspace login is `coder`; the private client key stays on the
   developer's computer. The public host-key fingerprint must be checked at
   first connection against the value shown in the launchpad.
3. VS Code Desktop, browser VS Code, and CloudCLI operate on the same
   `/workspace/projects` tree and the same persistent `HOME`. CloudCLI stores
   session metadata in its SQLite database and scans provider-native session
   artifacts. The durable task registry stores metadata, not prompts or file
   contents. A Railway restart terminates processes; it does not terminate
   provider history files or the SQLite index when the volume remains intact.
4. The terminal wrappers and CloudCLI send model requests to OmniRoute over
   Railway private networking. The workspace receives only a scoped inference
   key. OmniRoute stores provider master credentials and routes prompts, source
   snippets, tool outputs, and model identifiers to the operator-selected
   provider.
5. Git HTTPS and Git SSH clients connect to Forgejo. Git SSH uses a dedicated
   `~/.ssh/id_ed25519_clouddev` workspace key registered to a regular Forgejo
   account. The key is distinct from the workspace Remote-SSH key. Forgejo
   uses PostgreSQL over its private network and has public registration
   disabled.
6. The OmniRoute dashboard is privately hosted and reached through the
   workspace's cookie-protected `/omniroute/` path. The user then signs in to
   OmniRoute with its separate native account. The loopback-only CLI adapter
   sends the health probe and OpenAI-compatible API routes to private dashboard
   port 20128. It does not forward the OmniRoute dashboard cookie. The launchpad
   shows service links and aggregate status only; it does not proxy an
   administrator session or store provider credentials.

## External processing and telemetry

Railway EU West does not imply that provider processing stays in the EU. OpenAI,
Anthropic, and other providers may process data outside Railway's deployment
region under their current product and account terms. The operator chooses the
provider, model, account, retention settings, and applicable contract.

OmniRoute stores configuration and usage/audit metadata in SQLite. The template
sets short call-log retention, disables file logs, detailed request logs,
stream-chunk capture, and selected background catalogue syncs. These settings
do not prove that no prompt-derived information is stored in every upstream
component, provider account, crash report, or platform log. Review the upstream
version's logging behavior and the provider's data terms before using sensitive
or regulated source data.

Railway may process deployment logs, service metrics, network metadata, and
variable values according to its platform behavior. Sealed variables are not
visible in the dashboard or retrievable by the API, but running services still
receive them.

## Deletion and retention

Deleting a Git repository in Forgejo does not delete clones or copies in the
workspace, backups, forks, provider logs, or external provider records. Deleting
a workspace file does not purge the same content from an agent transcript or a
provider. Rotate exposed browser, SSH, Forgejo, OmniRoute, and provider
credentials at their respective source. To retire an instance, stop services,
export required records, revoke credentials, and remove each persistent volume
only after backups are verified. Railway volume deletion may become permanent
after its documented recovery window.

## Evidence status

- Documented upstream behavior: CloudCLI 1.37.5 stores session data in SQLite
  and provider-native files; code-server supports password authentication;
  Railway private networking does not constitute outbound egress filtering.
- Implemented locally: to be confirmed from the merged runtime, Compose stack,
  and executed tests.
- Live Railway behavior: not verified. Do not describe the running service,
  region, proxy, volumes, or domain configuration as deployed until a fresh
  project has been checked.
