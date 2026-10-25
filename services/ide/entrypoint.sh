#!/bin/sh
set -eu
umask 077

if [ "$(id -u)" -ne 0 ]; then
  printf '%s\n' "CloudDev startup must begin in the root supervisor." >&2
  exit 1
fi

IDE_UID=1000
IDE_GID=1000
CADDY_UID=1001
CADDY_GID=1001
LAUNCHPAD_UID=1002
LAUNCHPAD_GID=1002
WORKSPACE=/workspace
IDE_HOME=$WORKSPACE/home
PROJECTS_DIR=$WORKSPACE/projects
HOST_KEY_DIRECTORY=$WORKSPACE/system/ssh
HOST_KEY=$HOST_KEY_DIRECTORY/ssh_host_ed25519_key
PUBLIC_STATUS_DIRECTORY=$WORKSPACE/public-status

caddy_secret=${CODE_SERVER_PASSWORD:-}
workspace_password=$caddy_secret
workspace_auth_secret=${CLOUDDEV_WORKSPACE_AUTH_SECRET:-}
operator_keys=${SSH_AUTHORIZED_KEYS:-}
unset CODE_SERVER_PASSWORD SSH_AUTHORIZED_KEYS CLOUDDEV_WORKSPACE_AUTH_SECRET

if [ -z "$caddy_secret" ]; then
  printf '%s\n' "CloudDev requires a per-deployment CODE_SERVER_PASSWORD." >&2
  exit 1
fi
if [ -z "$operator_keys" ]; then
  printf '%s\n' "CloudDev requires SSH_AUTHORIZED_KEYS with operator Ed25519 public keys." >&2
  exit 1
fi
case "$workspace_auth_secret" in
  ''|*[!A-Za-z0-9_-]*) printf '%s\n' "CloudDev requires a generated workspace authentication secret." >&2; exit 1 ;;
esac
[ "${#workspace_auth_secret}" -ge 32 ] || {
  printf '%s\n' "CloudDev requires a generated workspace authentication secret." >&2
  exit 1
}

# With UsePAM disabled, OpenSSH rejects a Unix account whose shadow password is
# locked even when its public key is valid. Give coder an ephemeral random
# password hash so the account remains eligible, while sshd still accepts only
# public keys. The password itself is never logged, exported, or passed in argv.
random_coder_password=$(openssl rand -base64 48 | tr -d '\n')
if [ "${#random_coder_password}" -lt 48 ] || ! printf 'coder:%s\n' "$random_coder_password" | /usr/sbin/chpasswd >/dev/null 2>&1; then
  unset random_coder_password
  printf '%s\n' "CloudDev could not initialize the SSH-only account state." >&2
  exit 1
fi
unset random_coder_password

check_no_symlink() {
  if [ -L "$1" ]; then
    printf '%s\n' "CloudDev refuses a symlink at a protected runtime path." >&2
    exit 1
  fi
}

for directory in \
  "$WORKSPACE" "$IDE_HOME" "$PROJECTS_DIR" "$WORKSPACE/system" "$WORKSPACE/system/caddy" \
  "$WORKSPACE/system/launchpad" "$HOST_KEY_DIRECTORY" "$PUBLIC_STATUS_DIRECTORY" \
  "$IDE_HOME/.cloudcli" \
  /run/clouddev-caddy /run/clouddev-ssh /run/clouddev-ssh/authorized_keys /run/sshd; do
  check_no_symlink "$directory"
done

install -d -o root -g root -m 0755 "$WORKSPACE" "$WORKSPACE/system"
chown root:root "$WORKSPACE"
chmod 0755 "$WORKSPACE"
install -d -o "$IDE_UID" -g "$IDE_GID" -m 0700 "$IDE_HOME"
install -d -o "$IDE_UID" -g "$IDE_GID" -m 0750 "$PROJECTS_DIR"
install -d -o "$IDE_UID" -g "$IDE_GID" -m 0700 "$IDE_HOME/.cloudcli"
CLOUDDEV_BASHRC_HOME="$IDE_HOME" /usr/local/bin/node /opt/clouddev-ide/src/update-bashrc.mjs >/dev/null
install -d -o "$CADDY_UID" -g "$CADDY_GID" -m 0750 "$WORKSPACE/system/caddy"
install -d -o "$LAUNCHPAD_UID" -g "$LAUNCHPAD_GID" -m 0750 "$WORKSPACE/system/launchpad"
install -d -o root -g root -m 0700 "$HOST_KEY_DIRECTORY"
install -d -o "$IDE_UID" -g "$IDE_GID" -m 0755 "$PUBLIC_STATUS_DIRECTORY"
chown "$IDE_UID:$IDE_GID" "$PUBLIC_STATUS_DIRECTORY"
chmod 0755 "$PUBLIC_STATUS_DIRECTORY"
install -d -o root -g root -m 0755 /run/sshd

if [ -e "$HOST_KEY" ] || [ -e "$HOST_KEY.pub" ]; then
  if [ ! -f "$HOST_KEY" ] || [ ! -f "$HOST_KEY.pub" ] || [ -L "$HOST_KEY" ] || [ -L "$HOST_KEY.pub" ]; then
    printf '%s\n' "CloudDev found an incomplete or unsafe persistent SSH host-key pair." >&2
    exit 1
  fi
  private_public=$(ssh-keygen -y -f "$HOST_KEY" 2>/dev/null | awk 'NF >= 2 { print $1 " " $2; exit }') || {
    printf '%s\n' "CloudDev could not validate its persistent SSH host key." >&2
    exit 1
  }
  saved_public=$(awk 'NF >= 2 { print $1 " " $2; exit }' "$HOST_KEY.pub")
  if [ -z "$private_public" ] || [ "$private_public" != "$saved_public" ]; then
    printf '%s\n' "CloudDev persistent SSH host-key files do not match." >&2
    exit 1
  fi
else
  ssh-keygen -q -t ed25519 -N '' -C clouddev-workspace-host -f "$HOST_KEY"
fi
chown root:root "$HOST_KEY" "$HOST_KEY.pub"
chmod 0600 "$HOST_KEY"
chmod 0644 "$HOST_KEY.pub"
fingerprint=$(ssh-keygen -lf "$HOST_KEY.pub" 2>/dev/null | awk 'NR == 1 { print $2 }')
if [ "${#fingerprint}" -ne 50 ] || [ "${fingerprint#SHA256:}" = "$fingerprint" ]; then
  printf '%s\n' "CloudDev could not derive the persistent SSH host-key fingerprint." >&2
  exit 1
fi

CLOUDDEV_WORKSPACE_AUTH_SECRET="$workspace_auth_secret" /usr/local/bin/node /opt/clouddev-ide/src/write-caddy-config.mjs
unset caddy_secret CODE_SERVER_PASSWORD
SSH_AUTHORIZED_KEYS="$operator_keys" /usr/local/bin/node /opt/clouddev-ide/src/install-authorized-keys.mjs
unset operator_keys SSH_AUTHORIZED_KEYS

HOME="$IDE_HOME" CLOUDDEV_PROJECTS_DIR="$PROJECTS_DIR" /usr/local/bin/node /opt/clouddev-ide/src/write-server-config.mjs >/dev/null
chown "$IDE_UID:$IDE_GID" "$IDE_HOME/.config/code-server/config.yaml"
chmod 0600 "$IDE_HOME/.config/code-server/config.yaml"

# Reassert mount-root permissions after preparing all service-specific paths.
# The mount root must be traversable by the separate Caddy and launchpad UIDs.
chown root:root "$WORKSPACE"
chmod 0755 "$WORKSPACE"
workspace_metadata=$(stat -c '%u:%g:%a' "$WORKSPACE")
if [ "$workspace_metadata" != "0:0:755" ]; then
  printf '%s\n' "CloudDev workspace mount root permissions are invalid." >&2
  exit 1
fi
unset workspace_metadata

env -i \
  PATH=/usr/bin:/bin \
  HOME=/workspace/system/caddy \
  XDG_CONFIG_HOME=/workspace/system/caddy/config \
  XDG_DATA_HOME=/workspace/system/caddy/data \
  /usr/bin/setpriv --reuid="$CADDY_UID" --regid="$CADDY_GID" --clear-groups --no-new-privs --bounding-set=-all --inh-caps=-all --ambient-caps=-all \
    /usr/bin/caddy validate --config /run/clouddev-caddy/Caddyfile --adapter caddyfile
env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin /usr/sbin/sshd -t -f /etc/ssh/sshd_config

exec /usr/bin/env -i \
  PATH=/usr/local/bin:/usr/bin:/bin \
  HOME="$IDE_HOME" \
  NODE_ENV=production \
  CLOUDDEV_OMNIROUTE_BASE_URL="${CLOUDDEV_OMNIROUTE_BASE_URL:-http://127.0.0.1:20129}" \
  CLOUDDEV_LAUNCHPAD_NODE_ENV="${CLOUDDEV_LAUNCHPAD_NODE_ENV:-}" \
  CLOUDDEV_WORKSPACE_PASSWORD="$workspace_password" \
  CLOUDDEV_WORKSPACE_AUTH_SECRET="$workspace_auth_secret" \
  IDE_SSH_HOST_FINGERPRINT="$fingerprint" \
  WORKSPACE_PUBLIC_URL="${WORKSPACE_PUBLIC_URL:-}" \
  RAILWAY_PUBLIC_DOMAIN="${RAILWAY_PUBLIC_DOMAIN:-}" \
  IDE_PUBLIC_URL="${IDE_PUBLIC_URL:-}" \
  GIT_PUBLIC_URL="${GIT_PUBLIC_URL:-}" \
  ROUTER_PUBLIC_URL="${ROUTER_PUBLIC_URL:-}" \
  RAILWAY_TCP_PROXY_DOMAIN="${RAILWAY_TCP_PROXY_DOMAIN:-}" \
  RAILWAY_TCP_PROXY_PORT="${RAILWAY_TCP_PROXY_PORT:-}" \
  IDE_SSH_PROXY_HOST="${IDE_SSH_PROXY_HOST:-}" \
  IDE_SSH_PROXY_PORT="${IDE_SSH_PROXY_PORT:-}" \
  GIT_SSH_PROXY_HOST="${GIT_SSH_PROXY_HOST:-}" \
  GIT_SSH_PROXY_PORT="${GIT_SSH_PROXY_PORT:-}" \
  IDE_PRIVATE_HOST="${IDE_PRIVATE_HOST:-}" \
  IDE_PRIVATE_PORT="${IDE_PRIVATE_PORT:-}" \
  GIT_PRIVATE_HOST="${GIT_PRIVATE_HOST:-}" \
  GIT_PRIVATE_PORT="${GIT_PRIVATE_PORT:-}" \
  POSTGRES_HOST="${POSTGRES_HOST:-}" \
  POSTGRES_PORT="${POSTGRES_PORT:-}" \
  ROUTER_PRIVATE_HOST="${ROUTER_PRIVATE_HOST:-}" \
  ROUTER_PRIVATE_PORT="${ROUTER_PRIVATE_PORT:-}" \
  /usr/local/bin/node /opt/clouddev-ide/src/supervisor.mjs
