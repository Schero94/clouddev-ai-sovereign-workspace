# Backup and restore

This runbook describes a backup design. A backup is not verified until a
restore has been completed and the restored data has been checked. No complete
four-store restore drill has been run for this project yet.

## Stores and consistency requirements

| Store | Contents | Required handling |
| --- | --- | --- |
| Workspace volume `/workspace` | Projects, user home, Git identity, agent transcripts/configuration, CloudCLI SQLite DB, task registry, SSH host key | Railway volume backup or an encrypted off-platform archive. Quiesce writes where practical. Never include operator private SSH keys from client computers. |
| Forgejo volume `/var/lib/gitea` | Repositories, attachments, LFS data, app configuration, Forgejo SSH host key | Back up the full volume and Forgejo database as a coordinated set. |
| PostgreSQL | Forgejo database and role-related state | Use `pg_dump` or Railway-supported database backup/recovery. Keep credentials and dump encrypted. |
| OmniRoute volume `/app/data` | SQLite state, provider connections, keys, usage, dashboard settings | Stop OmniRoute before a file-level archive, or use SQLite-aware backup. Back up `STORAGE_ENCRYPTION_KEY` separately and securely. |

Railway volume backups can be manual or scheduled daily, weekly, or monthly.
Railway documents retention of 6 days for daily, 27 days for weekly, and 89
days for monthly schedules. Restoring a Railway backup stages a replacement
volume in the same project and environment, keeps the prior volume unmounted,
and requires review and deployment. Newer backups remain attached to the old
volume. Wiping a volume deletes its backups. Railway volume backups are not an
off-project copy.

Railway permits one volume per service and no replicas for volume-backed
services. A redeploy can involve downtime while the previous deployment
releases the volume. Do not depend on an active task continuing through that
operation.

## Local Compose backup example

Run these commands from the repository root after confirming the Compose
project name and destination. Use an encrypted destination with restrictive
permissions. Commands below use the default Compose project name.

```sh
umask 077
mkdir -p backups
docker compose stop clouddev-ide clouddev-git clouddev-router
docker compose exec -T clouddev-postgres pg_dump \
  --format=custom --no-owner --username="$POSTGRES_USER" --dbname=forgejo \
  > backups/forgejo.dump
docker compose run --rm --no-deps clouddev-ide \
  tar -C /workspace -czf - . > backups/workspace.tar.gz
docker compose run --rm --no-deps clouddev-git \
  tar -C /var/lib/gitea -czf - . > backups/forgejo-volume.tar.gz
docker compose run --rm --no-deps clouddev-router \
  tar -C /app/data -czf - . > backups/omniroute.tar.gz
docker compose start clouddev-router clouddev-git clouddev-ide
```

The postgres command assumes local environment variables are loaded by
Compose. If the target database name differs, change the dump target after
verifying it. Do not put the database password in command arguments. The
archives contain provider credentials, Git private keys, application
configuration, and session transcripts. Encrypt them before moving them off the
machine. Keep the OmniRoute encryption key in a separate secrets manager.

The `docker compose run --rm` commands can create containers with the volume
mounted. Verify exact service names and run `docker compose config` before
using this example. For Railway, do not run these ad hoc commands against
production without an approved maintenance window and a reviewed destination.

## Restore drill

Restore into an isolated, empty Compose project or a fresh Railway test project.
Do not overwrite the original production volume.

Partial local evidence, 2026-10-25: a logical dump of the running local Forgejo
database was streamed directly into an isolated PostgreSQL 18.6 container. The
restored database contained 131 application tables, matching the source. The
ephemeral target had no mounted data volume and was removed after the check.
This verifies a narrow database-data restore path only. It did not restore
roles, a saved encrypted backup file, the Forgejo data volume, the workspace,
or OmniRoute. G13 remains open.

1. Record checksums and sizes for all four backup artifacts.
2. Create empty target volumes and a fresh database.
3. Restore PostgreSQL data first, including the Forgejo role and database using
   the approved role-provisioning process.
4. Restore `/var/lib/gitea`, `/workspace`, and `/app/data` into their matching
   target mounts. Restore with original owner IDs and restrictive permissions.
5. Provide the exact OmniRoute `STORAGE_ENCRYPTION_KEY` used when the backup was
   taken. A different key will make encrypted SQLite data unreadable.
6. Start the test services and verify: Forgejo admin login and a private Git
   fetch, database connectivity, OmniRoute login and provider connection
   metadata, workspace files, code-server settings, CloudCLI session history,
   task status, SSH host-key fingerprint, and Git key files.
7. Verify at least one supported provider session can be manually resumed. Do
   not replay prompts automatically.
8. Record the source checksum, target deployment ID, test results, data loss
   window, and any failure. Remove the isolated test environment only after
   preserving the evidence needed for audit.

Do not mark the restore gate complete until each required store has been
restored and verified in a separate test target.
