#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_dir"

npm --prefix .railway run typecheck

if [ -e railway.toml ] || [ -e railway.json ]; then
  printf '%s\n' 'Legacy Railway Config-as-Code files are not allowed.' >&2
  exit 1
fi

printf '%s\n' 'Railway IaC typecheck passed. A live config plan still requires a deliberately linked test project.'
