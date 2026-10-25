# Encrypted backup artifacts Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create operator-key-encrypted local backups for the four CloudDev state stores and verify an isolated restore.

**Architecture:** A local maintenance script requires the operator to quiesce writes, then streams each store through `age` into a new restricted output directory. The decryption identity stays on the operator's machine and never enters Railway, the repository, `/workspace`, or agent environments. Railway volume snapshots remain platform-managed.

**Tech Stack:** POSIX shell, Docker Compose, age CLI, Node.js built-in test runner, PostgreSQL `pg_dump`, tar.

---

### Task 1: Define fail-closed backup behavior

**Files:**
- Create: `tests/unit/backup-encryption.test.mjs`
- Modify: `package.json`
- Create: `scripts/backup-encrypted.sh`

**Steps:**

1. Add tests for a missing recipient, missing destination, unsafe output paths, service command failures, and secret redaction.
2. Run `node --test tests/unit/backup-encryption.test.mjs` and confirm the new cases fail because the script is absent.
3. Implement argument validation and stream data to `age` without intermediate plaintext files.
4. Run the focused tests and then `npm test`.

### Task 2: Encrypt all four local stores

**Files:**
- Modify: `scripts/backup-encrypted.sh`
- Modify: `docs/security/BACKUP_RESTORE.md`
- Modify: `.env.example` only if a non-secret public recipient setting is required

**Steps:**

1. Capture the workspace, Forgejo volume, PostgreSQL database, PostgreSQL globals and OmniRoute SQLite state from the selected Compose project.
2. Stream every artifact into `age` using the operator's public recipient. Do not write plaintext archives first.
3. Add checksum and non-secret manifest handling. Do not record credentials or the private identity.
4. Document backup, key custody, key rotation and decryption for the operator.
5. Run `npm run test:encrypted-backup` and verify the output contains only encrypted artifacts plus non-secret metadata.

### Task 3: Prove isolated restore

**Files:**
- Create: `scripts/test-encrypted-backup-restore.sh`
- Create: `tests/integration/encrypted-backup-restore.test.mjs`
- Modify: `package.json`
- Modify: `docs/security/BACKUP_RESTORE.md`

**Steps:**

1. Start a uniquely named test Compose project with test-only data and credentials.
2. Create and encrypt all four backup artifacts.
3. Decrypt them into an isolated restore target and verify the workspace marker, private Git repository, PostgreSQL roles/data and OmniRoute encrypted database.
4. Ensure cleanup targets only the generated test project name and runs even when verification fails.
5. Run `npm run test:encrypted-restore` and keep the release restore gate open if Docker or age is unavailable.

### Task 4: Security and release verification

**Files:**
- Modify: `gates/encrypted-backups.md`
- Modify: `GATES.md`
- Modify: `docs/security/BACKUP_RESTORE.md`

**Steps:**

1. Run `npm run test:security` and inspect output for leaked secret values.
2. Run the full encrypted restore against an isolated project.
3. Run `git diff --check` and the documentation build.
4. Record evidence only for checks that actually ran. Do not claim Railway volume snapshots use the operator key.
