#!/bin/sh
set -eu

services="clouddev-router clouddev-ide clouddev-git clouddev-postgres"
status=0
clouddev_trivy_tmp_dir=${CLOUDDEV_TRIVY_TMP_DIR:-}

if ! command -v trivy >/dev/null 2>&1; then
  printf '%s\n' 'Trivy is required. Install it with the official package manager for this host.' >&2
  exit 2
fi

if [ -n "$clouddev_trivy_tmp_dir" ]; then
  mkdir -p "$clouddev_trivy_tmp_dir"
fi

for service in $services; do
  image_id=$(docker compose images --quiet "$service" | head -n 1)
  if [ -z "$image_id" ]; then
    printf 'No created local image was found for Compose service %s. Start the local stack first.\n' "$service" >&2
    status=1
    continue
  fi

  printf '\nScanning Compose service %s (%s)\n' "$service" "$image_id"
  if [ -n "$clouddev_trivy_tmp_dir" ]; then
    if ! TMPDIR="$clouddev_trivy_tmp_dir" trivy image --scanners vuln --severity HIGH,CRITICAL --exit-code 1 "$image_id"; then
      status=1
    fi
  elif ! trivy image --scanners vuln --severity HIGH,CRITICAL --exit-code 1 "$image_id"; then
    status=1
  fi
done

exit "$status"
