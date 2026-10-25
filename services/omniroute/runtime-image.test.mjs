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
  assert.match(dockerfile, /FROM diegosouzapw\/omniroute:3\.8\.52@sha256:[a-f0-9]{64}/);
  assert.doesNotMatch(dockerfile, /npm (?:install|ci).*\b(?:next|dompurify)@/s);
  assert.match(dockerfile, /healthcheck\.mjs \/opt\/clouddev-healthcheck\.mjs/);
  assert.match(dockerfile, /USER node\s*$/);
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
