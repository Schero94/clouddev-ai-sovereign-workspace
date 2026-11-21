import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(path.join(root, ".railway/railway.ts"), "utf8");
const manifest = JSON.parse(readFileSync(path.join(root, ".railway/template-variables.json"), "utf8"));
const descriptions = JSON.parse(readFileSync(path.join(root, ".railway/template-descriptions.json"), "utf8"));
for (const entry of [...manifest.generatedSecrets, ...manifest.operatorInputs]) {
  descriptions[entry.service][entry.name] = entry.description;
}
const outDir = process.argv[2];

if (!outDir) {
  console.error("Usage: node scripts/railway-template-editor-blocks.mjs <output-directory>");
  process.exit(2);
}

// Railway's official Postgres template defaults. A generated template keeps the
// references and the password generator but leaves these literals empty.
const postgresBlock = {
  DATABASE_URL: "postgresql://${{PGUSER}}:${{POSTGRES_PASSWORD}}@${{RAILWAY_PRIVATE_DOMAIN}}:5432/${{PGDATABASE}}",
  PGDATA: "/var/lib/postgresql/data/pgdata",
  PGDATABASE: "${{POSTGRES_DB}}",
  PGHOST: "${{RAILWAY_PRIVATE_DOMAIN}}",
  PGPASSWORD: "${{POSTGRES_PASSWORD}}",
  PGPORT: "5432",
  PGUSER: "${{POSTGRES_USER}}",
  POSTGRES_DB: "railway",
  POSTGRES_PASSWORD: '${{ secret(32, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ") }}',
  POSTGRES_USER: "postgres",
  RAILWAY_DEPLOYMENT_DRAINING_SECONDS: "60",
  SSL_CERT_DAYS: "820",
};

const bindings = {};
for (const match of source.matchAll(/const (\w+) = (?:service|postgres)\("([\w-]+)"/g)) {
  bindings[match[1]] = match[2];
}

const secrets = new Map(manifest.generatedSecrets.map(entry => [`${entry.service}.${entry.name}`, entry.composerValue]));
const blocks = { "clouddev-postgres": postgresBlock };
const serviceStarts = [...source.matchAll(/const \w+ = service\("([\w-]+)"/g)];

for (const [index, start] of serviceStarts.entries()) {
  const name = start[1];
  const end = serviceStarts[index + 1]?.index ?? source.indexOf("return project(");
  const body = source.slice(start.index, end);
  const block = {};
  const dockerfile = body.match(/dockerfilePath: "([^"]+)"/)?.[1];
  if (dockerfile && !body.includes("rootDirectory:")) block.RAILWAY_DOCKERFILE_PATH = dockerfile;
  const env = body.slice(body.indexOf("env: {"));
  for (const line of env.matchAll(/^\s+(\w+): (.+),$/gm)) {
    const [, key, raw] = line;
    const reference = raw.match(/^(\w+)\.env\.(\w+)$/);
    if (raw === "preserve()") {
      block[key] = secrets.get(`${name}.${key}`) ?? "";
    } else if (reference) {
      const target = bindings[reference[1]];
      if (!target) throw new Error(`Unknown service binding ${reference[1]} in ${name}.${key}`);
      block[key] = `\${{${target}.${reference[2]}}}`;
    } else if (/^"[^"]*"$/.test(raw)) {
      block[key] = raw.slice(1, -1);
    } else {
      throw new Error(`Unsupported IaC value for ${name}.${key}: ${raw}`);
    }
  }
  blocks[name] = block;
}

// Railway's Raw Editor reads a trailing "# text" as the variable description.
mkdirSync(outDir, { recursive: true });
for (const [name, block] of Object.entries(blocks)) {
  const lines = Object.entries(block).map(([key, value]) => {
    const description = descriptions[name]?.[key];
    if (!description) throw new Error(`Missing description for ${name}.${key} in .railway/template-descriptions.json`);
    if (description.includes("#")) throw new Error(`Description for ${name}.${key} must not contain "#"`);
    return `${key}="${value.replace(/["\\]/g, "\\$&")}" # ${description}`;
  });
  writeFileSync(path.join(outDir, `${name}.env`), `${lines.join("\n")}\n`);
}
