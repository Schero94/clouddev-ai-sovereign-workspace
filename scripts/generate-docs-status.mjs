import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function parseGates(markdown) {
  if (typeof markdown !== "string") throw new TypeError("Gate source must be text.");
  const gates = [];
  const ids = new Set();

  for (const line of markdown.split(/\r?\n/)) {
    const match = /^- \[([ xX])\] (G[0-9]+): (.+?)\s*$/.exec(line);
    if (!match) {
      if (/^- \[[ xX]\] \S+/.test(line)) throw new Error("Invalid gate row in GATES.md.");
      continue;
    }
    const [, checked, id, title] = match;
    if (ids.has(id)) throw new Error(`Duplicate gate identifier ${id}.`);
    ids.add(id);
    gates.push({ id, title, complete: checked.toLowerCase() === "x" });
  }

  if (gates.length === 0) throw new Error("No release gates were found in GATES.md.");
  return gates;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

export function renderReleaseStatus(gates) {
  if (!Array.isArray(gates) || gates.length === 0) throw new TypeError("At least one release gate is required.");
  const complete = gates.filter(gate => gate.complete).length;
  const rows = gates.map(({ id, title, complete: isComplete }) =>
    `| <code>${escapeHtml(id)}</code> | ${escapeHtml(title)} | ${isComplete ? "Complete" : "Open"} |`).join("\n");

  return `# Release status\n\nThis page is generated during each documentation build from the gate checklist. It includes gate names and status only. Test logs, commands, local paths, and environment values stay in the repository's internal release ledger.\n\n**${complete} of ${gates.length} gates complete.**\n\n| Gate | Requirement | Status |\n| --- | --- | --- |\n${rows}\n\nA completed local check does not prove a Railway deployment, Marketplace publication, device acceptance, or full restore. Read the [release checklist](CONTROL_PLANE.md#release-readiness) before treating a deployment as ready.\n`;
}

export function generateDocsStatus({ root = repositoryRoot } = {}) {
  const gateFile = path.join(root, "GATES.md");
  const outputFile = path.join(root, "docs/operations/RELEASE_STATUS.md");
  const gates = parseGates(readFileSync(gateFile, "utf8"));
  const content = renderReleaseStatus(gates);
  mkdirSync(path.dirname(outputFile), { recursive: true });
  writeFileSync(outputFile, content, { mode: 0o644 });
  return { outputFile, complete: gates.filter(gate => gate.complete).length, total: gates.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = generateDocsStatus();
    process.stdout.write(`Generated release-status page from ${result.complete}/${result.total} gates.\n`);
  } catch {
    process.stderr.write("Could not generate the documentation release-status page. Check the gate ledger format.\n");
    process.exitCode = 1;
  }
}
