#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_dir"

if [ -e .env ] || [ -L .env ]; then
  printf '%s\n' '.env already exists; it was left unchanged.' >&2
  exit 1
fi

if ! command -v openssl >/dev/null 2>&1; then
  printf '%s\n' 'OpenSSL is required to generate local secrets.' >&2
  exit 1
fi
if ! command -v ssh-keygen >/dev/null 2>&1; then
  printf '%s\n' 'OpenSSH ssh-keygen is required to create a local-only Remote-SSH key.' >&2
  exit 1
fi

umask 077
key_directory="$project_dir/secrets"
local_key="$key_directory/local-remote-ssh"
mkdir -p "$key_directory"
chmod 700 "$key_directory"
if [ -L "$local_key" ] || [ -L "$local_key.pub" ]; then
  printf '%s\n' 'A local Remote-SSH key path is a symlink; it was left unchanged.' >&2
  exit 1
fi
if [ -e "$local_key" ] || [ -e "$local_key.pub" ]; then
  if [ ! -f "$local_key" ] || [ ! -f "$local_key.pub" ]; then
    printf '%s\n' 'An incomplete local Remote-SSH key pair exists; it was left unchanged.' >&2
    exit 1
  fi
else
  ssh-keygen -q -t ed25519 -f "$local_key" -C clouddev-local -N ''
  chmod 600 "$local_key"
  chmod 644 "$local_key.pub"
fi
local_ssh_public_key=$(sed -n '1p' "$local_key.pub")
case "$local_ssh_public_key" in
  'ssh-ed25519 '*) ;;
  *) printf '%s\n' 'The local Remote-SSH public key is invalid.' >&2; exit 1 ;;
esac

env_text=$(
  printf 'CODE_SERVER_PASSWORD=%s\n' "$(openssl rand -hex 32)"
  printf 'CLOUDDEV_WORKSPACE_AUTH_SECRET=%s\n' "$(openssl rand -hex 32)"
  printf 'CLOUDDEV_HTTP_PORT=8080\n'
  printf 'CLOUDDEV_CODE_SERVER_PORT=8081\n'
  printf 'CLOUDDEV_CLOUDCLI_PORT=3001\n'
  printf 'LAUNCHPAD_PORT=3002\n'
  printf 'LAUNCHPAD_BASE_PATH=/launchpad\n'
  printf 'CLOUDDEV_PROJECTS_DIR=/workspace/projects\n'
  printf 'SSH_AUTHORIZED_KEYS=%s\n' "$local_ssh_public_key"
  printf 'CLOUDDEV_SSH_PORT=2222\n'
  printf 'IDE_SSH_PROXY_HOST=localhost\n'
  printf 'IDE_SSH_PROXY_PORT=2222\n'
  printf 'CLOUDDEV_OMNIROUTE_HOST=clouddev-router\n'
  printf 'CLOUDDEV_OMNIROUTE_PORT=20128\n'
  printf 'CLOUDDEV_OMNIROUTE_PROXY_PORT=20129\n'
  printf 'CLOUDDEV_OMNIROUTE_BASE_URL=http://127.0.0.1:20129\n'
  printf 'CLOUDDEV_FORGEJO_HOST=clouddev-git\n'
  printf 'CLOUDDEV_FORGEJO_PORT=3000\n'
  printf 'WORKSPACE_PUBLIC_URL=http://localhost:8080\n'
  printf 'GIT_PUBLIC_URL=http://localhost:3000\n'
  printf 'ROUTER_PUBLIC_URL=http://localhost:8080/omniroute/dashboard/providers\n'
  printf 'FORGEJO_ROOT_URL=http://localhost:3000/\n'
  printf 'POSTGRES_DB=postgres\n'
  printf 'POSTGRES_USER=postgres\n'
  printf 'POSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 32)"
  printf 'FORGEJO_POSTGRES_ROLE=clouddev_forgejo\n'
  printf 'FORGEJO_POSTGRES_DATABASE=forgejo\n'
  printf 'FORGEJO_POSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 32)"
  printf 'FORGEJO_SSH_DOMAIN=localhost\n'
  printf 'FORGEJO_SSH_PORT=2223\n'
  printf 'FORGEJO_SSH_LISTEN_PORT=2222\n'
  printf 'GIT_SSH_PROXY_HOST=localhost\n'
  printf 'GIT_SSH_PROXY_PORT=2223\n'
  printf 'FORGEJO_ADMIN_USERNAME=owner\n'
  printf 'FORGEJO_ADMIN_EMAIL=owner@localhost.invalid\n'
  printf 'FORGEJO_ADMIN_PASSWORD=%s\n' "$(openssl rand -hex 32)"
  printf 'PORT=20128\n'
  printf 'INITIAL_PASSWORD=%s\n' "$(openssl rand -base64 24 | tr -d '\n')"
  printf 'JWT_SECRET=%s\n' "$(openssl rand -hex 48)"
  printf 'API_KEY_SECRET=%s\n' "$(openssl rand -hex 32)"
  printf 'STORAGE_ENCRYPTION_KEY=%s\n' "$(openssl rand -hex 32)"
  printf 'STORAGE_ENCRYPTION_KEY_VERSION=v1\n'
  printf 'MACHINE_ID_SALT=%s\n' "$(openssl rand -hex 32)"
  printf 'OMNIROUTE_WS_BRIDGE_SECRET=%s\n' "$(openssl rand -base64 32 | tr -d '\n')"
  printf 'AUTH_COOKIE_SECURE=false\n'
  printf 'REQUIRE_API_KEY=true\n'
  printf 'APP_LOG_LEVEL=warn\n'
  printf 'APP_LOG_TO_FILE=false\n'
  printf 'APP_LOG_RETENTION_DAYS=1\n'
  printf 'CALL_LOG_RETENTION_DAYS=1\n'
  printf 'ENABLE_REQUEST_LOGS=false\n'
  printf 'CALL_LOG_PIPELINE_CAPTURE_STREAM_CHUNKS=false\n'
  printf 'PROXY_LOG_INCLUDE_IPS=false\n'
  printf 'PROXY_LOG_FIRST_CHUNK_TIMING=false\n'
  printf 'ARENA_ELO_SYNC_ENABLED=false\n'
  printf 'MODELS_DEV_SYNC_ENABLED=false\n'
)

# noclobber closes the race between the existence check and creation without
# leaving secret-bearing temporary files behind.
set -C
if ! printf '%s\n' "$env_text" > .env; then
  printf '%s\n' 'Could not create .env without overwriting an existing file.' >&2
  exit 1
fi
set +C
unset env_text
unset local_ssh_public_key
chmod 600 .env
printf '%s\n' 'Created .env with independent random secrets and mode 0600.'
