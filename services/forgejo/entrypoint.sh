#!/bin/sh

set -eu
umask 077
LC_ALL=C
export LC_ALL

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

require_value() {
  if [ -z "$2" ]; then
    fail "$1 is required; no credentials or configuration values were printed."
  fi
}

is_unsigned_integer() {
  case "$1" in
    ''|*[!0-9]*) return 1 ;;
    *) return 0 ;;
  esac
}

is_postgres_identifier() {
  case "$1" in
    [A-Za-z_]* ) ;;
    *) return 1 ;;
  esac
  case "$1" in
    *[!A-Za-z0-9_]* ) return 1 ;;
  esac
  [ "${#1}" -le 63 ]
}

is_hostname() {
  case "$1" in
    [A-Za-z0-9]*) ;;
    *) return 1 ;;
  esac
  case "$1" in
    *[!A-Za-z0-9.-]*) return 1 ;;
  esac
  [ "${#1}" -le 253 ]
}

root_url="${FORGEJO__server__ROOT_URL:-${FORGEJO_ROOT_URL:-}}"
root_domain="${RAILWAY_PUBLIC_DOMAIN:-}"
if [ -z "$root_url" ] && [ -n "$root_domain" ]; then
  is_hostname "$root_domain" || fail 'Forgejo public domain is invalid.'
  root_url="https://$root_domain/"
fi
if [ -n "$root_url" ]; then
  case "$root_url" in
    https://*|http://localhost:*|http://127.0.0.1:*) ;;
    *) fail 'Forgejo root URL must use HTTPS, or loopback HTTP for local development.' ;;
  esac
  case "$root_url" in
    *[[:space:]]*|*'@'*|*'?'*|*'#'*) fail 'Forgejo root URL contains unsupported characters.' ;;
  esac
  FORGEJO__server__ROOT_URL="$root_url"
  export FORGEJO__server__ROOT_URL
fi

ssh_enabled="${FORGEJO__server__START_SSH_SERVER:-false}"
ssh_disabled="${FORGEJO__server__DISABLE_SSH:-true}"
case "$ssh_enabled" in
  true|false) ;;
  *) fail 'Forgejo built-in SSH server setting is invalid.' ;;
esac
case "$ssh_disabled" in
  true|false) ;;
  *) fail 'Forgejo SSH disable setting is invalid.' ;;
esac

if [ "$ssh_enabled" = 'true' ]; then
  [ "$ssh_disabled" = 'false' ] || fail 'Forgejo SSH is enabled but DISABLE_SSH is true.'
  ssh_domain="${FORGEJO_SSH_DOMAIN:-${RAILWAY_TCP_PROXY_DOMAIN:-}}"
  ssh_port="${FORGEJO_SSH_PORT:-${RAILWAY_TCP_PROXY_PORT:-}}"
  ssh_listen_port="${FORGEJO_SSH_LISTEN_PORT:-2222}"
  is_hostname "$ssh_domain" || fail 'Forgejo SSH TCP proxy domain is required and must be valid.'
  for port in "$ssh_port" "$ssh_listen_port"; do
    is_unsigned_integer "$port" || fail 'Forgejo SSH TCP proxy port is invalid.'
    [ "$port" -ge 1 ] && [ "$port" -le 65535 ] || fail 'Forgejo SSH TCP proxy port is outside the valid range.'
  done
  FORGEJO__server__START_SSH_SERVER=true
  FORGEJO__server__DISABLE_SSH=false
  FORGEJO__server__SSH_DOMAIN="$ssh_domain"
  FORGEJO__server__SSH_PORT="$ssh_port"
  FORGEJO__server__SSH_LISTEN_HOST=0.0.0.0
  FORGEJO__server__SSH_LISTEN_PORT="$ssh_listen_port"
  export FORGEJO__server__START_SSH_SERVER FORGEJO__server__DISABLE_SSH
  export FORGEJO__server__SSH_DOMAIN FORGEJO__server__SSH_PORT
  export FORGEJO__server__SSH_LISTEN_HOST FORGEJO__server__SSH_LISTEN_PORT
elif [ "$ssh_disabled" = 'false' ]; then
  fail 'Forgejo SSH must use the built-in server when SSH is enabled.'
fi

config_path="${GITEA_APP_INI:-/var/lib/gitea/custom/conf/app.ini}"
bootstrap_sql="${FORGEJO_BOOTSTRAP_SQL:-/usr/local/share/clouddev/forgejo-bootstrap.sql}"
bootstrap_attempts="${FORGEJO_BOOTSTRAP_ATTEMPTS:-30}"
bootstrap_delay="${FORGEJO_BOOTSTRAP_DELAY_SECONDS:-2}"

require_value 'Forgejo PostgreSQL type' "${FORGEJO__database__DB_TYPE:-}"
[ "$FORGEJO__database__DB_TYPE" = 'postgres' ] || fail 'Forgejo must use PostgreSQL; startup was stopped.'
require_value 'Forgejo PostgreSQL private host' "${FORGEJO__database__HOST:-}"

pg_admin_host="${FORGEJO_POSTGRES_ADMIN_HOST:-}"
pg_admin_port="${FORGEJO_POSTGRES_ADMIN_PORT:-}"
pg_admin_database="${FORGEJO_POSTGRES_ADMIN_DATABASE:-}"
pg_admin_user="${FORGEJO_POSTGRES_ADMIN_USER:-}"
pg_admin_password="${FORGEJO_POSTGRES_ADMIN_PASSWORD:-}"
postgres_role="${FORGEJO_POSTGRES_ROLE:-}"
postgres_database="${FORGEJO_POSTGRES_DATABASE:-}"
postgres_password="${FORGEJO_POSTGRES_PASSWORD:-}"

require_value 'PostgreSQL administrative host' "$pg_admin_host"
require_value 'PostgreSQL administrative port' "$pg_admin_port"
require_value 'PostgreSQL administrative database' "$pg_admin_database"
require_value 'PostgreSQL administrative user' "$pg_admin_user"
require_value 'PostgreSQL administrative password' "$pg_admin_password"
require_value 'Forgejo PostgreSQL role' "$postgres_role"
require_value 'Forgejo PostgreSQL database name' "$postgres_database"
require_value 'Forgejo PostgreSQL application password' "$postgres_password"

is_unsigned_integer "$pg_admin_port" || fail 'PostgreSQL administrative port is invalid.'
[ "$pg_admin_port" -ge 1 ] && [ "$pg_admin_port" -le 65535 ] || fail 'PostgreSQL administrative port is outside the valid range.'
database_host="${FORGEJO__database__HOST%:*}"
if [ "$database_host" = "$FORGEJO__database__HOST" ]; then
  is_hostname "$database_host" || fail 'Forgejo PostgreSQL hostname is invalid.'
  FORGEJO__database__HOST="$database_host:$pg_admin_port"
else
  database_port="${FORGEJO__database__HOST##*:}"
  is_hostname "$database_host" || fail 'Forgejo PostgreSQL hostname is invalid.'
  is_unsigned_integer "$database_port" || fail 'Forgejo PostgreSQL port is invalid.'
  [ "$database_port" -ge 1 ] && [ "$database_port" -le 65535 ] || fail 'Forgejo PostgreSQL port is outside the valid range.'
fi
export FORGEJO__database__HOST
for identifier in "$pg_admin_database" "$pg_admin_user" "$postgres_role" "$postgres_database"; do
  is_postgres_identifier "$identifier" || fail 'PostgreSQL database or role name is invalid.'
done
[ "$pg_admin_user" != "$postgres_role" ] || fail 'PostgreSQL administrative and Forgejo roles must be different.'
[ "$pg_admin_database" != "$postgres_database" ] || fail 'PostgreSQL administrative and Forgejo databases must be different.'
[ "${#pg_admin_password}" -ge 16 ] || fail 'PostgreSQL administrative password must contain at least 16 bytes.'
[ "${#postgres_password}" -ge 16 ] || fail 'Forgejo PostgreSQL application password must contain at least 16 bytes.'
newline='
'
carriage_return="$(printf '\r')"
case "$pg_admin_password$postgres_password" in
  *"$newline"*|*"$carriage_return"*) fail 'PostgreSQL passwords must be single-line values.' ;;
esac

is_unsigned_integer "$bootstrap_attempts" || fail 'Forgejo database retry configuration is invalid.'
is_unsigned_integer "$bootstrap_delay" || fail 'Forgejo database retry configuration is invalid.'
[ "$bootstrap_attempts" -ge 1 ] && [ "$bootstrap_attempts" -le 60 ] || fail 'Forgejo database retry configuration is outside the allowed range.'
[ "$bootstrap_delay" -le 10 ] || fail 'Forgejo database retry configuration is outside the allowed range.'

# psql receives validated, non-secret identifiers as variables. The application
# password is supplied only through the hidden \password prompt on stdin.

bootstrap_username="${FORGEJO_ADMIN_USERNAME:-}"
bootstrap_email="${FORGEJO_ADMIN_EMAIL:-}"
bootstrap_password="${FORGEJO_ADMIN_PASSWORD:-}"

# Keep administrator credentials in non-exported shell variables. psql receives
# only the admin password as PGPASSWORD for the single client process.
unset FORGEJO_POSTGRES_ADMIN_HOST FORGEJO_POSTGRES_ADMIN_PORT
unset FORGEJO_POSTGRES_ADMIN_DATABASE FORGEJO_POSTGRES_ADMIN_USER
unset FORGEJO_POSTGRES_ADMIN_PASSWORD
unset FORGEJO_ADMIN_USERNAME FORGEJO_ADMIN_EMAIL FORGEJO_ADMIN_PASSWORD
unset FORGEJO_POSTGRES_PASSWORD FORGEJO__database__NAME
unset FORGEJO__database__USER FORGEJO__database__PASSWD
unset FORGEJO_POSTGRES_ROLE FORGEJO_POSTGRES_DATABASE
unset PGHOST PGPORT PGDATABASE PGUSER PGSERVICE PGSERVICEFILE PGPASSFILE PGPASSWORD PGOPTIONS

database_ready=0
attempt=1
while [ "$attempt" -le "$bootstrap_attempts" ]; do
  if {
    printf '%s\n%s\n' "$postgres_password" "$postgres_password"
  } | PGPASSWORD="$pg_admin_password" psql \
    -X -w --set=ON_ERROR_STOP=1 \
    --set="role=$postgres_role" --set="db=$postgres_database" \
    -h "$pg_admin_host" -p "$pg_admin_port" \
    -U "$pg_admin_user" -d "$pg_admin_database" \
    -f "$bootstrap_sql" >/dev/null 2>&1; then
    database_ready=1
    break
  fi
  if [ "$attempt" -lt "$bootstrap_attempts" ] && [ "$bootstrap_delay" -gt 0 ]; then
    sleep "$bootstrap_delay"
  fi
  attempt=$((attempt + 1))
done
[ "$database_ready" -eq 1 ] || fail 'Forgejo PostgreSQL role/database provisioning failed after the configured retries; diagnostic output was suppressed.'

# Give Forgejo its app database settings only after psql has exited. These
# values are consumed by the rootless image renderer and then the password is
# removed from the environment before any Forgejo CLI or web process starts.
FORGEJO__database__NAME="$postgres_database"
FORGEJO__database__USER="$postgres_role"
FORGEJO__database__PASSWD="$postgres_password"
export FORGEJO__database__NAME FORGEJO__database__USER FORGEJO__database__PASSWD

unset pg_admin_host pg_admin_port pg_admin_database pg_admin_user pg_admin_password
unset postgres_role postgres_database postgres_password
unset FORGEJO_POSTGRES_ROLE FORGEJO_POSTGRES_DATABASE FORGEJO_POSTGRES_PASSWORD
unset PGPASSWORD

# The official setup renderer is responsible for FORGEJO__SECTION__KEY values.
# Hide all upstream output so database credentials cannot enter service logs.
if ! docker-setup.sh >/dev/null 2>&1; then
  fail 'Forgejo configuration setup failed; diagnostic output was suppressed.'
fi
unset FORGEJO__database__PASSWD DB_PASSWD PGPASSWORD
unset FORGEJO_SSH_DOMAIN FORGEJO_SSH_PORT FORGEJO_SSH_LISTEN_PORT FORGEJO_ROOT_URL
unset RAILWAY_TCP_PROXY_DOMAIN RAILWAY_TCP_PROXY_PORT RAILWAY_PUBLIC_DOMAIN
unset FORGEJO__server__SSH_DOMAIN FORGEJO__server__SSH_PORT
unset FORGEJO__server__SSH_LISTEN_HOST FORGEJO__server__SSH_LISTEN_PORT
unset FORGEJO__server__START_SSH_SERVER FORGEJO__server__ROOT_URL

database_ready=0
attempt=1
while [ "$attempt" -le "$bootstrap_attempts" ]; do
  if forgejo --config "$config_path" migrate >/dev/null 2>&1; then
    database_ready=1
    break
  fi
  if [ "$attempt" -lt "$bootstrap_attempts" ] && [ "$bootstrap_delay" -gt 0 ]; then
    sleep "$bootstrap_delay"
  fi
  attempt=$((attempt + 1))
done
[ "$database_ready" -eq 1 ] || fail 'Forgejo PostgreSQL is not ready after the configured retries; diagnostic output was suppressed.'

admin_rows="$(forgejo --config "$config_path" admin user list --admin 2>/dev/null)" || \
  fail 'Forgejo could not check existing administrator accounts; diagnostic output was suppressed.'
admin_count="$(printf '%s\n' "$admin_rows" | awk 'NR > 1 && $1 ~ /^[0-9]+$/ { count++ } END { print count + 0 }')"

if [ "$admin_count" -eq 0 ]; then
  require_value 'First Forgejo administrator username' "$bootstrap_username"
  require_value 'First Forgejo administrator email' "$bootstrap_email"
  require_value 'First Forgejo administrator password' "$bootstrap_password"

  case "$bootstrap_username" in
    [A-Za-z0-9]*) ;;
    *) fail 'First Forgejo administrator username is invalid.' ;;
  esac
  case "$bootstrap_username" in
    *[!A-Za-z0-9_.-]*) fail 'First Forgejo administrator username is invalid.' ;;
  esac
  case "$bootstrap_email" in
    *[[:space:]]*) fail 'First Forgejo administrator email is invalid.' ;;
  esac
  [ "${#bootstrap_password}" -ge 16 ] || fail 'First Forgejo administrator password must contain at least 16 characters.'

  # Forgejo v17's documented CLI accepts the password only as --password.
  # Keep stdout/stderr redacted and create no access token.
  if ! forgejo --config "$config_path" admin user create \
    --username "$bootstrap_username" \
    --password "$bootstrap_password" \
    --email "$bootstrap_email" \
    --admin \
    --must-change-password >/dev/null 2>&1; then
    fail 'Forgejo first-administrator creation failed; credentials and CLI output were suppressed.'
  fi

  admin_rows="$(forgejo --config "$config_path" admin user list --admin 2>/dev/null)" || \
    fail 'Forgejo could not verify the first administrator; diagnostic output was suppressed.'
  if ! printf '%s\n' "$admin_rows" | awk -v username="$bootstrap_username" \
    'NR > 1 && $2 == username { found = 1 } END { exit found ? 0 : 1 }'; then
    fail 'Forgejo first-administrator creation could not be verified; diagnostic output was suppressed.'
  fi
fi

unset bootstrap_username bootstrap_email bootstrap_password
unset FORGEJO_ADMIN_USERNAME FORGEJO_ADMIN_EMAIL FORGEJO_ADMIN_PASSWORD
unset FORGEJO_POSTGRES_ADMIN_HOST FORGEJO_POSTGRES_ADMIN_PORT
unset FORGEJO_POSTGRES_ADMIN_DATABASE FORGEJO_POSTGRES_ADMIN_USER
unset FORGEJO_POSTGRES_ADMIN_PASSWORD FORGEJO_POSTGRES_PASSWORD PGPASSWORD
exec forgejo --config "$config_path" web
