# Local encrypted backup and restore

This runbook covers encrypted exports of the four local Compose state stores. It
does not change Railway-managed volume snapshots. Railway snapshots remain
provider-managed and are not encrypted with the operator's age key.

## Key material

The backup command needs only an age public recipient. Keep the matching
private identity in operator-controlled storage outside Railway, this
repository, `/workspace`, and coding-agent environments. Do not copy it into a
Compose volume or the backup directory. Set its file mode to `0400` or `0600`
when it is available on the local host.

OmniRoute's `STORAGE_ENCRYPTION_KEY` is a separate recovery secret. Retain it
in a protected secret store. It is not included in the age manifest and must
not be replaced with the age identity or recipient. Losing this key can leave
the restored OmniRoute database unreadable.

## Create a backup

Run this from the repository root with the intended Compose project selected.
Before continuing, stop agent tasks and other workspace or Git writes. The
required `--acknowledge-quiesced` flag records that operator check. The script
does not inspect whether an agent is still writing. All four source services
must already be running. The script reads them with `docker compose ps` and
`docker compose exec`; it never starts, stops, or restarts a source service.
Choose a new absolute destination outside the repository and `/workspace`. Its
parent directory must already exist.

```sh
AGE_RECIPIENT='age1...replace-with-your-public-recipient' \
  bash scripts/backup-encrypted.sh --acknowledge-quiesced \
  '/Volumes/Offline Backups/clouddev-2026-10-25'
```

The command writes five encrypted artifacts:

- `workspace.tar.gz.age`
- `forgejo-volume.tar.gz.age`
- `postgres.dump.age`
- `postgres-globals.sql.age`
- `omniroute.tar.gz.age`

It also writes `SHA256SUMS` for the encrypted artifacts and a non-secret
`manifest.txt` with the format, creation time, source revision, and store
names. The destination must not exist. If export or encryption fails, the
script removes the new destination. It does not leave a plaintext archive on
the host.

Workspace and Forgejo data stream from their running containers through
[`age`](https://age-encryption.org), which reads standard input and writes the
encrypted result to a file.
PostgreSQL uses a custom-format `pg_dump` stream for application data and a
separate `pg_dumpall --globals-only` stream for roles and memberships. The role
dump can contain password hashes, so it is encrypted before it reaches the
backup directory. The database dump omits ownership and privileges; restore
the globals before the database.

OmniRoute uses Node's
[`sqlite.backup()` API](https://nodejs.org/api/sqlite.html#sqlitebackupsourcedb-path-options)
to take a consistent database snapshot while the service remains running. The
snapshot and a copy of any other `/app/data` files live briefly in the
container's `/dev/shm` tmpfs. The
script tars that temporary directory directly into the age stream and removes
it when the command finishes. The tmpfs must have enough free space for the
OmniRoute data directory.

These five artifacts do not share one transaction boundary. PostgreSQL
provides a logical database dump and a separate cluster-global dump, while
OmniRoute's SQLite snapshot is database
consistent. The quiescence flag is an operator acknowledgement, not an enforced
write lock. If workspace or Forgejo files change during export, the result can
contain a mixed-time copy. For a strict cross-store point-in-time backup,
arrange a separate reviewed snapshot procedure. This script will not stop or
restart running Compose projects.

## Test a restore

The restore test checks the encrypted files and their hashes, then decrypts
them directly into fresh test volumes. It creates a uniquely named Compose
project with no published ports. It does not mount or modify any existing
project's volumes. Cleanup runs only against that generated project name and
its volumes. The script does not build images, pull images, or run `prune`.

The age identity must be outside the repository and `/workspace`, and have
mode `0400` or `0600`:

```sh
AGE_IDENTITY='/Volumes/Offline Keys/clouddev-age-identity.txt' \
  bash scripts/test-encrypted-backup-restore.sh \
  '/Volumes/Offline Backups/clouddev-2026-10-25'
```

The restore test requires Docker Engine, `age`, and the pinned Alpine 3.22.2,
Node 24.22.0 bookworm-slim, and PostgreSQL 18.6 Alpine 3.24 images to be
available locally. It does not fetch missing images. It checks the
restored file stores, runs `PRAGMA quick_check` on the OmniRoute database, and
confirms that PostgreSQL contains user tables. It is a data-level restore
drill, not proof of a successful Forgejo or OmniRoute login, private Git fetch,
provider reconnection, CloudCLI session resume, or production recovery.

The automated integration test creates its own disposable source project. It
requires a dedicated test identity and public recipient. Keep the identity
outside the repository, `/workspace`, Railway, and agent environments. Pass
only its path and the public recipient to the test:

```sh
AGE_TEST_IDENTITY='/Volumes/Offline Keys/clouddev-test-identity.txt' \
AGE_TEST_RECIPIENT='age1...replace-with-your-test-recipient' \
  npm run test:encrypted-backup
```

The test skips when `age`, Docker Engine, the dedicated key pair, or the pinned
test images are unavailable. It does not generate or copy a private identity.

## Scope and limits

These files are local, off-platform backups. They do not use a Railway Bucket
and do not add the operator's age encryption to Railway volume snapshots.
Railway snapshot encryption and key custody remain separate provider-managed
matters.

The archives contain application state and may include credentials, private
repository data, Git keys, session history, and provider connection metadata.
Store the encrypted artifacts and the matching age identity separately. Keep
old identities until every artifact encrypted to them has expired or has been
re-encrypted and successfully restored. Retain OmniRoute's
`STORAGE_ENCRYPTION_KEY` separately as well.

A completed test of these backup scripts does not by itself close the product's
full restore gate. The gate also requires application-level checks and any
other acceptance evidence listed in `GATES.md`.
