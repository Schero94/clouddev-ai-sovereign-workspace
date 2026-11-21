import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("pins official code-server and Node 24 LTS images and CLI dependencies", () => {
  const dockerfile = readFileSync(path.join(root, "Dockerfile"), "utf8");
  const agentTools = JSON.parse(readFileSync(path.join(root, "agent-tools/package.json"), "utf8"));
  const gatewayCli = JSON.parse(readFileSync(path.join(root, "omniroute-cli/package.json"), "utf8"));
  const gatewayLock = JSON.parse(readFileSync(path.join(root, "omniroute-cli/package-lock.json"), "utf8"));
  const esbuildRuntime = JSON.parse(readFileSync(path.join(root, "esbuild-runtime/package.json"), "utf8"));
  assert.match(dockerfile, /^FROM node:24\.22\.0-bookworm-slim@sha256:91acba91b842bec0bf7ea6f5e09c644c7ccad72c4996ed9616d861d1c7cd60d4 AS node-runtime$/m);
  assert.match(dockerfile, /^FROM caddy:2\.11\.7-alpine@sha256:eb4d35b7452d1ab6171fbdbe8d9275b2301dad6dad92115d91e19fb9b24d510f AS caddy-runtime$/m);
  assert.match(dockerfile, /^FROM codercom\/code-server:4\.143\.1@sha256:[a-f0-9]{64}$/m);
  assert.match(dockerfile, /grep -F 'v2\.11\.7'/);
  assert.match(dockerfile, /shell-quote-1\.11\.0\.tgz/);
  assert.match(dockerfile, /krb5-1\.22\.3\.tar\.gz/);
  assert.match(dockerfile, /git-2\.55\.1\.tar\.gz/);
  assert.match(dockerfile, /replace_npm undici 6\.29\.1 /);
  assert.match(dockerfile, /replace_npm undici 7\.30\.1 /);
  assert.match(dockerfile, /replace_npm follow-redirects 1\.16\.2 /);
  assert.match(dockerfile, /github.com\/go-jose\/go-jose\/v4@v4\.1\.6/);
  assert.match(dockerfile, /binutils-x86-64-linux-gnu/);
  assert.match(dockerfile, /binutils-aarch64-linux-gnu/);
  assert.match(dockerfile, /go-jose\/v3 v3\.0\.6/);
  assert.match(readFileSync(path.join(root, "caddy-build/go.mod"), "utf8"), /replace github.com\/go-jose\/go-jose\/v3 v3\.0\.6 => \.\/go-jose-v3/);
  assert.match(readFileSync(path.join(root, "caddy-build/go-jose-v3/jwk.go"), "utf8"), /MaxRSAModulusBits = 4096/);
  assert.match(dockerfile, /golang.org\/x\/net@v0\.62\.0/);
  assert.match(dockerfile, /dpkg --remove --force-depends krb5-locales libgssapi-krb5-2 libk5crypto3 libkrb5-3 libkrb5support0 git git-man wget/);
  assert.match(dockerfile, /dpkg --remove --force-depends krb5-multidev libgssrpc4t64 libkadm5clnt-mit12 libkadm5srv-mit12 libkdb5-10t64 libkrb5-dev bison/);
  assert.doesNotMatch(readFileSync(path.join(root, "caddy-build/main.go"), "utf8"), /modules\/standard/);
  assert.match(readFileSync(path.join(root, "caddy-build/main.go"), "utf8"), /modules\/caddyhttp\/reverseproxy\/forwardauth/);
  const caddySum = readFileSync(path.join(root, "caddy-build/go.sum"), "utf8");
  assert.match(caddySum, /github.com\/caddyserver\/caddy\/v2 v2\.11\.7 /);
  assert.match(caddySum, /github.com\/go-jose\/go-jose\/v4 v4\.1\.6 /);
  assert.match(caddySum, /golang.org\/x\/net v0\.62\.0 /);
  assert.match(dockerfile, /expected_sha512=25dc433c3d03053caed3ca6ad243c2d3148d7adfeab14d3ba93e88b17d404bca0ed8808d458e2574d6bc38023a3eec001fcb46de5c4485baa6ca9e03c38d37ea/);
  assert.equal(agentTools.dependencies["@openai/codex"], "0.164.0");
  assert.equal(agentTools.dependencies["@anthropic-ai/claude-code"], "2.1.310");
  assert.equal(agentTools.dependencies.pnpm, "10.34.8");
  assert.equal(gatewayCli.dependencies.omniroute, "3.8.52");
  assert.deepEqual(gatewayCli.overrides, { dompurify: "3.4.17", next: "16.4.3", zod: "4.6.6" });
  assert.equal(gatewayLock.packages["node_modules/next"].version, "16.4.3");
  assert.equal(gatewayLock.packages["node_modules/dompurify"].version, "3.4.17");
  assert.equal(gatewayLock.packages["node_modules/zod"].version, "4.6.6");
  assert.equal(esbuildRuntime.optionalDependencies["@esbuild/linux-x64"], "0.28.2");
  assert.equal(esbuildRuntime.optionalDependencies["@esbuild/linux-arm64"], "0.28.2");
  assert.match(dockerfile, /COPY services\/ide\/esbuild-runtime\/package\.json services\/ide\/esbuild-runtime\/package-lock\.json/);
  assert.equal(dockerfile.includes(":latest"), false);
});

test("drops the upstream sudo/fixuid escalation paths and starts the IDE with reduced privileges", () => {
  const dockerfile = readFileSync(path.join(root, "Dockerfile"), "utf8");
  const entrypoint = readFileSync(path.join(root, "entrypoint.sh"), "utf8");
  const serviceCommand = readFileSync(path.join(root, "src/run-service.mjs"), "utf8");
  assert.match(dockerfile, /apt-get purge -y sudo/);
  assert.match(dockerfile, /rm -f \/usr\/local\/bin\/fixuid/);
  assert.match(serviceCommand, /"code-server": \{ uid: 1000, gid: 1000 \}/);
  assert.match(serviceCommand, /caddy: \{ uid: 1001, gid: 1001 \}/);
  assert.match(serviceCommand, /launchpad: \{ uid: 1002, gid: 1002 \}/);
  assert.match(serviceCommand, /--no-new-privs/);
  assert.match(serviceCommand, /--bounding-set=-all/);
  assert.match(entrypoint, /unset CODE_SERVER_PASSWORD/);
  assert.doesNotMatch(`${dockerfile}\n${entrypoint}`, /docker\.sock|--privileged/);
});

test("provides the IDE wrappers and task utilities on one persistent workspace volume", () => {
  const dockerfile = readFileSync(path.join(root, "Dockerfile"), "utf8");
  for (const wrapper of ["ai-codex", "ai-claude", "ai-status", "ai-models", "ai-setup", "git-setup"]) {
    const script = path.join(root, "scripts", wrapper);
    assert.ok(statSync(script).isFile());
    assert.match(readFileSync(script, "utf8"), /^#!\/bin\/sh/m);
  }
  assert.doesNotMatch(dockerfile, /VOLUME /);
  assert.match(readFileSync(path.join(root, "../../.railway/railway.ts"), "utf8"), /"\/workspace": workspaceData/);
  assert.match(dockerfile, /HOME=\/workspace\/home/);
  assert.match(dockerfile, /WORKDIR \/workspace\/projects/);
  assert.match(dockerfile, /EXPOSE 8080 2222/);
  assert.match(dockerfile, /HEALTHCHECK/);
  assert.match(dockerfile, /COPY services\/launchpad\/src\//);
});

test("uses the bundled Node runtime in SSH commands instead of a missing system path", () => {
  const taskCommand = readFileSync(path.join(root, "scripts/clouddev-tasks"), "utf8");
  const launchpadCommand = readFileSync(path.join(root, "scripts/run-launchpad"), "utf8");
  assert.match(taskCommand, /^exec \/usr\/local\/bin\/node /m);
  assert.match(launchpadCommand, /^exec \/usr\/local\/bin\/node /m);
});
