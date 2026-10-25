#!/bin/sh
set -eu
umask 077

case "${1:-}" in
  "") test_files="tests/unit/backup-encryption.test.mjs tests/integration/encrypted-backup-restore.test.mjs" ;;
  --restore-only) test_files="tests/integration/encrypted-backup-restore.test.mjs" ;;
  *) printf '%s\n' 'Usage: scripts/run-encrypted-backup-tests.sh [--restore-only]' >&2; exit 2 ;;
esac

for tool in age age-keygen docker node; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    printf 'Encrypted backup release test requires %s.\n' "$tool" >&2
    exit 2
  fi
done

if ! docker info --format '{{.ServerVersion}}' >/dev/null 2>&1; then
  printf '%s\n' 'Encrypted backup release test requires a running Docker Engine.' >&2
  exit 2
fi

for image in \
  alpine@sha256:4b7ce07002c69e8f3d704a9c5d6fd3053be500b7f1c69fc0d80990c2ad8dd412 \
  node@sha256:91acba91b842bec0bf7ea6f5e09c644c7ccad72c4996ed9616d861d1c7cd60d4 \
  postgres@sha256:898c60cb390d1085bc97bdd6a1ae968757421df394b071848b52b1c09c89d6a5; do
  if ! docker image inspect "$image" >/dev/null 2>&1; then
    printf 'Required restore-test image is missing locally: %s\n' "$image" >&2
    printf 'Pull it explicitly, then rerun this command. The test script never pulls images.\n' >&2
    exit 2
  fi
done

clouddev_age_test_dir=$(mktemp -d "${TMPDIR:-/tmp}/clouddev-age-test.XXXXXX")
chmod 700 "$clouddev_age_test_dir"
cleanup() {
  status=$?
  trap - EXIT HUP INT TERM
  rm -rf -- "$clouddev_age_test_dir"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

age-keygen -o "$clouddev_age_test_dir/identity.txt" >/dev/null 2>&1
chmod 600 "$clouddev_age_test_dir/identity.txt"
clouddev_age_test_recipient=$(age-keygen -y "$clouddev_age_test_dir/identity.txt" 2>/dev/null)
if [ -z "$clouddev_age_test_recipient" ]; then
  printf '%s\n' 'age-keygen did not return a public recipient.' >&2
  exit 2
fi

export AGE_TEST_IDENTITY="$clouddev_age_test_dir/identity.txt"
export AGE_TEST_RECIPIENT="$clouddev_age_test_recipient"
unset clouddev_age_test_recipient

# shellcheck disable=SC2086
node --test $test_files
