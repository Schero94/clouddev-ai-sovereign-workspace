# Encrypted backup design

Status: approved by the user on 2026-10-25.

## Decision

Keep Railway's provider-managed storage encryption for live volumes. Keep
OmniRoute's existing SQLite encryption and preserve its independent
`STORAGE_ENCRYPTION_KEY`. Add a local backup path that encrypts each exported
store to an operator-controlled `age` recipient before the bytes reach a
durable backup file.

The public recipient may be used by the backup command. The private identity
stays outside Railway, the repository, the persistent workspace, and all agent
environments. Backups are useful only while that identity remains recoverable.
Do not store it beside the encrypted artifacts.

## Data and trust boundaries

The system has four persistent local stores: `/workspace`, `/var/lib/gitea`,
PostgreSQL, and OmniRoute's `/app/data`. The apps require plaintext while they
run. This design encrypts exported backup artifacts, not the mounted files
while a service is using them.

Railway's public Trust Center lists encryption at rest. Its public docs do not
describe a customer-managed key for Railway volumes. Railway Bucket server-side
encryption is not available, so a Railway Bucket must not be treated as the
encryption layer for an exported archive.

## Backup behavior

- Require an explicit operator acknowledgement that workspace and Git writes
  have been quiesced. Keep all four services running for read-only export; the
  script does not stop or restart a source project.
- Stream each archive or database dump directly into `age`; do not create an
  intermediate plaintext archive.
- Export PostgreSQL globals and the application database separately. Globals
  can contain role password hashes and must use the same encrypted-output path.
- Use restrictive file permissions and a new, explicit destination directory.
- Fail closed if the recipient, destination, required service, or encryption
  command is missing. Do not emit provider credentials or database passwords.
- Record only non-secret metadata needed to identify the encrypted store,
  source revision, timestamp, format, and checksum.
- Use Node's SQLite online backup API for OmniRoute. Its temporary database
  snapshot is kept only in the router container's `/dev/shm` tmpfs, not in the
  host's persistent storage or the backup destination.
- Restore only into a separately named, empty Compose project. Never overwrite
  a source volume as part of a restore test.

## Recovery and limitations

The operator must retain the matching private identity outside the deployment.
Losing it makes the corresponding archives unreadable. Retain prior identities
until every backup encrypted to them has expired or been re-encrypted and
verified. The OmniRoute database key is a separate recovery secret and must
also be retained securely.

The quiescence acknowledgement is not a technical lock. Workspace and Forgejo
file trees can still change during export if the operator leaves writers active.
For a strict cross-store point-in-time backup, use a separately reviewed
snapshot procedure.

This does not encrypt Railway-managed volume snapshots with a customer key. It
does not prevent a running service, a workspace agent, or an administrator
with runtime access from reading live plaintext. Whole-volume FUSE or block
encryption is excluded because the apps need plaintext, and the required mount
and privilege behavior is not established for Railway's managed volumes.

## Acceptance

The implementation must prove that encrypted output does not contain known
plaintext markers, that the intended identity can decrypt each artifact, and
that all four stores can be restored and checked in an isolated local Compose
project. The product restore gate stays open until that restore actually runs.
