import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parseGates, renderReleaseStatus } from "../../scripts/generate-docs-status.mjs";
import { inspectDocsArtifact } from "../../scripts/check-docs-artifact.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("parses gate identifiers, status, and labels without reading evidence lines", () => {
  const gates = parseGates([
    "# Release gates",
    "- [x] G1: Local tests pass",
    "  EVIDENCE: /Users/private/path and token sk-abcdefghijklmnopqrstuvwxyz",
    "- [ ] G2: Public Railway deployment",
    "  CHECK: secret-bearing command must not be rendered",
  ].join("\n"));

  assert.deepEqual(gates, [
    { id: "G1", title: "Local tests pass", complete: true },
    { id: "G2", title: "Public Railway deployment", complete: false },
  ]);
});

test("rejects duplicate or malformed gate identifiers instead of publishing ambiguous status", () => {
  assert.throws(() => parseGates("- [ ] G1: one\n- [x] G1: duplicate"), /duplicate gate/i);
  assert.throws(() => parseGates("- [ ] Broken: missing numeric id"), /invalid gate/i);
});

test("renders only summarized status and escapes untrusted gate title markup", () => {
  const markdown = renderReleaseStatus([
    { id: "G1", title: "<script>alert(1)</script> | release check", complete: true },
    { id: "G2", title: "Railway settings", complete: false },
  ]);

  assert.match(markdown, /1 of 2 gates complete/);
  assert.match(markdown, /&lt;script&gt;/);
  assert.doesNotMatch(markdown, /<script>|EVIDENCE|CHECK:|\/Users\/|sk-[A-Za-z0-9]{20,}/i);
  assert.match(markdown, /G1/);
  assert.match(markdown, /G2/);
});

test("artifact checker accepts a small static site and rejects hidden or secret-bearing files", () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "clouddev-docs-artifact-"));
  const site = path.join(temp, "site");
  try {
    mkdirSync(path.join(site, "operations", "release-status"), { recursive: true });
    writeFileSync(path.join(site, "index.html"), "<!doctype html><title>CloudDev Docs</title>");
    writeFileSync(path.join(site, "operations", "release-status", "index.html"), "status");
    assert.deepEqual(inspectDocsArtifact(site), []);

    writeFileSync(path.join(site, ".env"), "NOT_A_SECRET=example");
    assert.match(inspectDocsArtifact(site).join("\n"), /forbidden path/i);
    rmSync(path.join(site, ".env"));

    const tokenFixture = `token: ${String.fromCharCode(103, 104, 112, 95)}${"a".repeat(32)}`;
    writeFileSync(path.join(site, "index.html"), tokenFixture);
    assert.match(inspectDocsArtifact(site).join("\n"), /credential-shaped/i);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("documentation content and navigation cover the operator workflow", () => {
  const navigation = readFileSync(path.join(root, "mkdocs.yml"), "utf8");
  const guide = readFileSync(path.join(root, "docs/operations/CONTROL_PLANE.md"), "utf8");
  const readme = readFileSync(path.join(root, "README.md"), "utf8");

  for (const section of ["Start here", "Railway:", "Operations:", "Security and privacy:", "Release status"]) {
    assert.ok(navigation.includes(section), `navigation is missing ${section}`);
  }
  for (const detail of ["Template Composer", "Railway IaC", "provider master", "GATES.md", "does not filter outbound traffic"]) {
    assert.ok(guide.toLowerCase().includes(detail.toLowerCase()), `control plane is missing ${detail}`);
  }
  assert.doesNotMatch(navigation, /^repo_(?:name|url):/m, "repository header metadata calls the GitHub Releases API on every page view");
  assert.match(navigation, /name: Source repository/, "the repository link should be a static social link instead");
  assert.match(readme, /https:\/\/schero94\.github\.io\/clouddev-ai-sovereign-workspace\//);
});

test("documentation landing page explains the shared workspace and routes users to verified next steps", () => {
  const configuration = readFileSync(path.join(root, "mkdocs.yml"), "utf8");
  const home = readFileSync(path.join(root, "docs/index.md"), "utf8");
  const stylesheetPath = path.join(root, "docs/stylesheets/landing.css");
  const brandPath = path.join(root, "docs/assets/clouddev-mark.svg");

  assert.ok(existsSync(stylesheetPath), "the local landing-page stylesheet should exist");
  assert.ok(existsSync(brandPath), "the local CloudDev brand mark should exist");
  assert.match(configuration, /extra_css:\s*\n\s*- stylesheets\/landing\.css/);
  assert.match(configuration, /logo:\s*assets\/clouddev-mark\.svg/);
  assert.match(configuration, /favicon:\s*assets\/clouddev-mark\.svg/);
  assert.match(configuration, /scheme: slate[\s\S]*?name: Switch to light mode[\s\S]*?scheme: default[\s\S]*?name: Switch to dark mode/);
  assert.match(configuration, /plugins:\s*\n\s*- search/);

  for (const label of ["VS Code Desktop", "Browser IDE", "CloudCLI mobile", "/workspace"]) {
    assert.ok(home.includes(label), `the landing page is missing ${label}`);
  }
  for (const route of ["getting-started.md", "operations/RELEASE_STATUS.md", "architecture.md", "operations/CONTROL_PLANE.md"]) {
    assert.ok(home.includes(route), `the landing page is missing the ${route} route`);
  }
  assert.match(home, /do not share UI state/i);
  assert.match(home, /interrupted/i);
  assert.match(home, /resume/i);
  assert.equal((home.match(/<div class="cd-client">/g) ?? []).length, 3, "all three cross-device clients should be visible markup, not a code sample");
  assert.doesNotMatch(home, /[—–]/, "landing-page copy should use plain punctuation");

  const stylesheet = readFileSync(stylesheetPath, "utf8");
  assert.match(stylesheet, /prefers-reduced-motion/);
  assert.match(stylesheet, /:focus-visible/);
  assert.match(stylesheet, /@media[^\{]*max-width/);
  assert.match(stylesheet, /body:has\(\.cd-home-title\) \.cd-route-grid/);
  assert.doesNotMatch(stylesheet, /@import\s+url|fonts\.googleapis\.com/i);
});

test("Pages workflow pins actions, isolates write permissions, and never deploys a pull request", () => {
  const workflow = readFileSync(path.join(root, ".github/workflows/docs.yml"), "utf8");
  const actionRefs = [...workflow.matchAll(/^\s+uses:\s+([^\s]+)(?:\s+#.*)?$/gm)].map(match => match[1]);
  const buildJob = workflow.split("  deploy:")[0];
  const deployJob = workflow.split("  deploy:")[1] ?? "";

  assert.ok(actionRefs.length >= 3, "workflow should use the Pages build and deployment actions");
  for (const reference of actionRefs) {
    assert.match(reference, /^[^@]+@[a-f0-9]{40}$/, `action is not pinned by commit: ${reference}`);
  }
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(buildJob, /permissions:\s*\n\s+contents:\s*read/);
  assert.doesNotMatch(buildJob, /pages:\s*write|id-token:\s*write/);
  assert.match(deployJob, /permissions:\s*\n\s+contents:\s*read\s+pages:\s*write\s+id-token:\s*write/s);
  assert.match(deployJob, /needs:\s*build/);
  assert.match(deployJob, /if:\s*>-[\s\S]*github\.ref == 'refs\/heads\/main'/);
  assert.equal((workflow.match(/runs-on: ubuntu-24\.04/g) ?? []).length, 2, "runner image should be pinned for build and deploy");
  assert.match(deployJob, /github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'/);
  assert.doesNotMatch(workflow, /pull_request_target/);
  assert.doesNotMatch(workflow, /pull_request[^\n]*\n[\s\S]{0,800}deploy:\s*if:\s*always\(\)/);
});
