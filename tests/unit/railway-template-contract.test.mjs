import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../../.railway/railway.ts", import.meta.url), "utf8");
const manifest = JSON.parse(readFileSync(new URL("../../.railway/template-variables.json", import.meta.url), "utf8"));
const variableDocumentation = readFileSync(new URL("../../docs/operations/RAILWAY_TEMPLATE_VARIABLES.md", import.meta.url), "utf8");
const compose = readFileSync(new URL("../../docker-compose.yml", import.meta.url), "utf8");

function variablesByService() {
  const variables = new Map();
  const servicePattern = /const\s+\w+\s*=\s*service\(\s*"([^"]+)"\s*,\s*\{([\s\S]*?)\n\s{2}\}\);/g;
  for (const match of source.matchAll(servicePattern)) {
    const serviceName = match[1];
    const envBlock = match[2].match(/\benv:\s*\{([\s\S]*?)\n\s{4}\},/);
    assert.ok(envBlock, `${serviceName} must declare an env block`);
    const entries = [];
    for (const line of envBlock[1].split("\n")) {
      const entry = line.trim().replace(/,$/, "").match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*?)\s*$/);
      if (entry) entries.push({ name: entry[1], value: entry[2] });
    }
    variables.set(serviceName, entries);
  }
  return variables;
}

test("Composer manifest covers every IaC preserve() variable", () => {
  const declared = variablesByService();
  const expected = new Map([...declared].map(([service, entries]) => [
    service,
    entries.filter(entry => entry.value === "preserve()").map(entry => entry.name).sort(),
  ]));
  const configured = new Map();

  for (const entry of manifest.generatedSecrets) {
    assert.equal(entry.composerValue, '${{secret(64, "0123456789abcdef")}}');
    assert.ok(entry.description.length >= 30, `${entry.service}.${entry.name} needs a useful Composer description`);
    assert.ok(!/^(?:OPENAI|ANTHROPIC)_API_KEY$|^OMNIROUTE_(?:API_KEY|MASTER_KEY|ADMIN_TOKEN)$/i.test(entry.name),
      "Provider credentials must not be template inputs");
    const names = configured.get(entry.service) ?? [];
    names.push(entry.name);
    configured.set(entry.service, names);
  }

  const operatorKeys = manifest.operatorInputs.filter(entry => entry.kind === "ed25519-public-key-lines");
  assert.deepEqual(operatorKeys.map(({ service, name, required }) => ({ service, name, required })), [
    { service: "clouddev-ide", name: "SSH_AUTHORIZED_KEYS", required: true },
  ]);
  for (const entry of operatorKeys) {
    const names = configured.get(entry.service) ?? [];
    names.push(entry.name);
    configured.set(entry.service, names);
  }

  assert.deepEqual(
    Object.fromEntries([...configured].map(([service, names]) => [service, names.sort()])),
    Object.fromEntries(expected),
  );

  for (const [service, entries] of declared) {
    for (const { name } of entries) {
      const exactVariableName = new RegExp(`(?:^|[^A-Za-z0-9_])${name}(?:$|[^A-Za-z0-9_])`);
      assert.match(variableDocumentation, exactVariableName, `${service}.${name} is missing from the variable guide`);
    }
  }
});

test("every stateful service has persistent data, and the Composer does not embed provider keys", () => {
  assert.match(source, /volumeMounts:\s*\{\s*"\/workspace":\s*workspaceData/);
  assert.match(source, /volumeMounts:\s*\{\s*"\/var\/lib\/gitea":\s*forgejoData/);
  assert.match(source, /volumeMounts:\s*\{\s*"\/app\/data":\s*routerData/);
  assert.doesNotMatch(JSON.stringify(manifest), /(?:sk-[A-Za-z0-9]{20,}|OPENAI_API_KEY|ANTHROPIC_API_KEY|OMNIROUTE_MASTER_KEY)/);
  assert.match(source, /sleepApplication:\s*false/);
  assert.match(compose, /image:\s*postgres:18\.6-alpine3\.24@sha256:898c60cb390d1085bc97bdd6a1ae968757421df394b071848b52b1c09c89d6a5/);
});

test("Railway IaC builds all three GitHub-backed services from the published main branch", () => {
  assert.equal((source.match(/source:\s*github\("Schero94\/clouddev-ai-sovereign-workspace"/g) ?? []).length, 3);
  assert.match(source, /const router = service\("clouddev-router",\s*\{\s*source:\s*github\("Schero94\/clouddev-ai-sovereign-workspace",\s*\{\s*branch:\s*"main"\s*\}\)/s);
  assert.match(source, /const ide = service\("clouddev-ide",\s*\{\s*source:\s*github\("Schero94\/clouddev-ai-sovereign-workspace",\s*\{\s*branch:\s*"main"\s*\}\)/s);
  assert.match(source, /source:\s*github\("Schero94\/clouddev-ai-sovereign-workspace",\s*\{\s*branch:\s*"main",\s*rootDirectory:\s*"services\/forgejo",\s*\}\)/);
  assert.match(source, /dockerfilePath:\s*"services\/omniroute\/Dockerfile"/);
  assert.match(source, /dockerfilePath:\s*"services\/ide\/Dockerfile"/);
  assert.match(source, /dockerfilePath:\s*"Dockerfile"/);
});
