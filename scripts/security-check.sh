#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_dir"

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

for legacy_file in railway.toml railway.json; do
  [ ! -e "$legacy_file" ] || fail "Forbidden legacy Railway config found: $legacy_file"
done

if git ls-files --error-unmatch .env >/dev/null 2>&1; then
  fail '.env must never be tracked by Git.'
fi

if [ -f .env ]; then
  mode=$(stat -f '%Lp' .env 2>/dev/null || stat -c '%a' .env)
  [ "$mode" = "600" ] || fail 'Local .env must have mode 0600.'
fi

node scripts/security-check.mjs
