# CloudDev AI Forgejo service

This service runs the official Forgejo `17.0.0-rootless` image. The image is
pinned to its verified multi-platform OCI index digest:

```text
codeberg.org/forgejo/forgejo:17.0.0-rootless@sha256:6554520f7574602100b7d6620c6ac5b18cec30325f823777497eac36234f5cf8
```

The upstream rootless image is based on Alpine 3.24. This image installs the
pinned `postgresql17-client=17.11-r0` package and switches back to UID/GID
`1000:1000` for normal startup.

Forgejo runs as UID/GID `1000:1000`. Persist the whole
`/var/lib/gitea` directory. It contains repositories, user data, configuration,
and other Forgejo state. The mounted directory must be writable by UID/GID
`1000:1000`. Do not mount a temporary filesystem there.

## Required service variables

Set these values only on the Forgejo service. The deployment must point both
PostgreSQL hosts at the same private PostgreSQL service. Startup checks that the
Forgejo host is set, but a service container cannot prove whether an arbitrary
hostname resolves to a private address. No database endpoint or credential is
embedded in the image.

| Variable | Purpose |
| --- | --- |
| `FORGEJO__database__DB_TYPE` | Set to `postgres` by the image. Startup rejects any other value. |
| `FORGEJO__database__HOST` | Private PostgreSQL hostname and port used by Forgejo. |
| `FORGEJO_POSTGRES_ROLE` | Login role that Forgejo will use. Use up to 63 ASCII letters, digits, and underscores, starting with a letter or underscore. The bootstrap removes elevated role attributes and inherited memberships. |
| `FORGEJO_POSTGRES_DATABASE` | Database owned by the Forgejo role. It uses the same identifier format as the role. |
| `FORGEJO_POSTGRES_PASSWORD` | Unique password for the Forgejo role, at least 16 bytes. Store it as a Railway secret variable. |
| `FORGEJO__server__START_SSH_SERVER` | Set to `true` only when the Forgejo service has a TCP proxy targeting its internal SSH port. |
| `FORGEJO_SSH_DOMAIN` / `FORGEJO_SSH_PORT` | External host and port advertised in Forgejo clone URLs. Railway uses its service-specific TCP proxy variables; Compose supplies local values. |
| `FORGEJO_SSH_LISTEN_PORT` | Internal built-in SSH listener port. CloudDev uses 2222, matching the TCP proxy target. |

The bootstrap credential must belong to the PostgreSQL service administrator
with enough rights to create and alter roles and databases, remove role
memberships, and change the target database and schema owner. Keep these
separate connection variables only on the Forgejo service:

| Variable | Purpose |
| --- | --- |
| `FORGEJO_POSTGRES_ADMIN_HOST` | Private PostgreSQL hostname for the bootstrap connection. |
| `FORGEJO_POSTGRES_ADMIN_PORT` | PostgreSQL port. |
| `FORGEJO_POSTGRES_ADMIN_DATABASE` | Existing maintenance database, normally `postgres`. It must differ from the Forgejo database. |
| `FORGEJO_POSTGRES_ADMIN_USER` | Bootstrap-only PostgreSQL administrator role. It must differ from the Forgejo role. |
| `FORGEJO_POSTGRES_ADMIN_PASSWORD` | Bootstrap administrator password. Store it as a Railway secret variable. |

On an empty database, also provide these variables so the first administrator
can be created before the web server starts:

| Variable | Purpose |
| --- | --- |
| `FORGEJO_ADMIN_USERNAME` | First administrator's username. |
| `FORGEJO_ADMIN_EMAIL` | First administrator's email address. |
| `FORGEJO_ADMIN_PASSWORD` | First administrator's password, at least 16 bytes. Use a unique generated secret. |

After an administrator exists, restarts detect that account and no longer need
the `FORGEJO_ADMIN_*` variables. The bootstrap does not change an existing
password or create an access token. Change or recover an account through
Forgejo's authenticated administration interface. The administrator is asked
to change the bootstrap password on first login.

## Startup and security behavior

Startup first uses the PostgreSQL client to create or update the Forgejo role
and database. The role cannot create databases or roles, bypass row security,
or inherit other roles. The database owner and `public` schema are assigned to
that role, and public database and schema access is revoked. The application
password is read by psql's hidden `\password` prompt from stdin. psql hashes it
before sending the change to PostgreSQL, so the cleartext password is not in
SQL statements, argv, or logs. It must be a single-line value of at least 16
bytes. The admin password is supplied in the `PGPASSWORD` environment of the
short-lived psql process. All `FORGEJO_POSTGRES_ADMIN_*` variables are removed
before any Forgejo CLI or web process starts.

The bootstrap retries up to 30 times, two seconds apart by default. Set
`FORGEJO_BOOTSTRAP_ATTEMPTS` or `FORGEJO_BOOTSTRAP_DELAY_SECONDS` to adjust the
bounds. After provisioning, the official rootless image's `docker-setup.sh`
renders the `FORGEJO__SECTION__KEY` variables into Forgejo's protected
`app.ini`. The wrapper removes the database password from the process
environment, then retries `forgejo migrate`, checks the administrator list, and
creates the first administrator with the documented `forgejo admin user
create` command only when none exists. The web server starts only after these
steps succeed.

Registration is disabled, sign-in is required to view normal pages and use the
API, new repositories default to private, and the installation page is locked.
HTTPS Git access remains available. The CloudDev Railway and Compose
configurations also enable Forgejo's built-in SSH server on internal port 2222
and expose it through a separate TCP proxy. Forgejo accepts registered public
keys for Git transport; the connection does not provide an interactive shell.
The workspace Git key is separate from the key used for VS Code Remote-SSH.
Existing repositories are not changed by the default-privacy setting.

After first sign-in, run `git-setup` in the IDE terminal. Add the displayed
public key to the SSH keys for a regular, non-admin Forgejo account. To use Git
over the Forgejo TCP proxy, configure an SSH host entry with its proxy hostname
and port, user `git`, and `~/.ssh/id_ed25519_clouddev`. Then use an SSH clone
URL supplied by Forgejo. SSH host-key verification is trust-on-first-use
unless the operator compares the fingerprint through a separate trusted
channel. If you do not enable its TCP proxy, continue to use authenticated
HTTPS Git.

The health probe is `GET /api/healthz` on port 3000. Forgejo v17's router places
this operational endpoint outside the sign-in middleware. It reports service,
database, and cache health without returning database credentials. Normal
Forgejo pages and API routes still require sign-in.

The bootstrap command accepts the admin password only through Forgejo's
documented `--password` CLI option. The wrapper suppresses the CLI's output and
does not log the credential. Forgejo v17 provides no documented password-file
or stdin option for this command, so its first-admin password is briefly
present in the short-lived process argument list during account creation. The
wrapper removes admin and database password variables from the environment of
subsequent Forgejo processes.

The Forgejo role password is rendered into `app.ini` by the official image
setup, then kept inside the private persistent volume with a non-traversable
configuration directory. Restrict access to the Forgejo service and its volume.
The service definition that consumes this image must mount persistent storage
at `/var/lib/gitea` and expose the Forgejo web and SSH ports. The built-in SSH
host key is stored in the persistent volume, so it remains stable during a
normal container replacement. Railway volume ownership and live database/Git
connectivity still require verification in the actual target project.

## Local checks

Run the service's standard-library test suite from the repository root:

```sh
python3 -m unittest -v services/forgejo/test_entrypoint.py
```

The tests exercise startup ordering, PostgreSQL provisioning order, retries,
first-admin idempotency, failure handling, credential redaction, and image
security defaults. Mocks verify that psql receives the database passwords only
through its environment and stdin, and that Forgejo processes inherit neither.
A real image build and database-backed Git round trip must be tested with a
running container engine and the complete local stack.

## Official references

- [Forgejo v17 Docker installation and rootless image](https://forgejo.org/docs/v17.0/admin/installation/docker)
- [Forgejo v17 configuration cheat sheet](https://forgejo.org/docs/v17.0/admin/config-cheat-sheet)
- [Forgejo v17 command-line reference](https://forgejo.org/docs/v17.0/admin/command-line)
- [Forgejo v17.0.0 rootless Dockerfile](https://codeberg.org/forgejo/forgejo/src/tag/v17.0.0/Dockerfile.rootless)
- [Forgejo v17.0.0 rootless entrypoint](https://codeberg.org/forgejo/forgejo/src/tag/v17.0.0/docker/rootless/usr/local/bin/docker-entrypoint.sh)
- [Forgejo v17.0.0 health route and integration test](https://codeberg.org/forgejo/forgejo/src/tag/v17.0.0/tests/integration/api_health_test.go)
- [PostgreSQL psql and secure password command](https://www.postgresql.org/docs/current/app-psql.html)
- [Alpine v3.24 PostgreSQL 17 client package](https://pkgs.alpinelinux.org/package/v3.24/main/aarch64/postgresql17-client)

The Forgejo container and application are distributed under GPL-3.0-or-later.
