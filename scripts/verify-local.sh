#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_dir"

if [ ! -f .env ] || [ -L .env ]; then
  printf '%s\n' 'Local .env is missing or unsafe. Run ./scripts/dev-env.sh first.' >&2
  exit 1
fi

npm test
npm run test:security
npm run check:compose
npm run check:railway
docker compose up -d --build --wait --wait-timeout 300
docker compose exec -T \
  -e CLOUDDEV_CADDY_BIN=/usr/bin/caddy \
  clouddev-ide \
  node --test /opt/clouddev-ide/test/caddy-proxy.integration.test.mjs
docker compose exec -T \
  -e CLOUDDEV_SSH_TEST_PATH=/run/clouddev-ssh/authorized_keys/coder \
  clouddev-ide \
  node --test /opt/clouddev-ide/test/authorized-keys.test.mjs
node scripts/verify-local.mjs
