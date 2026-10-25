#!/usr/bin/env bash
set -euo pipefail
umask 077

fail() {
  printf 'backup-encrypted: %s\n' "$1" >&2
  exit 1
}

if [[ $# -ne 2 || "$1" != "--acknowledge-quiesced" ]]; then
  fail "quiesce workspace and Git writes, then use: AGE_RECIPIENT=age1... $0 --acknowledge-quiesced /absolute/path/to/new-backup-directory"
fi

age_recipient=${AGE_RECIPIENT:-}
[[ -n "$age_recipient" ]] || fail "set AGE_RECIPIENT to an age public recipient"
[[ "$age_recipient" == age1* ]] || fail "AGE_RECIPIENT must be an age public key"

age_bin=${AGE_BIN:-age}
command -v "$age_bin" >/dev/null 2>&1 || fail "age is required on the local host"
command -v docker >/dev/null 2>&1 || fail "Docker is required on the local host"

if command -v shasum >/dev/null 2>&1; then
  checksum_tool=shasum
elif command -v sha256sum >/dev/null 2>&1; then
  checksum_tool=sha256sum
else
  fail "shasum or sha256sum is required to record encrypted artifact checksums"
fi

destination=$2
[[ "$destination" == /* ]] || fail "the destination must be an absolute path"
destination_parent=${destination%/*}
destination_name=${destination##*/}
[[ -n "$destination_parent" ]] || destination_parent=/
[[ -n "$destination_name" && "$destination_name" != "." && "$destination_name" != ".." ]] || fail "the destination must name a new directory"
[[ -d "$destination_parent" ]] || fail "the destination parent directory must already exist"
canonical_parent=$(CDPATH= cd -- "$destination_parent" && pwd -P)
destination_path="$canonical_parent/$destination_name"
repo_dir=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)

case "$destination_path" in
  "$repo_dir"|"$repo_dir"/*|/workspace|/workspace/*)
    fail "the encrypted backup destination must be outside the repository and /workspace"
    ;;
esac

[[ ! -e "$destination_path" && ! -L "$destination_path" ]] || fail "the destination already exists; choose a new directory"

for service in clouddev-ide clouddev-git clouddev-postgres clouddev-router; do
  if ! running_containers=$(docker compose ps --status running --quiet "$service" 2>/dev/null); then
    fail "could not inspect the Compose service $service"
  fi
  [[ -n "$running_containers" ]] || fail "Compose service $service must already be running; this script never starts, stops, or restarts services"
done

mkdir -m 700 "$destination_path"
destination_created=1

cleanup() {
  status=$?
  trap - EXIT HUP INT TERM
  if [[ $status -ne 0 && ${destination_created:-0} -eq 1 ]]; then
    rm -rf "$destination_path"
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

encrypt_stream() {
  local artifact=$1
  shift
  local partial="$destination_path/.${artifact}.partial"

  if ! "$@" | "$age_bin" --encrypt --recipient "$age_recipient" --output "$partial"; then
    fail "could not export and encrypt $artifact"
  fi
  mv "$partial" "$destination_path/$artifact"
}

encrypt_stream workspace.tar.gz.age \
  docker compose exec --no-tty clouddev-ide tar -C /workspace -czf - .

encrypt_stream forgejo-volume.tar.gz.age \
  docker compose exec --no-tty clouddev-git tar -C /var/lib/gitea -czf - .

encrypt_stream postgres.dump.age \
  docker compose exec --no-tty clouddev-postgres sh -ec \
  'exec pg_dump --format=custom --no-owner --no-privileges --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"'

encrypt_stream postgres-globals.sql.age \
  docker compose exec --no-tty clouddev-postgres sh -ec \
  'exec pg_dumpall --globals-only --username="$POSTGRES_USER"'

encrypt_stream omniroute.tar.gz.age \
  docker compose exec --no-tty clouddev-router sh -ec '
    set -eu
    test -r /app/data/storage.sqlite
    tmp_root=$(mktemp -d /dev/shm/clouddev-age-backup.XXXXXX)
    trap "rm -rf \"$tmp_root\"" EXIT HUP INT TERM
    mkdir "$tmp_root/data"
    find /app/data -mindepth 1 -maxdepth 1 \
      ! -name storage.sqlite \
      ! -name "storage.sqlite-wal" \
      ! -name "storage.sqlite-shm" \
      ! -name "storage.sqlite-journal" \
      -exec cp -a {} "$tmp_root/data/" \;
    node --input-type=module -e "import { DatabaseSync, backup } from '\''node:sqlite'\''; const source = new DatabaseSync('\''/app/data/storage.sqlite'\'', { readOnly: true }); try { await backup(source, process.argv[1]); } finally { source.close(); }" "$tmp_root/data/storage.sqlite"
    tar -C "$tmp_root/data" -czf - .
  '

source_revision=$(git -C "$repo_dir" rev-parse --short=12 HEAD 2>/dev/null || printf 'unknown')
created_at=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
artifacts=(workspace.tar.gz.age forgejo-volume.tar.gz.age postgres.dump.age postgres-globals.sql.age omniroute.tar.gz.age)

(
  cd "$destination_path"
  for artifact in "${artifacts[@]}"; do
    if [[ "$checksum_tool" == shasum ]]; then
      shasum -a 256 "$artifact"
    else
      sha256sum "$artifact"
    fi
  done
) > "$destination_path/.SHA256SUMS.partial"
mv "$destination_path/.SHA256SUMS.partial" "$destination_path/SHA256SUMS"

{
  printf 'format=clouddev-age-backup-v1\n'
  printf 'created_utc=%s\n' "$created_at"
  printf 'source_revision=%s\n' "$source_revision"
  printf 'encryption=age-recipient\n'
  printf 'stores=workspace,forgejo-volume,postgres-database,postgres-globals,omniroute\n'
  printf 'artifacts=%s\n' "${artifacts[*]}"
} > "$destination_path/.manifest.partial"
mv "$destination_path/.manifest.partial" "$destination_path/manifest.txt"

destination_created=0
printf 'Encrypted four-store backup written to %s\n' "$destination_path"
