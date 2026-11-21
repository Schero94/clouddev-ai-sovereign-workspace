import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dockerfile = readFileSync(path.join(root, "services/postgres/Dockerfile"), "utf8");
const compose = readFileSync(path.join(root, "docker-compose.yml"), "utf8");

test("local Postgres image rebuilds gosu with patched Go and upgrades libxml2", () => {
  assert.match(dockerfile, /^FROM --platform=\$BUILDPLATFORM golang:1\.27\.4-alpine@sha256:70bd7ddea8b6cbe5d6943cde279d6b67feb10cc924fb9100d1d8757c1575b280 AS gosu$/m);
  assert.match(dockerfile, /CGO_ENABLED=0 GOOS=linux GOARCH="\$\{TARGETARCH\}" go install github\.com\/tianon\/gosu@1\.20/);
  assert.match(dockerfile, /^FROM postgres:18\.7-alpine3\.24@sha256:ff64c9e3bdf8e2120107d3559de8db314e8305f7e38c5105903c6295876738ff$/m);
  assert.match(dockerfile, /libxml2=2\.13\.9-r3/);
  assert.match(dockerfile, /COPY --from=gosu \/usr\/local\/bin\/gosu \/usr\/local\/bin\/gosu/);
  assert.match(compose, /clouddev-postgres:[\s\S]*build:[\s\S]*context:\s*\.\/services\/postgres/);
  assert.doesNotMatch(compose, /image:\s*postgres:/);
});
