import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const backupScript = path.join(root, "scripts/backup-encrypted.sh");
const restoreScript = path.join(root, "scripts/test-encrypted-backup-restore.sh");
const fixtureImages = [
  "alpine@sha256:4b7ce07002c69e8f3d704a9c5d6fd3053be500b7f1c69fc0d80990c2ad8dd412",
  "node@sha256:91acba91b842bec0bf7ea6f5e09c644c7ccad72c4996ed9616d861d1c7cd60d4",
  "postgres@sha256:898c60cb390d1085bc97bdd6a1ae968757421df394b071848b52b1c09c89d6a5",
];

function command(program, args, options = {}) {
  return spawnSync(program, args, { encoding: "utf8", ...options });
}

function prerequisiteFailure() {
  for (const program of ["docker", "age"]) {
    if (command("sh", ["-c", `command -v ${program}`]).status !== 0) return `${program} is not installed`;
  }
  if (!process.env.AGE_TEST_IDENTITY || !process.env.AGE_TEST_RECIPIENT) return "a dedicated external AGE_TEST_IDENTITY and AGE_TEST_RECIPIENT are required";
  if (!path.isAbsolute(process.env.AGE_TEST_IDENTITY) || !existsSync(process.env.AGE_TEST_IDENTITY)) return "AGE_TEST_IDENTITY must be an existing absolute path";
  if (lstatSync(process.env.AGE_TEST_IDENTITY).isSymbolicLink()) return "AGE_TEST_IDENTITY must not be a symlink";
  const identityPath = realpathSync(process.env.AGE_TEST_IDENTITY);
  const identityMode = statSync(identityPath).mode & 0o777;
  if (identityMode !== 0o400 && identityMode !== 0o600) return "AGE_TEST_IDENTITY must have mode 0400 or 0600";
  if (identityPath === root || identityPath.startsWith(`${root}${path.sep}`) || identityPath === "/workspace" || identityPath.startsWith("/workspace/")) {
    return "AGE_TEST_IDENTITY must be outside the repository and /workspace";
  }
  if (!process.env.AGE_TEST_RECIPIENT.startsWith("age1")) return "AGE_TEST_RECIPIENT must be an age public recipient";
  if (command("docker", ["info", "--format", "{{.ServerVersion}}" ]).status !== 0) return "Docker Engine is unavailable";
  for (const image of fixtureImages) {
    if (command("docker", ["image", "inspect", image]).status !== 0) return `test image ${image} is not already available locally`;
  }
  return false;
}

function composeFile(postgresPassword, storageEncryptionKey) {
  return `services:
  clouddev-ide:
    image: alpine@sha256:4b7ce07002c69e8f3d704a9c5d6fd3053be500b7f1c69fc0d80990c2ad8dd412
    command: ["sh", "-ec", "mkdir -p /workspace/projects && printf '%s' 'WORKSPACE_RESTORE_MARKER' > /workspace/projects/restore-marker.txt && exec sleep 3600"]
    volumes:
      - workspace-data:/workspace
  clouddev-git:
    image: alpine@sha256:4b7ce07002c69e8f3d704a9c5d6fd3053be500b7f1c69fc0d80990c2ad8dd412
    command: ["sh", "-ec", "mkdir -p /var/lib/gitea/data && printf '%s' 'FORGEJO_RESTORE_MARKER' > /var/lib/gitea/data/restore-marker.txt && exec sleep 3600"]
    volumes:
      - forgejo-data:/var/lib/gitea
  clouddev-router:
    image: node@sha256:91acba91b842bec0bf7ea6f5e09c644c7ccad72c4996ed9616d861d1c7cd60d4
    environment:
      DATA_DIR: /app/data
      STORAGE_ENCRYPTION_KEY: ${storageEncryptionKey}
    command:
      - node
      - --input-type=module
      - -e
      - |
        import { DatabaseSync } from 'node:sqlite';
        const db = new DatabaseSync('/app/data/storage.sqlite');
        db.exec('CREATE TABLE IF NOT EXISTS fixture(value TEXT)');
        db.prepare('INSERT INTO fixture VALUES (?)').run('OMNIROUTE_RESTORE_MARKER');
        setInterval(() => {}, 60000);
    volumes:
      - router-data:/app/data
  clouddev-postgres:
    image: postgres@sha256:898c60cb390d1085bc97bdd6a1ae968757421df394b071848b52b1c09c89d6a5
    environment:
      POSTGRES_DB: backup_test
      POSTGRES_USER: backup_test
      POSTGRES_PASSWORD: ${postgresPassword}
    volumes:
      - postgres-data:/var/lib/postgresql
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "backup_test", "-d", "backup_test"]
      interval: 2s
      timeout: 2s
      retries: 30
volumes:
  workspace-data:
  forgejo-data:
  router-data:
  postgres-data:
`;
}

function compose(project, file, args, options = {}) {
  const result = command("docker", ["compose", "--project-name", project, "--file", file, ...args], options);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

function runningContainerSnapshot() {
  const result = command("docker", ["ps", "--quiet", "--no-trunc"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const ids = result.stdout.trim().split(/\s+/).filter(Boolean);
  if (ids.length === 0) return new Map();
  const inspected = command("docker", ["inspect", "--format", "{{.Id}} {{.State.StartedAt}} {{.RestartCount}}", ...ids]);
  assert.equal(inspected.status, 0, inspected.stderr || inspected.stdout);
  return new Map(inspected.stdout.trim().split(/\r?\n/).filter(Boolean).map(line => {
    const [id, startedAt, restartCount] = line.split(" ");
    return [id, `${startedAt} ${restartCount}`];
  }));
}

const skipReason = prerequisiteFailure();

test("integration fixture passes Docker Compose configuration validation", {
  skip: command("docker", ["compose", "version"]).status === 0 ? false : "Docker Compose is unavailable",
}, () => {
  const tempDirectory = mkdtempSync(path.join(os.tmpdir(), "clouddev-encrypted-compose-check-"));
  const composePath = path.join(tempDirectory, "fixture-compose.yml");
  try {
    writeFileSync(composePath, composeFile(randomBytes(24).toString("hex"), randomBytes(32).toString("hex")), { mode: 0o600 });
    const result = command("docker", ["compose", "--file", composePath, "config", "--quiet"]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});

test("encrypted four-store restore uses only fresh isolated Compose projects", { skip: skipReason }, () => {
  const tempDirectory = mkdtempSync(path.join(os.tmpdir(), "clouddev-encrypted-restore-integration-"));
  const sourceProject = `clouddev-backup-source-${process.pid}-${randomBytes(5).toString("hex")}`;
  const composePath = path.join(tempDirectory, "fixture-compose.yml");
  const backupDirectory = path.join(tempDirectory, "encrypted-backup");
  const postgresPassword = randomBytes(24).toString("hex");
  const storageEncryptionKey = randomBytes(32).toString("hex");
  const initialContainers = runningContainerSnapshot();
  let sourceProjectCreated = false;

  try {
    writeFileSync(composePath, composeFile(postgresPassword, storageEncryptionKey), { mode: 0o600 });
    sourceProjectCreated = true;
    compose(sourceProject, composePath, ["up", "--detach", "--wait", "--wait-timeout", "90", "--pull", "never"], {
      env: { ...process.env, CLOUDDEV_TEST_POSTGRES_PASSWORD: postgresPassword, CLOUDDEV_TEST_STORAGE_KEY: storageEncryptionKey },
    });

    compose(sourceProject, composePath, ["exec", "--no-tty", "clouddev-postgres", "psql", "-U", "backup_test", "-d", "backup_test", "-v", "ON_ERROR_STOP=1", "-c", "CREATE TABLE restore_fixture (value text); INSERT INTO restore_fixture VALUES ('POSTGRES_RESTORE_MARKER')"]);

    const backup = command("bash", [backupScript, "--acknowledge-quiesced", backupDirectory], {
      cwd: root,
      env: { ...process.env, COMPOSE_FILE: composePath, COMPOSE_PROJECT_NAME: sourceProject, AGE_RECIPIENT: process.env.AGE_TEST_RECIPIENT },
    });
    assert.equal(backup.status, 0, backup.stderr || backup.stdout);

    const restore = command("bash", [restoreScript, backupDirectory], {
      cwd: root,
      env: { ...process.env, AGE_IDENTITY: process.env.AGE_TEST_IDENTITY, CLOUDDEV_TEST_EXPECT_MARKERS: "1" },
    });
    assert.equal(restore.status, 0, restore.stderr || restore.stdout);
    assert.match(restore.stdout, /isolated restore passed/i);

    const manifest = readFileSync(path.join(backupDirectory, "manifest.txt"), "utf8");
    assert.doesNotMatch(manifest, /AGE-SECRET-KEY|STORAGE_ENCRYPTION_KEY|POSTGRES_RESTORE_MARKER|WORKSPACE_RESTORE_MARKER/);
    const afterContainers = runningContainerSnapshot();
    for (const [id, state] of initialContainers) assert.equal(afterContainers.get(id), state, `pre-existing container ${id} changed during the isolated restore`);
  } finally {
    try {
      if (sourceProjectCreated) {
        const cleanup = command("docker", ["compose", "--project-name", sourceProject, "--file", composePath, "down", "--volumes"]);
        assert.equal(cleanup.status, 0, cleanup.stderr || cleanup.stdout);
      }
    } finally {
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  }
});
