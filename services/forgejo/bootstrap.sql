\set ON_ERROR_STOP on
-- psql quotes each input as an SQL literal; format(%I) emits identifiers.
SELECT format(
    'CREATE ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS',
    :'role'
)
WHERE NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = :'role'
)
\gexec

SELECT format(
    'ALTER ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS',
    :'role'
)
\gexec

-- Remove memberships from any pre-existing role with this reserved name.
SELECT format('REVOKE %I FROM %I', granted.rolname, :'role')
FROM pg_catalog.pg_auth_members AS membership
JOIN pg_catalog.pg_roles AS granted ON granted.oid = membership.roleid
WHERE membership.member = (
    SELECT oid FROM pg_catalog.pg_roles WHERE rolname = :'role'
)
\gexec

-- psql obtains the password from its non-echoing prompt, hashes it client-side,
-- and sends only the verifier to PostgreSQL. Two lines are supplied on stdin.
\password :role

-- CREATE DATABASE cannot run inside a transaction. Each \gexec sends its
-- generated statement separately and ON_ERROR_STOP aborts on the first error.
SELECT format(
    'CREATE DATABASE %I WITH OWNER %I TEMPLATE template0 ENCODING %L',
    :'db',
    :'role',
    'UTF8'
)
WHERE NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_database WHERE datname = :'db'
)
\gexec

SELECT format('ALTER DATABASE %I OWNER TO %I', :'db', :'role')
WHERE EXISTS (
    SELECT 1 FROM pg_catalog.pg_database WHERE datname = :'db'
)
\gexec

SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', :'db')
WHERE EXISTS (
    SELECT 1 FROM pg_catalog.pg_database WHERE datname = :'db'
)
\gexec

\connect :"db"
ALTER SCHEMA public OWNER TO :"role";
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT ALL ON SCHEMA public TO :"role";
