#!/usr/bin/env bash
set -euo pipefail
umask 077

fail() {
  printf 'encrypted-backup-restore: %s\n' "$1" >&2
  exit 1
}

[[ $# -eq 1 ]] || fail "usage: AGE_IDENTITY=/external/path/to/identity $0 /absolute/path/to/encrypted-backup"

age_bin=${AGE_BIN:-age}
command -v "$age_bin" >/dev/null 2>&1 || fail "age is required on the local host"
command -v docker >/dev/null 2>&1 || fail "Docker is required on the local host"

repo_dir=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
backup_dir=$(realpath "$1" 2>/dev/null) || fail "the backup directory must exist"
[[ -d "$backup_dir" ]] || fail "the backup path must be a directory"
[[ -f "$backup_dir/manifest.txt" && ! -L "$backup_dir/manifest.txt" ]] || fail "manifest.txt is missing or is a symlink"
[[ -f "$backup_dir/SHA256SUMS" && ! -L "$backup_dir/SHA256SUMS" ]] || fail "SHA256SUMS is missing or is a symlink"
grep -qx 'format=clouddev-age-backup-v1' "$backup_dir/manifest.txt" || fail "the backup manifest format is not recognized"

if command -v shasum >/dev/null 2>&1; then
  checksum_tool=shasum
elif command -v sha256sum >/dev/null 2>&1; then
  checksum_tool=sha256sum
else
  fail "shasum or sha256sum is required to verify encrypted artifacts"
fi

age_identity=${AGE_IDENTITY:-}
[[ -n "$age_identity" ]] || fail "set AGE_IDENTITY to the matching private identity stored outside the repository and /workspace"

if [[ "$age_identity" == "-" ]]; then
  [[ ${CLOUDDEV_TEST_EPHEMERAL_IDENTITY:-0} == 1 ]] || fail "stdin identities are reserved for the isolated integration test"
  identity_text=$(cat)
  [[ -n "$identity_text" ]] || fail "no ephemeral test identity was provided on stdin"
  decrypt_to_stdout() {
    printf '%s\n' "$identity_text" | "$age_bin" --decrypt --identity - "$1"
  }
else
  [[ "$age_identity" == /* ]] || fail "AGE_IDENTITY must be an absolute path"
  [[ -f "$age_identity" && ! -L "$age_identity" ]] || fail "AGE_IDENTITY must name a regular, non-symlink file"
  identity_path=$(realpath "$age_identity" 2>/dev/null) || fail "AGE_IDENTITY could not be resolved"
  case "$identity_path" in
    "$repo_dir"|"$repo_dir"/*|/workspace|/workspace/*)
      fail "keep the age private identity outside the repository and /workspace"
      ;;
  esac
  identity_mode=$(stat -c '%a' "$identity_path" 2>/dev/null || stat -f '%Lp' "$identity_path" 2>/dev/null || true)
  [[ "$identity_mode" == 400 || "$identity_mode" == 600 ]] || fail "AGE_IDENTITY must have mode 0400 or 0600"
  decrypt_to_stdout() {
    "$age_bin" --decrypt --identity "$identity_path" "$1"
  }
fi

artifacts=(workspace.tar.gz.age forgejo-volume.tar.gz.age postgres.dump.age postgres-globals.sql.age omniroute.tar.gz.age)
for artifact in "${artifacts[@]}"; do
  artifact_path="$backup_dir/$artifact"
  [[ -f "$artifact_path" && ! -L "$artifact_path" ]] || fail "required encrypted artifact is missing or is a symlink: $artifact"

  if [[ "$checksum_tool" == shasum ]]; then
    actual_checksum=$(shasum -a 256 "$artifact_path" | awk '{print $1}')
  else
    actual_checksum=$(sha256sum "$artifact_path" | awk '{print $1}')
  fi
  expected_checksum=$(awk -v name="$artifact" '$2 == name { print $1 }' "$backup_dir/SHA256SUMS")
  [[ "$expected_checksum" =~ ^[[:xdigit:]]{64}$ && "$actual_checksum" == "$expected_checksum" ]] || fail "encrypted artifact checksum failed: $artifact"

  if ! decrypt_to_stdout "$artifact_path" >/dev/null; then
    fail "the supplied identity could not decrypt $artifact"
  fi
done

for artifact in workspace.tar.gz.age forgejo-volume.tar.gz.age omniroute.tar.gz.age; do
  if ! decrypt_to_stdout "$backup_dir/$artifact" | tar -tzf - | while IFS= read -r member; do
    case "$member" in
      /*|..|../*|*/../*|*/..) exit 1 ;;
    esac
  done; then
    fail "archive validation failed for $artifact"
  fi
done

for image in \
  alpine@sha256:4b7ce07002c69e8f3d704a9c5d6fd3053be500b7f1c69fc0d80990c2ad8dd412 \
  node@sha256:91acba91b842bec0bf7ea6f5e09c644c7ccad72c4996ed9616d861d1c7cd60d4 \
  postgres@sha256:898c60cb390d1085bc97bdd6a1ae968757421df394b071848b52b1c09c89d6a5; do
  docker image inspect "$image" >/dev/null 2>&1 || fail "restore test image is not available locally: $image"
done

random_suffix=$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')
restore_project="clouddev-encrypted-restore-$(date -u '+%Y%m%d%H%M%S')-$$-$random_suffix"
project_in_use() {
  [[ -n "$(docker ps --all --quiet --filter "label=com.docker.compose.project=$restore_project")" ]] || \
    [[ -n "$(docker volume ls --quiet --filter "label=com.docker.compose.project=$restore_project")" ]] || \
    [[ -n "$(docker network ls --quiet --filter "label=com.docker.compose.project=$restore_project")" ]]
}
while project_in_use; do
  random_suffix=$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')
  restore_project="clouddev-encrypted-restore-$(date -u '+%Y%m%d%H%M%S')-$$-$random_suffix"
done

restore_root=$(mktemp -d "${TMPDIR:-/tmp}/clouddev-encrypted-restore.XXXXXX")
compose_file="$restore_root/compose.yml"
restore_project_touched=0

restore_pg_password=$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')
export CLOUDDEV_RESTORE_PG_USER=clouddev_restore
export CLOUDDEV_RESTORE_PG_DB=restore_check
export CLOUDDEV_RESTORE_PG_PASSWORD=$restore_pg_password

cat > "$compose_file" <<'COMPOSE'
services:
  clouddev-ide:
    image: alpine@sha256:4b7ce07002c69e8f3d704a9c5d6fd3053be500b7f1c69fc0d80990c2ad8dd412
    volumes:
      - workspace-data:/workspace
  clouddev-git:
    image: alpine@sha256:4b7ce07002c69e8f3d704a9c5d6fd3053be500b7f1c69fc0d80990c2ad8dd412
    volumes:
      - forgejo-data:/var/lib/gitea
  clouddev-router:
    image: node@sha256:91acba91b842bec0bf7ea6f5e09c644c7ccad72c4996ed9616d861d1c7cd60d4
    volumes:
      - router-data:/app/data
  clouddev-postgres:
    image: postgres@sha256:898c60cb390d1085bc97bdd6a1ae968757421df394b071848b52b1c09c89d6a5
    environment:
      POSTGRES_DB: ${CLOUDDEV_RESTORE_PG_DB}
      POSTGRES_USER: ${CLOUDDEV_RESTORE_PG_USER}
      POSTGRES_PASSWORD: ${CLOUDDEV_RESTORE_PG_PASSWORD}
    volumes:
      - postgres-data:/var/lib/postgresql
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "clouddev_restore", "-d", "restore_check"]
      interval: 2s
      timeout: 2s
      retries: 30
volumes:
  workspace-data:
  forgejo-data:
  router-data:
  postgres-data:
COMPOSE
chmod 600 "$compose_file"

compose=(docker compose --project-name "$restore_project" --file "$compose_file")

cleanup() {
  status=$?
  trap - EXIT HUP INT TERM
  if [[ ${restore_project_touched:-0} -eq 1 ]]; then
    if ! "${compose[@]}" down --volumes >/dev/null; then
      printf 'encrypted-backup-restore: cleanup failed for isolated project %s\n' "$restore_project" >&2
      [[ $status -ne 0 ]] || status=1
    fi
  fi
  rm -rf "$restore_root"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

restore_project_touched=1
if ! decrypt_to_stdout "$backup_dir/workspace.tar.gz.age" | \
  "${compose[@]}" run --rm --no-deps --pull never --no-tty --user 0:0 --entrypoint tar \
  clouddev-ide -C /workspace -xzf -; then
  fail "workspace restore failed in the isolated project"
fi

if ! decrypt_to_stdout "$backup_dir/forgejo-volume.tar.gz.age" | \
  "${compose[@]}" run --rm --no-deps --pull never --no-tty --user 0:0 --entrypoint tar \
  clouddev-git -C /var/lib/gitea -xzf -; then
  fail "Forgejo volume restore failed in the isolated project"
fi

if ! decrypt_to_stdout "$backup_dir/omniroute.tar.gz.age" | \
  "${compose[@]}" run --rm --no-deps --pull never --no-tty --user 0:0 --entrypoint tar \
  clouddev-router -C /app/data -xzf -; then
  fail "OmniRoute volume restore failed in the isolated project"
fi

if ! "${compose[@]}" up --detach --wait --wait-timeout 90 --no-build --pull never clouddev-postgres; then
  fail "the isolated PostgreSQL restore target failed to start"
fi

if ! decrypt_to_stdout "$backup_dir/postgres-globals.sql.age" | \
  "${compose[@]}" exec --no-tty clouddev-postgres sh -ec \
  'exec psql --set=ON_ERROR_STOP=1 --username="$POSTGRES_USER" --dbname=postgres'; then
  fail "PostgreSQL role restore failed in the isolated project"
fi

if ! decrypt_to_stdout "$backup_dir/postgres.dump.age" | \
  "${compose[@]}" exec --no-tty clouddev-postgres sh -ec \
  'exec pg_restore --exit-on-error --no-owner --no-privileges --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"'; then
  fail "PostgreSQL restore failed in the isolated project"
fi

for target in \
  'clouddev-ide:/workspace' \
  'clouddev-git:/var/lib/gitea' \
  'clouddev-router:/app/data'; do
  service=${target%%:*}
  directory=${target#*:}
  if ! "${compose[@]}" run --rm --no-deps --pull never --no-tty --user 0:0 --entrypoint sh \
    "$service" -ec "test -n \"\$(find '$directory' -type f -print -quit)\""; then
    fail "restored files were not found in $service:$directory"
  fi
done

if ! "${compose[@]}" run --rm --no-deps --pull never --no-tty --user 0:0 --entrypoint node \
  clouddev-router --input-type=module -e \
  'import { DatabaseSync } from "node:sqlite"; const db = new DatabaseSync("/app/data/storage.sqlite", { readOnly: true }); const result = db.prepare("PRAGMA quick_check").get(); if (result.quick_check !== "ok") process.exit(1); db.close();'; then
  fail "OmniRoute SQLite integrity check failed"
fi

table_count=$("${compose[@]}" exec --no-tty clouddev-postgres psql \
  --username "$CLOUDDEV_RESTORE_PG_USER" --dbname "$CLOUDDEV_RESTORE_PG_DB" \
  --tuples-only --no-align --command \
  "SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema')")
[[ "$table_count" =~ ^[1-9][0-9]*$ ]] || fail "the restored PostgreSQL database contains no user tables"

role_count=$("${compose[@]}" exec --no-tty clouddev-postgres psql \
  --username "$CLOUDDEV_RESTORE_PG_USER" --dbname postgres \
  --tuples-only --no-align --command \
  "SELECT count(*) FROM pg_roles WHERE rolname = 'backup_test'")
[[ "$role_count" =~ ^[1-9][0-9]*$ ]] || fail "the restored PostgreSQL roles were not found"

if [[ ${CLOUDDEV_TEST_EXPECT_MARKERS:-0} == 1 ]]; then
  workspace_marker=$("${compose[@]}" run --rm --no-deps --pull never --no-tty --user 0:0 \
    --entrypoint sh clouddev-ide -ec 'cat /workspace/projects/restore-marker.txt')
  [[ "$workspace_marker" == WORKSPACE_RESTORE_MARKER ]] || fail "workspace fixture marker did not survive restore"

  forgejo_marker=$("${compose[@]}" run --rm --no-deps --pull never --no-tty --user 0:0 \
    --entrypoint sh clouddev-git -ec 'cat /var/lib/gitea/data/restore-marker.txt')
  [[ "$forgejo_marker" == FORGEJO_RESTORE_MARKER ]] || fail "Forgejo fixture marker did not survive restore"

  router_marker=$("${compose[@]}" run --rm --no-deps --pull never --no-tty --user 0:0 \
    --entrypoint node clouddev-router --input-type=module -e \
    'import { DatabaseSync } from "node:sqlite"; const db = new DatabaseSync("/app/data/storage.sqlite", { readOnly: true }); const row = db.prepare("SELECT value FROM fixture").get(); console.log(row?.value ?? ""); db.close();')
  [[ "$router_marker" == OMNIROUTE_RESTORE_MARKER ]] || fail "OmniRoute fixture marker did not survive restore"

  postgres_marker=$("${compose[@]}" exec --no-tty clouddev-postgres psql \
    --username "$CLOUDDEV_RESTORE_PG_USER" --dbname "$CLOUDDEV_RESTORE_PG_DB" \
    --tuples-only --no-align --command 'SELECT value FROM restore_fixture')
  [[ "$postgres_marker" == POSTGRES_RESTORE_MARKER ]] || fail "PostgreSQL fixture marker did not survive restore"
fi

printf 'Isolated restore passed for all four stores in project %s.\n' "$restore_project"
