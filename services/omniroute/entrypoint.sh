#!/bin/sh
set -eu

# Railway volumes are root-owned. Claim the data directory, then continue as
# the unprivileged node user. The long-running process is never root.
if [ "$(id -u)" -eq 0 ]; then
  data="${DATA_DIR:-/app/data}"
  install -d -o node -g node -m 0750 "$data"
  chown node:node "$data"
  cd /app
  exec runuser --preserve-environment -u node -- /opt/clouddev-router-entrypoint.sh "$@"
fi

cd /app
if [ -n "${CLOUDDEV_GATEWAY_BOOTSTRAP_SECRET:-}" ]; then
  nohup node /opt/clouddev-router-provision.mjs >/dev/null 2>&1 &
fi
exec /app/check-permissions.sh "$@"
