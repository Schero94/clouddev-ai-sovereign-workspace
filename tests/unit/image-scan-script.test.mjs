import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const scanScript = path.join(root, "scripts/scan-local-images.sh");

test("image scan builds and pulls current Compose candidates, then scans their configured image references without restarting services", t => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "clouddev-image-scan-test-"));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const bin = path.join(temp, "bin");
  mkdirSync(bin);

  const imageReferences = {
    "clouddev-router": "clouddev-local-clouddev-router",
    "clouddev-ide": "clouddev-local-clouddev-ide",
    "clouddev-git": "clouddev-local-clouddev-git",
    "clouddev-postgres": "postgres:18.6-alpine3.24@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  };
  const imageIds = Object.fromEntries(Object.keys(imageReferences).map((service, index) => [
    service,
    `sha256:${String(index + 1).repeat(64)}`,
  ]));
  const config = JSON.stringify({
    name: "clouddev-local",
    services: {
      "clouddev-router": { build: { context: "." } },
      "clouddev-ide": { build: { context: "." } },
      "clouddev-git": { build: { context: "services/forgejo" } },
      "clouddev-postgres": { image: imageReferences["clouddev-postgres"] },
    },
  });
  const dockerLog = path.join(temp, "docker.log");
  const trivyLog = path.join(temp, "trivy.log");
  const docker = `#!/bin/sh
set -eu
printf '%s\\n' "$*" >> "$CLOUDDEV_DOCKER_LOG"
if [ "$1" = compose ] && [ "$2" = config ]; then
  printf '%s' "$CLOUDDEV_COMPOSE_CONFIG"
elif [ "$1" = image ] && [ "$2" = inspect ]; then
  case "$5" in
    clouddev-local-clouddev-router) printf '%s\\n' '${imageIds["clouddev-router"]}' ;;
    clouddev-local-clouddev-ide) printf '%s\\n' '${imageIds["clouddev-ide"]}' ;;
    clouddev-local-clouddev-git) printf '%s\\n' '${imageIds["clouddev-git"]}' ;;
    postgres:*) printf '%s\\n' '${imageIds["clouddev-postgres"]}' ;;
    *) exit 2 ;;
  esac
fi
`;
  const trivy = `#!/bin/sh
set -eu
printf '%s\\n' "$*" >> "$CLOUDDEV_TRIVY_LOG"
`;
  writeFileSync(path.join(bin, "docker"), docker, { mode: 0o755 });
  writeFileSync(path.join(bin, "trivy"), trivy, { mode: 0o755 });
  chmodSync(path.join(bin, "docker"), 0o755);
  chmodSync(path.join(bin, "trivy"), 0o755);

  const result = spawnSync("sh", [scanScript], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      CLOUDDEV_DOCKER_LOG: dockerLog,
      CLOUDDEV_TRIVY_LOG: trivyLog,
      CLOUDDEV_COMPOSE_CONFIG: config,
    },
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /No HIGH or CRITICAL vulnerabilities were found in the configured Compose candidate images/);
  const dockerCalls = readFileSync(dockerLog, "utf8");
  const trivyCalls = readFileSync(trivyLog, "utf8");
  for (const service of ["clouddev-router", "clouddev-ide", "clouddev-git"]) {
    assert.ok(dockerCalls.includes(`compose build --pull ${service}`), `${service} must be rebuilt from the current checked-out Dockerfile`);
  }
  assert.ok(dockerCalls.includes("compose pull clouddev-postgres"), "the pinned database candidate must be pulled before scanning");
  assert.ok(dockerCalls.includes("compose config --format json"), "scan targets must come from the current Compose graph");
  assert.doesNotMatch(dockerCalls, /compose (?:images|up|down|restart)/, "the scan must not use running container IDs or change running services");
  for (const [service, image] of Object.entries(imageReferences)) {
    assert.ok(dockerCalls.includes(`image inspect --format {{.Id}} ${image}`), `${image} must resolve to its immutable local image ID`);
    assert.ok(trivyCalls.includes(`image --scanners vuln --severity HIGH,CRITICAL --exit-code 1 ${imageIds[service]}`), `${service} must be scanned by its immutable candidate ID`);
  }
});
