import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const backupScript = path.join(root, "scripts/backup-encrypted.sh");
const restoreScript = path.join(root, "scripts/test-encrypted-backup-restore.sh");
const temporaryDirectories = new Set();

test.afterEach(() => {
  for (const directory of temporaryDirectories) rmSync(directory, { recursive: true, force: true });
  temporaryDirectories.clear();
});

function makeFixture() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "clouddev-encrypted-backup-test-"));
  temporaryDirectories.add(directory);
  const bin = path.join(directory, "bin");
  mkdirSync(bin);

  writeExecutable(path.join(bin, "docker"), `#!/bin/sh
set -eu
printf '%s\\n' "$*" >> "$TRACE_FILE"
if [ "$1" = compose ] && [ "$2" = ps ]; then
  service=
  for argument do service=$argument; done
  if [ -n "\${EMPTY_SERVICE:-}" ] && [ "$service" = "$EMPTY_SERVICE" ]; then exit 0; fi
  printf '%s\\n' fixture-container-id
  exit 0
fi
if [ "$1" = compose ] && [ "$2" = exec ]; then
  case "$*" in
    *clouddev-ide*) printf '%s\\n' 'WORKSPACE_PRIVATE_MARKER' ;;
    *clouddev-git*) printf '%s\\n' 'FORGEJO_PRIVATE_MARKER' ;;
    *pg_dumpall*) printf '%s\\n' 'POSTGRES_GLOBALS_PRIVATE_MARKER' ;;
    *clouddev-postgres*) printf '%s\\n' 'POSTGRES_PRIVATE_MARKER' ;;
    *clouddev-router*)
      remote_script=
      for argument do remote_script=$argument; done
      sh -n -c "$remote_script"
      printf '%s\\n' 'OMNIROUTE_PRIVATE_MARKER'
      ;;
    *) exit 43 ;;
  esac
  exit 0
fi
exit 44
`);

  writeExecutable(path.join(bin, "age"), `#!/bin/sh
set -eu
if [ "\${1:-}" = --version ]; then printf '%s\\n' 'age mock 1.0'; exit 0; fi
if [ -n "\${FAIL_AGE:-}" ]; then exit 45; fi
output=
while [ "$#" -gt 0 ]; do
  case "$1" in
    --output|-o) shift; output=\${1:?missing output path} ;;
  esac
  shift
done
[ -n "$output" ] || exit 46
printf '%s' 'age-mock-v1:' > "$output"
base64 | tr -d '\\r\\n' >> "$output"
`);

  const destination = path.join(directory, "encrypted-backup");
  const env = {
    ...process.env,
    PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
    AGE_BIN: "age",
    AGE_RECIPIENT: "age1testrecipient000000000000000000000000000000000000000000000",
    TRACE_FILE: path.join(directory, "docker.trace"),
  };

  return { directory, destination, env };
}

function writeExecutable(filename, contents) {
  writeFileSync(filename, contents, { mode: 0o700 });
  chmodSync(filename, 0o700);
}

function runBackup(fixture, envOverrides = {}, destination = fixture.destination) {
  return spawnSync("bash", [backupScript, "--acknowledge-quiesced", destination], {
    cwd: root,
    env: { ...fixture.env, ...envOverrides },
    encoding: "utf8",
  });
}

test("requires a public age recipient before creating the destination", () => {
  const fixture = makeFixture();
  const result = runBackup(fixture, { AGE_RECIPIENT: "" });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /AGE_RECIPIENT/);
  assert.equal(existsSync(fixture.destination), false);
  assert.equal(existsSync(path.join(fixture.directory, "docker.trace")), false);
});

test("requires explicit write-quiescence acknowledgement before reading source stores", () => {
  const fixture = makeFixture();
  const result = spawnSync("bash", [backupScript, fixture.destination], {
    cwd: root,
    env: fixture.env,
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /quiesce/i);
  assert.equal(existsSync(fixture.destination), false);
  assert.equal(existsSync(path.join(fixture.directory, "docker.trace")), false);
});

test("rejects a destination inside the repository before creating it", () => {
  const fixture = makeFixture();
  const destination = path.join(root, `.encrypted-backup-test-${path.basename(fixture.directory)}`);
  const result = runBackup(fixture, {}, destination);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /outside|repository/i);
  assert.equal(existsSync(destination), false);
});

test("encrypts each store stream and writes only encrypted artifacts plus non-secret metadata", () => {
  const fixture = makeFixture();
  const result = runBackup(fixture);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const expected = new Map([
    ["workspace.tar.gz.age", "WORKSPACE_PRIVATE_MARKER\n"],
    ["forgejo-volume.tar.gz.age", "FORGEJO_PRIVATE_MARKER\n"],
    ["postgres.dump.age", "POSTGRES_PRIVATE_MARKER\n"],
    ["postgres-globals.sql.age", "POSTGRES_GLOBALS_PRIVATE_MARKER\n"],
    ["omniroute.tar.gz.age", "OMNIROUTE_PRIVATE_MARKER\n"],
  ]);

  for (const [filename, plaintext] of expected) {
    const encrypted = readFileSync(path.join(fixture.destination, filename), "utf8");
    assert.ok(encrypted.startsWith("age-mock-v1:"), `${filename} should be emitted by age`);
    assert.equal(Buffer.from(encrypted.slice("age-mock-v1:".length), "base64").toString("utf8"), plaintext);
    assert.doesNotMatch(encrypted, /PRIVATE_MARKER/);
    assert.equal(statSync(path.join(fixture.destination, filename)).mode & 0o777, 0o600);
  }

  assert.equal(statSync(fixture.destination).mode & 0o777, 0o700);
  assert.deepEqual(readdirSync(fixture.destination).sort(), [
    "SHA256SUMS",
    "forgejo-volume.tar.gz.age",
    "manifest.txt",
    "omniroute.tar.gz.age",
    "postgres-globals.sql.age",
    "postgres.dump.age",
    "workspace.tar.gz.age",
  ]);

  const checksums = readFileSync(path.join(fixture.destination, "SHA256SUMS"), "utf8").trim().split(/\r?\n/);
  assert.equal(checksums.length, 5);
  for (const line of checksums) {
    const [expectedChecksum, filename] = line.trim().split(/\s+/);
    const actualChecksum = createHash("sha256").update(readFileSync(path.join(fixture.destination, filename))).digest("hex");
    assert.equal(actualChecksum, expectedChecksum, `${filename} should have a recorded SHA-256 checksum`);
  }

  const metadata = readFileSync(path.join(fixture.destination, "manifest.txt"), "utf8");
  assert.match(metadata, /workspace\.tar\.gz\.age/);
  assert.match(metadata, /forgejo-volume\.tar\.gz\.age/);
  assert.match(metadata, /postgres\.dump\.age/);
  assert.match(metadata, /postgres-globals\.sql\.age/);
  assert.match(metadata, /omniroute\.tar\.gz\.age/);
  assert.doesNotMatch(metadata, /PRIVATE_MARKER|STORAGE_ENCRYPTION_KEY|AGE-SECRET-KEY/);

  const dockerCalls = readFileSync(path.join(fixture.directory, "docker.trace"), "utf8");
  assert.doesNotMatch(dockerCalls, /\b(stop|start|restart|up|down|build|prune)\b/);
});

test("fails closed when a required service is not running", () => {
  const fixture = makeFixture();
  const result = runBackup(fixture, { EMPTY_SERVICE: "clouddev-router" });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /clouddev-router|running/i);
  assert.equal(existsSync(fixture.destination), false);
});

test("removes the newly-created destination if stream encryption fails", () => {
  const fixture = makeFixture();
  const result = runBackup(fixture, { FAIL_AGE: "1" });

  assert.notEqual(result.status, 0);
  assert.equal(existsSync(fixture.destination), false);
});

test("restore requires an external age identity before inspecting Docker state", () => {
  const fixture = makeFixture();
  const backupDirectory = path.join(fixture.directory, "restore-input");
  mkdirSync(backupDirectory);
  writeFileSync(path.join(backupDirectory, "manifest.txt"), "format=clouddev-age-backup-v1\n");
  writeFileSync(path.join(backupDirectory, "SHA256SUMS"), "");

  const result = spawnSync("bash", [restoreScript, backupDirectory], {
    cwd: root,
    env: { ...fixture.env, AGE_IDENTITY: "" },
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /AGE_IDENTITY/);
  assert.equal(existsSync(path.join(fixture.directory, "docker.trace")), false);
});
