import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(path.join(root, ".railway/railway.ts"), "utf8");
const manifest = JSON.parse(readFileSync(path.join(root, ".railway/template-variables.json"), "utf8"));
const failures = [];

function expect(condition, message) {
  if (!condition) failures.push(message);
}

expect(!existsSync(path.join(root, "railway.toml")) && !existsSync(path.join(root, "railway.json")), "Legacy Config-as-Code files are not allowed.");
for (const name of ["clouddev-ide", "clouddev-git", "clouddev-router", "clouddev-postgres"]) {
  expect(source.includes(`service("${name}"`), `${name} must stay in the install graph.`);
}
expect(!/\bpostgres\(/.test(source), "clouddev-postgres must build the hardened overlay, not the managed image.");
expect(source.includes('rootDirectory: "services/postgres"'), "clouddev-postgres must build from services/postgres.");
expect(source.includes('"/var/lib/postgresql": postgresData'), "The Postgres volume mount is missing.");
expect((source.match(/sleepApplication:\s*false/g) ?? []).length === 4, "All four services must disable sleep.");
expect((source.match(/tcpProxies:\s*\["2222"\]/g) ?? []).length === 2, "Workspace and Forgejo need SSH TCP proxies.");
expect(source.includes('volumeMounts: { "/workspace": workspaceData'), "The workspace volume mount is missing.");
expect(source.includes('"/var/lib/gitea": forgejoData'), "The Forgejo volume mount is missing.");
expect(source.includes('"/app/data": routerData'), "The OmniRoute volume mount is missing.");
expect(source.includes("europe-west4-drams3a"), "The install graph must request europe-west4-drams3a.");
expect(source.includes('healthcheck: "/healthz"'), "The workspace health check is missing.");
expect(source.includes('healthcheck: "/api/healthz"'), "The Forgejo health check is missing.");
expect(source.includes('healthcheck: "/omniroute/healthz"'), "The OmniRoute health check is missing.");
expect(source.includes('PORT: "3000"'), "Forgejo must publish its HTTP port because the SSH proxy is also attached.");
expect(source.includes('PORT: "8080"'), "The workspace must publish its HTTP port because the SSH proxy is also attached.");
expect(source.includes('PORT: "20128"'), "The router must publish the port Railway healthchecks.");
expect(!/^\s*domains\s*:/m.test(source), "Generated HTTPS domains stay in the Template Composer.");
expect(manifest.generatedSecrets.length === 12, "A fresh install needs twelve generated secrets.");
expect(manifest.generatedSecrets.every(entry => entry.composerValue === '${{secret(64, "0123456789abcdef")}}'), "Generated secrets must use the documented secret() expression.");
expect(manifest.operatorInputs.length === 1 && manifest.operatorInputs[0].name === "SSH_AUTHORIZED_KEYS" && manifest.operatorInputs[0].required === false, "The only operator input is the optional SSH public key, so a fresh install needs no typing.");
expect((source.match(/preserve\(\)/g) ?? []).length === 13, "IaC must preserve the twelve generated secrets and the operator SSH key.");
expect(!JSON.stringify(manifest).includes("OPENAI_API_KEY") && !JSON.stringify(manifest).includes("ANTHROPIC_API_KEY"), "Provider master keys are not template inputs.");

if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  process.exitCode = 1;
} else {
  console.log("One-click contract passed.");
  console.log("Services: clouddev-ide, clouddev-git, clouddev-postgres, clouddev-router.");
  console.log("Marketplace publication is held until image-security and live deployment gates pass.");
  console.log("Held commands, not executed:");
  console.log('npx --yes @railway/cli@5.71.0 templates create --project <FRESH_PROJECT> --json');
  console.log('npx --yes @railway/cli@5.71.0 templates publish <TEMPLATE_CODE> --category AI/ML --description "Deploy and Host CloudDev AI on Railway" --readme-file docs/operations/RAILWAY_TEMPLATE_OVERVIEW.md --json');
  process.exitCode = 0;
}
