#!/bin/sh
set -eu

# Railway volumes are root-owned. Claim the data directory, then continue as
# the unprivileged node user. The long-running process is never root.
if [ "$(id -u)" -eq 0 ]; then
  data="${DATA_DIR:-/app/data}"
  install -d -o node -g node -m 0750 "$data"
  chown node:node "$data"
  cd /app
  exec runuser --preserve-environment -u node -- /app/check-permissions.sh "$@"
fi

exec /app/check-permissions.sh "$@"
