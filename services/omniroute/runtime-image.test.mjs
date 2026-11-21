import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { test } from "node:test";

const serviceDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryDirectory = path.resolve(serviceDirectory, "../..");
const dockerfilePath = path.join(serviceDirectory, "Dockerfile");
const composePath = path.join(repositoryDirectory, "docker-compose.yml");
const railwayPath = path.join(repositoryDirectory, ".railway/railway.ts");

test("wraps the pinned upstream router image without mismatching its prebuilt Next.js artifacts", () => {
  const dockerfile = readFileSync(dockerfilePath, "utf8");
  assert.match(dockerfile, /FROM diegosouzapw\/omniroute:3\.8\.54@sha256:2c4c755a54f8ce5341bc1856580b71f47a0f16a9afab4a55f84d540810631f68/);
  assert.match(dockerfile, /openssl-3\.6\.5\.tar\.gz/);
  assert.match(dockerfile, /openssl-cve-2026-124709\.patch/);
  assert.match(dockerfile, /binutils-x86-64-linux-gnu/);
  assert.match(dockerfile, /binutils-aarch64-linux-gnu/);
  assert.match(dockerfile, /snapshot\.debian\.org\/archive\/debian\/20261121T000000Z\/ sid main/);
  assert.doesNotMatch(dockerfile, /npm (?:install|ci).*\b(?:next|dompurify)@/s);
  assert.match(dockerfile, /healthcheck\.mjs \/opt\/clouddev-healthcheck\.mjs/);
  assert.match(dockerfile, /ENTRYPOINT \["\/opt\/clouddev-router-entrypoint\.sh"\]\nCMD \["node", "dev\/run-standalone\.mjs"\]\s*$/);
  const entrypoint = readFileSync(path.join(serviceDirectory, "entrypoint.sh"), "utf8");
  assert.match(entrypoint, /exec runuser --preserve-environment -u node -- \/opt\/clouddev-router-entrypoint\.sh "\$@"/);
  assert.match(entrypoint, /node \/opt\/clouddev-router-provision\.mjs/);
  assert.match(entrypoint, /find "\$data" -xdev ! -user node -exec chown -h node:node \{\} \+/);
  assert.match(entrypoint, /exec \/app\/check-permissions\.sh "\$@"/);
  assert.match(dockerfile, /provision-workspace-key\.mjs \/opt\/clouddev-router-provision\.mjs/);
});

test("Compose and Railway build the router overlay instead of mounting a host health script", () => {
  const compose = readFileSync(composePath, "utf8");
  const railway = readFileSync(railwayPath, "utf8");
  assert.match(compose, /dockerfile:\s*services\/omniroute\/Dockerfile/);
  assert.match(railway, /dockerfilePath:\s*["']services\/omniroute\/Dockerfile["']/);
  assert.match(railway, /service\("clouddev-git",\s*\{\s*source:\s*github\([\s\S]*?rootDirectory:\s*["']services\/forgejo["']/s);
  assert.doesNotMatch(compose, /healthcheck\.mjs:ro/);
  assert.ok(compose.includes("/opt/clouddev-healthcheck.mjs"));
  assert.match(compose, /API_HOST:\s*"127\.0\.0\.1"/);
  assert.match(railway, /API_HOST:\s*"127\.0\.0\.1"/);
  assert.doesNotMatch(compose, /CLOUDDEV_OMNIROUTE_API_PORT/);
  assert.doesNotMatch(railway, /CLOUDDEV_OMNIROUTE_API_PORT/);
});
