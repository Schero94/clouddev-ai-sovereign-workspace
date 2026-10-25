# Railway template variables

The service defaults and internal references live in `.railway/railway.ts`.
The Railway Template Composer must add the generated values listed in
`.railway/template-variables.json`. Railway IaC's `preserve()` function keeps
an existing value. It does not generate a value for a new deployment.

Use this Composer value for each of the ten generated secrets:

```text
${{secret(64, "0123456789abcdef")}}
```

Railway evaluates each template variable function for each deployment. Do not
replace it with a literal password or reuse a value across variables.

| Service | Variable | Deployment action |
| --- | --- | --- |
| `clouddev-ide` | `CODE_SERVER_PASSWORD` | Generate it. The operator needs the value for the workspace's first browser sign-in. After recording it safely, seal the variable. |
| `clouddev-ide` | `CLOUDDEV_WORKSPACE_AUTH_SECRET` | Generate independently and seal it. The service uses it to sign browser cookies and authenticate the private Caddy check. |
| `clouddev-git` | `FORGEJO_POSTGRES_PASSWORD` | Generate independently and seal it. |
| `clouddev-git` | `FORGEJO_ADMIN_PASSWORD` | Generate it. Keep it readable for the first administrator sign-in. Then change the password and remove or seal the bootstrap variable. |
| `clouddev-router` | `INITIAL_PASSWORD` | Generate it. Keep it readable for the OmniRoute dashboard's first sign-in. Change the dashboard password, then remove this bootstrap variable. |
| `clouddev-router` | `JWT_SECRET` | Generate independently and seal it. |
| `clouddev-router` | `API_KEY_SECRET` | Generate independently and seal it. |
| `clouddev-router` | `STORAGE_ENCRYPTION_KEY` | Generate independently and seal it. Include it in protected OmniRoute backups. |
| `clouddev-router` | `MACHINE_ID_SALT` | Generate independently and seal it. |
| `clouddev-router` | `OMNIROUTE_WS_BRIDGE_SECRET` | Generate independently and seal it. |
| `clouddev-ide` | `SSH_AUTHORIZED_KEYS` | Require one or more operator Ed25519 public keys, one per line. Never ask for or store a private key. |

Railway's managed Postgres service supplies its own database credentials. The
Forgejo service uses private reference variables for those values. Other
application defaults, ports, private host references and TCP proxy references
are declared in `.railway/railway.ts`.

## Full IaC variable inventory

The lists below cover every application variable declared in `.railway/railway.ts`.
The generated secrets and `SSH_AUTHORIZED_KEYS` above are the only Composer or
operator inputs. All other application values are fixed defaults or private
references in the IaC file.

`clouddev-router`:

```text
DATA_DIR, PORT, DASHBOARD_PORT, API_PORT, API_HOST,
OMNIROUTE_BASE_PATH, NEXT_PUBLIC_OMNIROUTE_BASE_PATH,
INITIAL_PASSWORD, JWT_SECRET, API_KEY_SECRET, STORAGE_ENCRYPTION_KEY,
STORAGE_ENCRYPTION_KEY_VERSION, MACHINE_ID_SALT, OMNIROUTE_WS_BRIDGE_SECRET,
AUTH_COOKIE_SECURE, REQUIRE_API_KEY, APP_LOG_LEVEL, APP_LOG_TO_FILE,
APP_LOG_RETENTION_DAYS, CALL_LOG_RETENTION_DAYS, ENABLE_REQUEST_LOGS,
CALL_LOG_PIPELINE_CAPTURE_STREAM_CHUNKS, PROXY_LOG_INCLUDE_IPS,
PROXY_LOG_FIRST_CHUNK_TIMING, ARENA_ELO_SYNC_ENABLED, MODELS_DEV_SYNC_ENABLED
```

`clouddev-git`:

```text
FORGEJO__database__DB_TYPE, FORGEJO__database__HOST,
FORGEJO_POSTGRES_ADMIN_HOST, FORGEJO_POSTGRES_ADMIN_PORT,
FORGEJO_POSTGRES_ADMIN_DATABASE, FORGEJO_POSTGRES_ADMIN_USER,
FORGEJO_POSTGRES_ADMIN_PASSWORD, FORGEJO_POSTGRES_ROLE,
FORGEJO_POSTGRES_DATABASE, FORGEJO_POSTGRES_PASSWORD,
FORGEJO_ADMIN_USERNAME, FORGEJO_ADMIN_EMAIL, FORGEJO_ADMIN_PASSWORD,
FORGEJO__service__DISABLE_REGISTRATION,
FORGEJO__service__REQUIRE_SIGNIN_VIEW,
FORGEJO__repository__DEFAULT_PRIVATE, FORGEJO__server__DISABLE_SSH,
FORGEJO__server__START_SSH_SERVER, FORGEJO__server__SSH_LISTEN_PORT
```

`clouddev-ide`:

```text
CODE_SERVER_PASSWORD, CLOUDDEV_WORKSPACE_AUTH_SECRET, SSH_AUTHORIZED_KEYS,
CLOUDDEV_OMNIROUTE_BASE_URL, CLOUDDEV_OMNIROUTE_HOST,
CLOUDDEV_OMNIROUTE_PORT, CLOUDDEV_OMNIROUTE_PROXY_PORT,
CLOUDDEV_FORGEJO_HOST, CLOUDDEV_FORGEJO_PORT, GIT_PUBLIC_URL,
GIT_SSH_PROXY_HOST, GIT_SSH_PROXY_PORT
```

Railway also injects its service values. CloudDev uses the public domain and
TCP proxy domain/port on the two exposed services, and private domains for
service-to-service references. The managed Postgres helper supplies its
connection values, including `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`,
`PGPASSWORD`, and `DATABASE_URL`.

## Networking values to set in Composer

| Service | HTTP domain | TCP proxy | Exposure |
| --- | --- | --- | --- |
| `clouddev-ide` | Generated domain to port `8080` | Port `2222` | Public HTTPS is protected by workspace-cookie authentication. SSH accepts only configured Ed25519 keys. |
| `clouddev-git` | Generated domain to port `3000` | Port `2222` | Forgejo uses its own sign-in and private-repository controls. SSH uses a separate Forgejo account key. |
| `clouddev-router` | None | None | Keep dashboard and inference listeners private. The workspace proxies the dashboard after workspace authentication. |
| `clouddev-postgres` | None | None | Private service only. |

Keep every service and volume in `europe-west4-drams3a`. Keep Serverless/App
Sleeping disabled for the always-on workspace and verify the deployed setting.
Railway-generated HTTP domains and secret functions are configured in the
Composer. The IaC type-check does not prove those live settings exist.

## Provider setup after deployment

Provider API keys are not template variables and cannot be preconfigured for a
public template. The owner adds their own credentials through OmniRoute's
authenticated dashboard, then
creates a restricted inference key and runs `ai-setup`. The selected model and
scoped key configuration persist in the workspace volume. Agent processes can
read that scoped inference key while running, but they do not receive provider
master keys, the Railway token, the Forgejo administrator password, or the
OmniRoute management secrets.

The template is ready to start Codex and Claude Code after the owner completes
provider setup and chooses a model. Before that, `ai-status` reports that
provider setup is still required.
