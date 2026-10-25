import os
import subprocess
import tempfile
import unittest
from pathlib import Path


SERVICE_DIR = Path(__file__).resolve().parent
ENTRYPOINT = SERVICE_DIR / "entrypoint.sh"
DOCKERFILE = SERVICE_DIR / "Dockerfile"
ADMIN_PASSWORD = 'unit-test secret with $dollar and "quotes"'
ADMIN_DB_PASSWORD = 'postgres admin secret $ with "quotes"'
APP_DB_PASSWORD = "forgejo app secret ; with ' quotes"


FAKE_SETUP = """#!/bin/sh
if [ "${SETUP_FAIL:-0}" = "1" ]; then
  printf '%s\\n' "$FORGEJO_TEST_EXPECTED_ADMIN_PASSWORD" >&2
  exit 1
fi
if [ -n "${FORGEJO_TEST_CONFIG_CAPTURE:-}" ]; then
  printf '%s\\n' \
    "ROOT_URL=${FORGEJO__server__ROOT_URL:-}" \
    "DATABASE_HOST=${FORGEJO__database__HOST:-}" \
    "SSH_DISABLED=${FORGEJO__server__DISABLE_SSH:-}" \
    "SSH_START=${FORGEJO__server__START_SSH_SERVER:-}" \
    "SSH_DOMAIN=${FORGEJO__server__SSH_DOMAIN:-}" \
    "SSH_PORT=${FORGEJO__server__SSH_PORT:-}" \
    "SSH_LISTEN_PORT=${FORGEJO__server__SSH_LISTEN_PORT:-}" \
    > "$FORGEJO_TEST_CONFIG_CAPTURE"
fi
printf '%s\\n' setup >> "$FORGEJO_TEST_EVENTS"
"""


FAKE_FORGEJO = r'''#!/usr/bin/env python3
import os
import pathlib
import sys

args = sys.argv[1:]
events = pathlib.Path(os.environ["FORGEJO_TEST_EVENTS"])
state = pathlib.Path(os.environ["FORGEJO_TEST_ADMIN_STATE"])
username = os.environ.get("FORGEJO_TEST_EXPECTED_ADMIN_USERNAME", "")
email = os.environ.get("FORGEJO_TEST_EXPECTED_ADMIN_EMAIL", "")
password = os.environ.get("FORGEJO_TEST_EXPECTED_ADMIN_PASSWORD", "")
database_passwords = (
    os.environ.get("FORGEJO_TEST_EXPECTED_ADMIN_DB_PASSWORD", ""),
    os.environ.get("FORGEJO_TEST_EXPECTED_APP_DB_PASSWORD", ""),
)
database_secret_in_argv = any(secret and secret in args for secret in database_passwords)

if database_secret_in_argv:
    record_event = "database-secret-in-argv"
elif "create" not in args and (
    any(key.startswith("FORGEJO_POSTGRES_ADMIN_") for key in os.environ)
    or os.environ.get("pg_admin_password")
    or os.environ.get("postgres_password")
    or os.environ.get("FORGEJO_ADMIN_PASSWORD")
    or os.environ.get("FORGEJO_POSTGRES_PASSWORD")
    or os.environ.get("FORGEJO__database__PASSWD")
    or os.environ.get("PGPASSWORD") == os.environ.get("FORGEJO_TEST_EXPECTED_ADMIN_DB_PASSWORD")
):
    record_event = "secret-env-retained"
else:
    record_event = ""

def record(event):
    with events.open("a", encoding="utf-8") as stream:
        stream.write(event + "\n")

if record_event:
    record(record_event)

if "migrate" in args:
    count_file = events.parent / "migration-count"
    count = int(count_file.read_text() if count_file.exists() else "0") + 1
    count_file.write_text(str(count))
    record("migrate")
    if count <= int(os.environ.get("FORGEJO_TEST_MIGRATION_FAILURES", "0")):
        print(password, file=sys.stderr)
        raise SystemExit(1)
elif "list" in args:
    record("list")
    if os.environ.get("FORGEJO_TEST_LIST_FAIL") == "1":
        print(password, file=sys.stderr)
        raise SystemExit(1)
    if state.exists():
        print("ID Username Email IsActive IsAdmin")
        print(f"1 {username} {email} true true")
elif "create" in args:
    password_index = args.index("--password") + 1 if "--password" in args else -1
    record(
        "create"
        if password_index > 0
        and args[password_index] == password
        and "--admin" in args
        and "--must-change-password" in args
        and "--access-token" not in args
        and not database_secret_in_argv
        and not any(key.startswith("FORGEJO_POSTGRES_ADMIN_") for key in os.environ)
        and not os.environ.get("pg_admin_password")
        and not os.environ.get("postgres_password")
        and not os.environ.get("FORGEJO_ADMIN_PASSWORD")
        and not os.environ.get("FORGEJO_POSTGRES_PASSWORD")
        and not os.environ.get("FORGEJO__database__PASSWD")
        and os.environ.get("PGPASSWORD") != os.environ.get("FORGEJO_TEST_EXPECTED_ADMIN_DB_PASSWORD")
        else "create-invalid"
    )
    if os.environ.get("FORGEJO_TEST_CREATE_FAIL") == "1":
        print(password, file=sys.stderr)
        raise SystemExit(1)
    if (
        password_index < 1
        or args[password_index] != password
        or "--admin" not in args
        or "--must-change-password" not in args
        or "--access-token" in args
        or username not in args
        or email not in args
        or database_secret_in_argv
        or any(key.startswith("FORGEJO_POSTGRES_ADMIN_") for key in os.environ)
        or os.environ.get("pg_admin_password")
        or os.environ.get("postgres_password")
        or os.environ.get("FORGEJO_ADMIN_PASSWORD")
        or os.environ.get("FORGEJO_POSTGRES_PASSWORD")
        or os.environ.get("FORGEJO__database__PASSWD")
        or os.environ.get("PGPASSWORD") == os.environ.get("FORGEJO_TEST_EXPECTED_ADMIN_DB_PASSWORD")
    ):
        raise SystemExit(2)
    state.touch()
elif "web" in args:
    if not (
        any(key.startswith("FORGEJO_POSTGRES_ADMIN_") for key in os.environ)
        or os.environ.get("pg_admin_password")
        or os.environ.get("postgres_password")
        or os.environ.get("FORGEJO_ADMIN_PASSWORD")
        or os.environ.get("FORGEJO_POSTGRES_PASSWORD")
        or os.environ.get("FORGEJO__database__PASSWD")
        or os.environ.get("PGPASSWORD") == os.environ.get("FORGEJO_TEST_EXPECTED_ADMIN_DB_PASSWORD")
    ):
        record("web")
    else:
        record("web-secret-env-retained")
    print("Forgejo web process started")
else:
    record("unexpected-command")
    raise SystemExit(64)
'''


FAKE_PSQL = r'''#!/usr/bin/env python3
import os
import pathlib
import sys

args = sys.argv[1:]
events = pathlib.Path(os.environ["FORGEJO_TEST_EVENTS"])
count_file = events.parent / "psql-count"
count = int(count_file.read_text() if count_file.exists() else "0") + 1
count_file.write_text(str(count))

def record(event):
    with events.open("a", encoding="utf-8") as stream:
        stream.write(event + "\n")

record("psql-attempt")
password = os.environ.get("PGPASSWORD", "")
stdin_passwords = sys.stdin.read().splitlines()
if (
    password != os.environ.get("FORGEJO_TEST_EXPECTED_ADMIN_DB_PASSWORD")
    or password in args
    or any(key.startswith("FORGEJO_POSTGRES_ADMIN_") for key in os.environ)
    or os.environ.get("pg_admin_password")
    or os.environ.get("postgres_password")
    or os.environ.get("FORGEJO_ADMIN_PASSWORD")
    or os.environ.get("FORGEJO_POSTGRES_PASSWORD")
    or os.environ.get("FORGEJO__database__PASSWD")
    or os.environ.get("FORGEJO_TEST_EXPECTED_APP_DB_PASSWORD") in args
    or os.environ.get("FORGEJO_POSTGRES_ROLE")
    or os.environ.get("FORGEJO_POSTGRES_DATABASE")
    or stdin_passwords != [os.environ.get("FORGEJO_TEST_EXPECTED_APP_DB_PASSWORD")] * 2
    or "-X" not in args
    or "-w" not in args
    or "--set=ON_ERROR_STOP=1" not in args
    or "--set=role=clouddev_forgejo" not in args
    or "--set=db=forgejo" not in args
    or "admin-postgres.internal" not in args
    or "admin_only_user" not in args
    or "postgres" not in args
    or "5432" not in args
):
    print(
        password + os.environ.get("FORGEJO_TEST_EXPECTED_APP_DB_PASSWORD", ""),
        file=sys.stderr,
    )
    raise SystemExit(2)

sql_path = pathlib.Path(os.environ["FORGEJO_TEST_BOOTSTRAP_SQL"])
sql = sql_path.read_text(encoding="utf-8")
required_sql = (
    r"\password :role",
    "format(",
    "%I",
    ":'role'",
    ":'db'",
    "REVOKE %I FROM %I",
    "ALTER DATABASE %I OWNER TO %I",
    "REVOKE ALL ON DATABASE %I FROM PUBLIC",
    "ALTER SCHEMA public OWNER TO :\"role\"",
    "REVOKE ALL ON SCHEMA public FROM PUBLIC",
    "GRANT ALL ON SCHEMA public TO :\"role\"",
    r"\gexec",
)
if not all(fragment in sql for fragment in required_sql):
    print(password, file=sys.stderr)
    raise SystemExit(3)
if count <= int(os.environ.get("FORGEJO_TEST_PSQL_FAILURES", "0")):
    print(
        password + os.environ.get("FORGEJO_TEST_EXPECTED_APP_DB_PASSWORD", ""),
        file=sys.stderr,
    )
    raise SystemExit(1)

record("role:create-if-missing")
record("role:restrict")
record("role:revoke-memberships")
record("role:update-password")
record("database:create-if-missing")
record("database:ensure-owner")
record("database:revoke-public")
record("schema:owner")
record("schema:revoke-public")
record("schema:grant-role")
'''


class ForgejoEntrypointTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory(prefix="clouddev-forgejo-test-")
        self.root = Path(self.temp_dir.name)
        self.bin_dir = self.root / "bin"
        self.bin_dir.mkdir()
        self.events = self.root / "events"
        self.admin_state = self.root / "admin-created"
        self._write_executable(self.bin_dir / "docker-setup.sh", FAKE_SETUP)
        self._write_executable(self.bin_dir / "forgejo", FAKE_FORGEJO)
        self._write_executable(self.bin_dir / "psql", FAKE_PSQL)

    def tearDown(self):
        self.temp_dir.cleanup()

    @staticmethod
    def _write_executable(path, contents):
        path.write_text(contents, encoding="utf-8")
        path.chmod(0o755)

    def _env(self, **overrides):
        env = os.environ.copy()
        env.update(
            {
                "PATH": f"{self.bin_dir}:{env['PATH']}",
                "FORGEJO_TEST_EVENTS": str(self.events),
                "FORGEJO_TEST_CONFIG_CAPTURE": str(self.root / "rendered-config.env"),
                "FORGEJO_TEST_ADMIN_STATE": str(self.admin_state),
                "FORGEJO_TEST_BOOTSTRAP_SQL": str(SERVICE_DIR / "bootstrap.sql"),
                "FORGEJO_TEST_EXPECTED_ADMIN_DB_PASSWORD": ADMIN_DB_PASSWORD,
                "FORGEJO_TEST_EXPECTED_APP_DB_PASSWORD": APP_DB_PASSWORD,
                "GITEA_APP_INI": str(self.root / "custom" / "conf" / "app.ini"),
                "FORGEJO__database__DB_TYPE": "postgres",
                "FORGEJO__database__HOST": "postgres:5432",
                "FORGEJO_POSTGRES_ADMIN_HOST": "admin-postgres.internal",
                "FORGEJO_POSTGRES_ADMIN_PORT": "5432",
                "FORGEJO_POSTGRES_ADMIN_DATABASE": "postgres",
                "FORGEJO_POSTGRES_ADMIN_USER": "admin_only_user",
                "FORGEJO_POSTGRES_ADMIN_PASSWORD": ADMIN_DB_PASSWORD,
                "FORGEJO_POSTGRES_ROLE": "clouddev_forgejo",
                "FORGEJO_POSTGRES_DATABASE": "forgejo",
                "FORGEJO_POSTGRES_PASSWORD": APP_DB_PASSWORD,
                "FORGEJO_ADMIN_USERNAME": "clouddev-admin",
                "FORGEJO_ADMIN_EMAIL": "clouddev-admin@example.invalid",
                "FORGEJO_ADMIN_PASSWORD": ADMIN_PASSWORD,
                "FORGEJO_TEST_EXPECTED_ADMIN_USERNAME": "clouddev-admin",
                "FORGEJO_TEST_EXPECTED_ADMIN_EMAIL": "clouddev-admin@example.invalid",
                "FORGEJO_TEST_EXPECTED_ADMIN_PASSWORD": ADMIN_PASSWORD,
                "FORGEJO_BOOTSTRAP_ATTEMPTS": "4",
                "FORGEJO_BOOTSTRAP_DELAY_SECONDS": "0",
            }
        )
        env.update({key: str(value) for key, value in overrides.items()})
        return env

    def _run(self, **env_overrides):
        return subprocess.run(
            ["/bin/sh", str(ENTRYPOINT)],
            env=self._env(**env_overrides),
            text=True,
            capture_output=True,
            check=False,
            timeout=10,
        )

    def _events(self):
        if not self.events.exists():
            return []
        return self.events.read_text(encoding="utf-8").splitlines()

    def test_initial_start_retries_database_and_creates_admin_once(self):
        result = self._run(
            FORGEJO_TEST_PSQL_FAILURES="2",
            FORGEJO_TEST_MIGRATION_FAILURES="2",
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            self._events(),
            [
                "psql-attempt",
                "psql-attempt",
                "psql-attempt",
                "role:create-if-missing",
                "role:restrict",
                "role:revoke-memberships",
                "role:update-password",
                "database:create-if-missing",
                "database:ensure-owner",
                "database:revoke-public",
                "schema:owner",
                "schema:revoke-public",
                "schema:grant-role",
                "setup",
                "migrate",
                "migrate",
                "migrate",
                "list",
                "create",
                "list",
                "web",
            ],
        )
        self.assertNotIn("secret-env-retained", self._events())
        self.assertNotIn("database-secret-in-argv", self._events())
        self.assertIn("Forgejo web process started", result.stdout)
        self.assertNotIn(ADMIN_PASSWORD, result.stdout + result.stderr)
        self.assertNotIn(ADMIN_DB_PASSWORD, result.stdout + result.stderr)
        self.assertNotIn(APP_DB_PASSWORD, result.stdout + result.stderr)
        self.assertNotIn("secret-env-retained", self._events())

    def test_restart_does_not_create_a_second_admin(self):
        self.admin_state.touch()

        result = self._run(
            FORGEJO_ADMIN_USERNAME="",
            FORGEJO_ADMIN_EMAIL="",
            FORGEJO_ADMIN_PASSWORD="",
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            self._events(),
            [
                "psql-attempt",
                "role:create-if-missing",
                "role:restrict",
                "role:revoke-memberships",
                "role:update-password",
                "database:create-if-missing",
                "database:ensure-owner",
                "database:revoke-public",
                "schema:owner",
                "schema:revoke-public",
                "schema:grant-role",
                "setup",
                "migrate",
                "list",
                "web",
            ],
        )
        self.assertNotIn("secret-env-retained", self._events())
        self.assertNotIn("database-secret-in-argv", self._events())
        self.assertNotIn(ADMIN_PASSWORD, result.stdout + result.stderr)

    def test_database_settings_are_required_and_must_select_postgres(self):
        for overrides in (
            {"FORGEJO_POSTGRES_PASSWORD": ""},
            {"FORGEJO__database__DB_TYPE": "sqlite3"},
            {"FORGEJO__database__HOST": ""},
            {"FORGEJO_POSTGRES_ADMIN_PASSWORD": ""},
        ):
            with self.subTest(overrides=overrides):
                self.events.unlink(missing_ok=True)
                result = self._run(**overrides)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(self._events(), [])
                self.assertNotIn(ADMIN_PASSWORD, result.stdout + result.stderr)

    def test_app_database_host_uses_the_bootstrap_port_when_host_has_no_port(self):
        result = self._run(
            FORGEJO__database__HOST="postgres.internal",
            FORGEJO_POSTGRES_ADMIN_PORT="5432",
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        rendered = dict(
            line.split("=", 1)
            for line in (self.root / "rendered-config.env").read_text(encoding="utf-8").splitlines()
        )
        self.assertEqual(rendered["DATABASE_HOST"], "postgres.internal:5432")

    def test_internal_ssh_server_uses_the_external_tcp_proxy_and_private_listen_port(self):
        result = self._run(
            RAILWAY_PUBLIC_DOMAIN="forgejo.up.railway.app",
            FORGEJO__server__START_SSH_SERVER="true",
            FORGEJO__server__DISABLE_SSH="false",
            FORGEJO_SSH_DOMAIN="forgejo.proxy.rlwy.net",
            FORGEJO_SSH_PORT="41234",
            FORGEJO_SSH_LISTEN_PORT="2222",
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        rendered = dict(
            line.split("=", 1)
            for line in (self.root / "rendered-config.env").read_text(encoding="utf-8").splitlines()
        )
        self.assertEqual(rendered["ROOT_URL"], "https://forgejo.up.railway.app/")
        self.assertEqual(rendered["SSH_DISABLED"], "false")
        self.assertEqual(rendered["SSH_START"], "true")
        self.assertEqual(rendered["SSH_DOMAIN"], "forgejo.proxy.rlwy.net")
        self.assertEqual(rendered["SSH_PORT"], "41234")
        self.assertEqual(rendered["SSH_LISTEN_PORT"], "2222")

    def test_internal_ssh_server_fails_closed_without_tcp_proxy_details(self):
        result = self._run(
            FORGEJO__server__START_SSH_SERVER="true",
            FORGEJO__server__DISABLE_SSH="false",
            FORGEJO_SSH_DOMAIN="",
            FORGEJO_SSH_PORT="",
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("proxy", result.stderr.lower())
        self.assertNotIn("setup", self._events())
        self.assertNotIn("web", self._events())

    def test_missing_first_admin_credentials_fail_before_web_starts(self):
        result = self._run(
            FORGEJO_ADMIN_USERNAME="",
            FORGEJO_ADMIN_EMAIL="",
            FORGEJO_ADMIN_PASSWORD="",
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(
            self._events(),
            [
                "psql-attempt",
                "role:create-if-missing",
                "role:restrict",
                "role:revoke-memberships",
                "role:update-password",
                "database:create-if-missing",
                "database:ensure-owner",
                "database:revoke-public",
                "schema:owner",
                "schema:revoke-public",
                "schema:grant-role",
                "setup",
                "migrate",
                "list",
            ],
        )
        self.assertNotIn("create", self._events())
        self.assertNotIn("web", self._events())
        self.assertNotIn(ADMIN_PASSWORD, result.stdout + result.stderr)

    def test_database_failure_never_creates_admin_or_starts_web(self):
        result = self._run(
            FORGEJO_TEST_MIGRATION_FAILURES="99",
            FORGEJO_BOOTSTRAP_ATTEMPTS="2",
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(
            self._events(),
            [
                "psql-attempt",
                "role:create-if-missing",
                "role:restrict",
                "role:revoke-memberships",
                "role:update-password",
                "database:create-if-missing",
                "database:ensure-owner",
                "database:revoke-public",
                "schema:owner",
                "schema:revoke-public",
                "schema:grant-role",
                "setup",
                "migrate",
                "migrate",
            ],
        )
        self.assertNotIn("create", self._events())
        self.assertNotIn("web", self._events())
        self.assertNotIn(ADMIN_PASSWORD, result.stdout + result.stderr)

    def test_postgres_role_and_database_bootstrap_failure_retries_and_redacts(self):
        result = self._run(
            FORGEJO_TEST_PSQL_FAILURES="20",
            FORGEJO_BOOTSTRAP_ATTEMPTS="2",
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self._events(), ["psql-attempt", "psql-attempt"])
        self.assertNotIn("setup", self._events())
        self.assertNotIn("migrate", self._events())
        self.assertNotIn("web", self._events())
        for secret in (ADMIN_DB_PASSWORD, APP_DB_PASSWORD, ADMIN_PASSWORD):
            self.assertNotIn(secret, result.stdout + result.stderr)

    def test_postgres_identifiers_are_validated_before_sql_client_runs(self):
        result = self._run(FORGEJO_POSTGRES_ROLE='role; DROP DATABASE postgres;--')

        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self._events(), [])
        self.assertNotIn(ADMIN_DB_PASSWORD, result.stdout + result.stderr)

    def test_database_bootstrap_sql_uses_identifier_and_literal_quoting(self):
        sql = (SERVICE_DIR / "bootstrap.sql").read_text(encoding="utf-8")

        self.assertIn("%I", sql)
        self.assertIn(":'role'", sql)
        self.assertIn(":'db'", sql)
        self.assertIn(r"\password :role", sql)
        self.assertNotIn(r"\getenv", sql)
        self.assertNotIn("FORGEJO_POSTGRES_PASSWORD", sql)
        self.assertNotIn("FORGEJO_POSTGRES_ADMIN_PASSWORD", sql)
        self.assertIn(r"\gexec", sql)
        self.assertNotIn(ADMIN_DB_PASSWORD, sql)
        self.assertNotIn(APP_DB_PASSWORD, sql)
        sequence = (
            "CREATE ROLE %I",
            "ALTER ROLE %I",
            "REVOKE %I FROM %I",
            r"\password :role",
            "CREATE DATABASE %I",
            "ALTER DATABASE %I OWNER TO %I",
            "REVOKE ALL ON DATABASE %I FROM PUBLIC",
            r'\connect :"db"',
            "ALTER SCHEMA public OWNER",
            "REVOKE ALL ON SCHEMA public FROM PUBLIC",
            "GRANT ALL ON SCHEMA public TO",
        )
        positions = [sql.index(fragment) for fragment in sequence]
        self.assertEqual(positions, sorted(positions))

    def test_failed_admin_query_fails_closed_without_creating_user(self):
        result = self._run(FORGEJO_TEST_LIST_FAIL="1")

        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("create", self._events())
        self.assertNotIn("web", self._events())
        self.assertNotIn(ADMIN_PASSWORD, result.stdout + result.stderr)

    def test_cli_failure_output_is_redacted(self):
        result = self._run(FORGEJO_TEST_CREATE_FAIL="1")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("create", self._events())
        self.assertNotIn("web", self._events())
        self.assertNotIn(ADMIN_PASSWORD, result.stdout + result.stderr)

    def test_setup_failure_output_is_redacted(self):
        result = self._run(SETUP_FAIL="1")

        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(
            self._events(),
            [
                "psql-attempt",
                "role:create-if-missing",
                "role:restrict",
                "role:revoke-memberships",
                "role:update-password",
                "database:create-if-missing",
                "database:ensure-owner",
                "database:revoke-public",
                "schema:owner",
                "schema:revoke-public",
                "schema:grant-role",
            ],
        )
        self.assertNotIn(ADMIN_PASSWORD, result.stdout + result.stderr)

    def test_production_image_is_digest_pinned_and_has_secure_defaults(self):
        dockerfile = DOCKERFILE.read_text(encoding="utf-8")

        self.assertIn(
            "codeberg.org/forgejo/forgejo:17.0.0-rootless@sha256:"
            "6554520f7574602100b7d6620c6ac5b18cec30325f823777497eac36234f5cf8",
            dockerfile,
        )
        for config in (
            "FORGEJO__database__DB_TYPE=postgres",
            "FORGEJO__service__DISABLE_REGISTRATION=true",
            "FORGEJO__service__REQUIRE_SIGNIN_VIEW=true",
            "FORGEJO__repository__DEFAULT_PRIVATE=private",
            "FORGEJO__security__INSTALL_LOCK=true",
            "FORGEJO__server__DISABLE_SSH=true",
        ):
            with self.subTest(config=config):
                self.assertIn(config, dockerfile)
        self.assertIn("USER 1000:1000", dockerfile)
        self.assertIn("postgresql17-client=17.11-r0", dockerfile)
        self.assertIn("FROM codeberg.org/forgejo/forgejo:17.0.0-rootless", dockerfile)
        self.assertIn("USER root", dockerfile)
        self.assertIn('VOLUME ["/var/lib/gitea"]', dockerfile)
        self.assertIn("EXPOSE 3000 2222", dockerfile)
        self.assertIn("/api/healthz", dockerfile)
        self.assertNotIn("FORGEJO_ADMIN_PASSWORD=", dockerfile)


if __name__ == "__main__":
    unittest.main(verbosity=2)
