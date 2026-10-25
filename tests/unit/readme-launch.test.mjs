import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const readme = readFileSync(path.join(root, "README.md"), "utf8");

function expectMatch(pattern, message) {
  assert.ok(pattern.test(readme), message);
}

function isTracked(relativePath) {
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", relativePath], {
      cwd: root,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

test("README has the complete public launch and operator guide", () => {
  const headings = new Set(
    [...readme.matchAll(/^#{2,3}\s+(.+)$/gm)].map((match) => match[1].trim().toLowerCase()),
  );

  for (const heading of [
    "overview",
    "verified features",
    "docker build contexts",
    "architecture",
    "quick start",
    "railway deployment",
    "first-run onboarding",
    "provider routing and billing",
    "security boundaries",
    "privacy and data flows",
    "backup and restore",
    "updates",
    "troubleshooting",
    "costs and capacity",
    "upstream licenses",
    "release status",
    "railway deploy button",
    "changelog",
  ]) {
    assert.ok(headings.has(heading), `README is missing the “${heading}” section`);
  }

  expectMatch(/```mermaid\s*\nflowchart/i, "architecture should be a renderable diagram");
  for (const service of ["clouddev-ide", "clouddev-git", "clouddev-postgres", "clouddev-router"]) {
    assert.ok(readme.includes(service), `architecture or feature list is missing ${service}`);
  }
});

test("README links launchpad screenshots only when those assets are tracked in the fork", () => {
  for (const image of [
    "docs/assets/screenshots/launchpad-services-desktop.png",
    "docs/assets/screenshots/launchpad-services-mobile.png",
  ]) {
    const tracked = isTracked(image);
    const referenced = readme.includes(image);

    if (tracked) {
      assert.ok(existsSync(path.join(root, image)), `tracked screenshot is missing: ${image}`);
      assert.ok(referenced, `README should use the tracked screenshot: ${image}`);
    } else {
      assert.ok(!referenced, `README must not publish an untracked screenshot path: ${image}`);
    }
  }
});

test("README reports verified capabilities separately from open deployment gates", () => {
  expectMatch(/mock (?:LLM )?provider tests/i, "mock-provider evidence should be explicit");
  expectMatch(/Forgejo[\s\S]{0,180}(?:private|repository|push)/i, "private Git evidence should be explicit");
  expectMatch(/same persistent (?:workspace|filesystem|project tree)/i, "shared persistent files should be explicit");
  expectMatch(/(?:17 of 24|17\/24) gates complete/i, "release status should be stated directly");
  expectMatch(/G20 (?:is )?(?:complete|passed)[\s\S]{0,120}G23 remains open/i, "the public README must distinguish the published docs gate from the pending repository social preview");
  expectMatch(/G15[\s\S]{0,100}G17|G17[\s\S]{0,100}G15/i, "both image release gates should be named");
  expectMatch(/security release hold|release remains on hold/i, "the security hold should be explicit");
  expectMatch(/not (?:a )?(?:published|one-click-verified)|not a published or one-click-verified/i, "the template must not be presented as published");
  expectMatch(/Markdown[\s\S]{0,180}(?:build contexts|\.dockerignore)/i, "Docker build-context exclusions must be disclosed");
  expectMatch(/do not remove files from Git history/i, "build-context exclusions must not be described as history deletion");
  expectMatch(/existing image\s+layers/i, "existing image layers must not be described as purged");
  expectMatch(/read:packages/i, "the unqueried GitHub Packages limitation must remain visible");
});

test("README explains provider billing, DeepSeek, free-model limits, and compliant routing", () => {
  expectMatch(/ChatGPT subscription/i, "ChatGPT subscription must be distinguished from API usage");
  expectMatch(/(?:does not|doesn't) (?:include|provide).{0,50}API (?:credits|balance)/i, "subscription billing distinction must be explicit");
  expectMatch(/OpenAI API/i, "OpenAI API billing must be named");
  expectMatch(/DeepSeek/i, "DeepSeek onboarding must be covered");
  expectMatch(/free (?:model|provider|endpoint)s?.{0,100}(?:change|availability|limits|terms)/i, "free-model limits must be qualified");
  expectMatch(/provider terms, rate limits, and quotas/i, "fallback must respect provider rules");
  expectMatch(/ai-setup[\s\S]{0,180}ai-models/i, "model selection should use the available-model command");
});

test("README keeps security, privacy, recovery, and resource claims evidence-based", () => {
  expectMatch(/Railway private networking does\s+not\s+(?:restrict|filter) outbound traffic/i, "egress limits must be stated accurately");
  expectMatch(/provider master key/i, "provider master key boundary must be documented");
  expectMatch(/administrator (?:credentials|token)/i, "administrator credential boundary must be documented");
  expectMatch(/GDPR|data protection/i, "privacy limits must be documented");
  expectMatch(/(?:restart|interrupted)[\s\S]{0,160}(?:resume|process)/i, "restart recovery limits must be documented");
  expectMatch(/not measured in this repository/i, "resource measurements must not be invented");
  expectMatch(/estimated|estimate/i, "estimates must be distinguished from measurements");
  expectMatch(/backup[\s\S]{0,180}restore/i, "backup and restore must be covered");
});

test("README provides click-through setup, troubleshooting, and upstream license references", () => {
  for (const guide of [
    "docs/getting-started.md",
    "docs/operations/RAILWAY_MARKETPLACE.md",
    "docs/operations/RAILWAY_TEMPLATE_VARIABLES.md",
    "docs/operations/TROUBLESHOOTING.md",
    "docs/security/BACKUP_RESTORE.md",
    "docs/security/IMAGE_SCAN.md",
    "docs/operations/UPSTREAM_LICENSES.md",
    "docs/operations/RELEASE_STATUS.md",
  ]) {
    assert.ok(readme.includes(guide), `README is missing a direct link to ${guide}`);
    assert.ok(existsSync(path.join(root, guide)), `linked operator guide does not exist: ${guide}`);
  }

  expectMatch(/click|choose|select|open/i, "deployment instructions should identify operator actions");
  expectMatch(/MIT/i, "the project's license should be stated");
  expectMatch(/AGPL/i, "CloudCLI's upstream license should be stated");
  expectMatch(/Anthropic.{0,100}(?:terms|proprietary)/i, "Claude Code's separate terms should be stated");

  const deployment = readme.split("## Railway deployment")[1].split("## First-run onboarding")[0];
  assert.ok(
    deployment.indexOf("Create the") < deployment.indexOf("click **Publish**"),
    "the unpublished draft must be test-deployed before publication",
  );
  assert.ok(
    deployment.indexOf("click **Publish**") < deployment.indexOf("published template to another fresh project"),
    "the published template must receive a separate fresh-project test",
  );
});

test("README contains no fabricated Railway template URL or unsafe marketing claims", () => {
  assert.doesNotMatch(readme, /railway\.com\/new\/template\//i);
  assert.doesNotMatch(readme, /<\s*TEMPLATE_(?:ID|CODE)\s*>/i);
  expectMatch(/No template ID|no Railway template ID/i, "the absent template identifier should be explicit");

  for (const unsafeClaim of [
    /military[ -]grade/i,
    /militär[ -]?grade/i,
    /100\s*%\s*(?:EU.only|GDPR.compliant|secure)/i,
    /GDPR compliant by default/i,
    /free forever/i,
    /\b(?:supports?|works with) (?:every|all) providers?\b|universal provider support/i,
    /\b(?:bypass(?:ing)?|evad(?:e|ing)) (?:provider )?(?:limits|quotas|rate limits)\b/i,
    /rotate accounts? to (?:avoid|bypass|evade)/i,
    /\b(?:is|are|has been) one.click verified/i,
  ]) {
    assert.ok(!unsafeClaim.test(readme), `README contains an unsupported claim: ${unsafeClaim}`);
  }
});

test("public Markdown does not describe creator income or reward programs", () => {
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: root })
    .toString("utf8")
    .split("\0")
    .filter(file => /\.(?:md|markdown|mdx)$/i.test(file));
  const incomeLanguage = /\b(?:kickbacks?|payouts?|commissions?|earn(?:ed|ing|ings)?|revenue|profits?|moneti[sz](?:e|ed|ation|ing)|affiliates?|template queue|support bonus|open source\s*&\s*technology partners?)\b/i;
  const matchingFiles = files.filter(file => incomeLanguage.test(readFileSync(path.join(root, file), "utf8")));

  assert.deepEqual(matchingFiles, [], "remove creator income and reward language from public Markdown");
});

test("all README-relative Markdown links point to files that exist", () => {
  const links = [...readme.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1]);

  for (const href of links) {
    if (/^(?:https?:|mailto:|#)/i.test(href)) continue;
    const target = decodeURIComponent(href.split(/[?#]/, 1)[0]);
    if (!target) continue;
    assert.ok(existsSync(path.resolve(root, target)), `README link target does not exist: ${href}`);
  }
});
