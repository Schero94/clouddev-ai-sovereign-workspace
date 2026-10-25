import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parseGates, renderReleaseStatus } from "../../scripts/generate-docs-status.mjs";
import { inspectDocsArtifact } from "../../scripts/check-docs-artifact.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readDoc(relativePath) {
  return readFileSync(path.join(root, "docs", relativePath), "utf8");
}

function localMarkdownLinks(markdown) {
  const content = markdown.replace(/^```[\s\S]*?^```/gm, "");
  return [...content.matchAll(/\]\(([^)\s]+)(?:\s+[^)]*)?\)/g)]
    .map(match => match[1])
    .filter(href => !/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(href));
}

function assertPageMetadata(markdown, route) {
  const frontmatter = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert.ok(frontmatter, `${route} needs YAML front matter`);
  assert.match(frontmatter[1], /^title:\s*\S.+$/m, `${route} needs a useful title`);
  assert.match(frontmatter[1], /^description:\s*\S.+$/m, `${route} needs a page-specific description`);
  assert.match(frontmatter[1], /^tags:\s*\n(?:\s+-\s+\S.+\n?){2,}/m, `${route} needs at least two descriptive tags`);
}

test("docs check generates the ignored release-status page before link tests run on a clean checkout", () => {
  const scripts = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).scripts;
  const command = scripts["docs:check"];
  const generateIndex = command.indexOf("npm run docs:generate");
  const testsIndex = command.indexOf("node --test");

  assert.ok(generateIndex >= 0 && generateIndex < testsIndex,
    "docs:check must create the generated local link target before tests that validate it");
  assert.ok(command.includes("tests/unit/readme-launch.test.mjs"),
    "the Pages build must run README and public Markdown release-copy checks");
});

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

test("root release ledger contains every unique gate from G1 through G24", () => {
  const gates = parseGates(readFileSync(path.join(root, "GATES.md"), "utf8"));
  const ids = gates.map(gate => gate.id).sort((left, right) => Number(left.slice(1)) - Number(right.slice(1)));

  assert.deepEqual(ids, Array.from({ length: 24 }, (_, index) => `G${index + 1}`));
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
    mkdirSync(path.join(site, "assets"), { recursive: true });
    const validIndex = `<!doctype html><html><head><title>CloudDev Docs</title>
      <link rel="canonical" href="https://example.com/">
      <meta property="og:title" content="CloudDev Docs">
      <meta property="og:description" content="Public documentation">
      <meta property="og:url" content="https://example.com/">
      <meta property="og:image" content="https://example.com/assets/clouddev-social-preview.png">
      <meta property="og:image:alt" content="Illustration of the workspace">
      <meta name="twitter:card" content="summary_large_image">
      </head><body></body></html>`;
    writeFileSync(path.join(site, "index.html"), validIndex);
    writeFileSync(path.join(site, "robots.txt"), "User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml\n");
    writeFileSync(path.join(site, "sitemap.xml"), "<urlset><url><loc>https://example.com/</loc></url></urlset>");
    writeFileSync(path.join(site, "assets", "clouddev-social-preview.png"), Buffer.from("png-fixture"));
    writeFileSync(path.join(site, "operations", "release-status", "index.html"), validIndex.replace(/https:\/\/example\.com\//g, "https://example.com/operations/release-status/"));
    assert.deepEqual(inspectDocsArtifact(site), []);

    writeFileSync(path.join(site, "index.html"), "<!doctype html><title>missing social tags</title>");
    assert.match(inspectDocsArtifact(site).join("\n"), /Open Graph title is missing/);
    writeFileSync(path.join(site, "index.html"), validIndex);
    rmSync(path.join(site, "robots.txt"));
    assert.match(inspectDocsArtifact(site).join("\n"), /missing required discovery asset: robots\.txt/);
    writeFileSync(path.join(site, "robots.txt"), "User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml\n");

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
  const stylesheet = readFileSync(stylesheetPath, "utf8");
  const brandPath = path.join(root, "docs/assets/clouddev-mark.svg");

  assert.ok(existsSync(stylesheetPath), "the local landing-page stylesheet should exist");
  assert.ok(existsSync(brandPath), "the local CloudDev brand mark should exist");
  assert.match(configuration, /extra_css:\s*\n\s*- stylesheets\/landing\.css/);
  assert.match(configuration, /logo:\s*assets\/clouddev-mark\.svg/);
  assert.match(configuration, /favicon:\s*assets\/clouddev-mark\.svg/);
  assert.match(configuration, /scheme: slate[\s\S]*?name: Switch to light mode[\s\S]*?scheme: default[\s\S]*?name: Switch to dark mode/);
  assert.match(configuration, /plugins:\s*\n\s*- search/);
  const titleRule = stylesheet.match(/body:has\(\.cd-home-title\) \.cd-home-title\s*{([^}]+)}/)?.[1] ?? "";
  const titleTracking = Number(titleRule.match(/letter-spacing:\s*(-?[\d.]+)em/)?.[1]);
  assert.ok(Number.isFinite(titleTracking) && titleTracking > -0.06, "hero title tracking should preserve visible word spacing");

  for (const label of ["VS Code Desktop", "Browser IDE", "CloudCLI mobile", "/workspace"]) {
    assert.ok(home.includes(label), `the landing page is missing ${label}`);
  }
  assert.match(home, /One workspace\. <br>/, "the hero heading should keep a text separator before its visual line break");
  for (const route of ["getting-started.md", "features.md", "how-to/deploy-on-railway.md", "how-to/first-login.md", "how-to/connect-clients.md", "operations/RELEASE_STATUS.md", "architecture.md", "operations/CONTROL_PLANE.md"]) {
    assert.ok(home.includes(route), `the landing page is missing the ${route} route`);
  }
  assert.doesNotMatch(home, /href="[^"]+\.md"/i, "local content links must use Markdown so MkDocs rewrites them to published routes");
  for (const href of localMarkdownLinks(home)) {
    const destination = decodeURIComponent(href.split(/[?#]/, 1)[0]);
    assert.ok(existsSync(path.resolve(path.dirname(path.join(root, "docs/index.md")), destination)), `broken local landing-page link: ${href}`);
  }
  assert.match(home, /do not share UI state/i);
  assert.match(home, /interrupted/i);
  assert.match(home, /resume/i);
  assert.equal((home.match(/<div class="cd-client">/g) ?? []).length, 3, "all three cross-device clients should be visible markup, not a code sample");
  assert.doesNotMatch(home, /[—–]/, "landing-page copy should use plain punctuation");

  assert.match(stylesheet, /prefers-reduced-motion/);
  assert.match(stylesheet, /:focus-visible/);
  assert.match(stylesheet, /@media[^\{]*max-width/);
  assert.match(stylesheet, /body:has\(\.cd-home-title\) \.cd-route-grid/);
  assert.match(stylesheet, /grid-template-columns:\s*2\.1rem minmax\(0,\s*1fr\)/, "mobile release note should reserve a fixed icon column and leave room for its copy");
  assert.match(stylesheet, /\.cd-release-note > p:last-child\s*\{\s*grid-column:\s*2/s, "the release-status link should sit below the message on narrow screens");
  assert.doesNotMatch(stylesheet, /@import\s+url|fonts\.googleapis\.com/i);
});

test("public documentation journey registers feature and how-to routes with page metadata", () => {
  const configuration = readFileSync(path.join(root, "mkdocs.yml"), "utf8");
  const home = readDoc("index.md");
  const routes = [
    ["features.md", /- Features:\s*features\.md/],
    ["how-to/deploy-on-railway.md", /- Deploy on Railway:\s*how-to\/deploy-on-railway\.md/],
    ["how-to/first-login.md", /- First login:\s*how-to\/first-login\.md/],
    ["how-to/connect-clients.md", /- Connect clients:\s*how-to\/connect-clients\.md/],
  ];

  assert.match(configuration, /^site_name:\s*\S.+$/m);
  assert.match(configuration, /^site_description:\s*\S.+$/m);
  assert.match(configuration, /^site_url:\s*https:\/\//m);
  assert.match(configuration, /^site_author:\s*\S.+$/m);
  assert.match(configuration, /^copyright:\s*\S.+$/m);
  assert.match(configuration, /AI providers:[\s\S]*Connect a provider:\s*how-to\/providers\.md[\s\S]*Provider compatibility:\s*providers\/COMPATIBILITY\.md/);
  assert.match(configuration, /generator:\s*false/);
  assert.match(configuration, /font:\s*false/);
  assert.doesNotMatch(configuration, /googleapis\.com|googletagmanager|google-analytics/i, "the docs site must not load remote fonts or tracking scripts");
  assertPageMetadata(home, "index.md");

  for (const [route, navigationPattern] of routes) {
    const file = path.join(root, "docs", route);
    assert.ok(existsSync(file), `${route} should exist`);
    assert.match(configuration, navigationPattern, `${route} should have a named navigation entry`);
    assertPageMetadata(readFileSync(file, "utf8"), route);
  }

  for (const [route, navigationPattern] of [
    ["how-to/providers.md", /Connect a provider:\s*how-to\/providers\.md/],
    ["providers/COMPATIBILITY.md", /Provider compatibility:\s*providers\/COMPATIBILITY\.md/],
  ]) {
    assert.ok(existsSync(path.join(root, "docs", route)), `${route} should exist`);
    assert.match(configuration, navigationPattern, `${route} should be discoverable without changing its content`);
  }
});

test("landing page uses only the supplied real launchpad captures with accessible captions", () => {
  const home = readDoc("index.md");
  const images = [...home.matchAll(/<img\b[^>]*>/gi)].map(match => match[0]);
  const approvedCaptures = [
    "assets/screenshots/launchpad-services-desktop.png",
    "assets/screenshots/launchpad-services-mobile.png",
  ];

  assert.equal(images.length, approvedCaptures.length, "show the two supplied launchpad captures without adding mock imagery");
  for (const capture of approvedCaptures) {
    assert.ok(home.includes(capture), `landing page should reference ${capture}`);
    assert.ok(existsSync(path.join(root, "docs", capture)), `real screenshot ${capture} must exist in the fork`);
  }
  for (const image of images) {
    assert.match(image, /\bsrc="assets\/screenshots\/launchpad-services-(?:desktop|mobile)\.png"/);
    assert.match(image, /\balt="[^"\s][^"]*"/, "each screenshot needs a useful alt description");
    assert.match(image, /\bwidth="\d+"/);
    assert.match(image, /\bheight="\d+"/);
    assert.match(image, /\bloading="lazy"/);
    assert.match(image, /\bdecoding="async"/);
  }
  assert.equal((home.match(/<figure\b/g) ?? []).length, images.length, "each screenshot belongs to a semantic figure");
  assert.equal((home.match(/<figcaption\b/g) ?? []).length, images.length, "each screenshot needs a visible caption");
  assert.match(home, /local launchpad build/i, "captions must distinguish local captures from live Railway evidence");
  assert.doesNotMatch(home, /screenshot placeholder|image coming soon|src=""/i);
});

test("Railway guide gives a click-by-click path without claiming a live template or one-click verification", () => {
  const guide = readDoc("how-to/deploy-on-railway.md");
  const releaseStatus = readDoc("operations/RELEASE_STATUS.md");

  for (const phrase of ["Templates", "New Template", "Template Composer", "Create Template", "Publish", "Deploy Now", "Deploy"]) {
    assert.ok(guide.includes(phrase), `Railway guide is missing the ${phrase} action or state`);
  }
  assert.match(guide, /not (?:yet )?(?:published|verified)|no (?:live )?Railway template ID/i);
  assert.match(guide, /one-click.{0,80}(?:not|unverified)|not.{0,80}one-click/i);
  assert.match(guide, /clouddev-ide[\s\S]*clouddev-git[\s\S]*clouddev-postgres[\s\S]*clouddev-router/);
  assert.match(guide, /europe-west4-drams3a/);
  assert.match(guide, /Serverless|App Sleeping/i);
  assert.match(guide, /SSH_AUTHORIZED_KEYS/);
  assert.match(guide, /secret\(64/);
  assert.match(guide, /provider credentials.{0,100}(?:not|never).{0,60}template/i);
  assert.doesNotMatch(guide, /railway\.com\/new\/template\/[A-Za-z0-9]{6,}/, "do not invent a Railway template code");
  assert.match(releaseStatus, /not|open|pending/i);

  for (const href of localMarkdownLinks(guide)) {
    const destination = decodeURIComponent(href.split(/[?#]/, 1)[0]);
    assert.ok(existsSync(path.resolve(path.dirname(path.join(root, "docs", "how-to/deploy-on-railway.md")), destination)), `broken local link in Railway guide: ${href}`);
  }
  for (const capture of [
    "railway-template-composer-services.png",
    "railway-first-deploy-variables.png",
    "railway-marketplace-listing.png",
  ]) {
    assert.ok(guide.includes(capture), `name the future real Railway capture ${capture} without embedding a placeholder`);
    assert.ok(!existsSync(path.join(root, "docs/assets/screenshots", capture)), `${capture} should only be added after an actual capture exists`);
  }
});

test("first-login and client guides explain the supported shared workspace and recovery boundaries", () => {
  const firstLogin = readDoc("how-to/first-login.md");
  const clients = readDoc("how-to/connect-clients.md");
  const combined = `${firstLogin}\n${clients}`;

  for (const phrase of ["CODE_SERVER_PASSWORD", "Open CloudCLI", "Browser VS Code", "Open Forgejo", "Manage AI providers", "Start Codex", "Start Claude", "ai-setup"]) {
    assert.ok(combined.includes(phrase), `first-run journey is missing ${phrase}`);
  }
  assert.match(clients, /Remote-SSH/);
  assert.match(clients, /SSH_AUTHORIZED_KEYS/);
  assert.match(clients, /iPhone[\s\S]*Android|Android[\s\S]*iPhone/i);
  assert.match(combined, /single-user/i);
  assert.match(combined, /same (?:persistent )?(?:project tree|filesystem|files)/i);
  assert.match(combined, /do not share UI state|editor-window UI state is not shared/i);
  assert.match(combined, /restart[\s\S]{0,160}(?:stop|interrupt|kill)[\s\S]{0,160}(?:manual|user-initiated|supported).{0,60}resume/i);
  assert.match(clients, /ChatGPT.{0,160}(?:subscription|plan).{0,160}(?:API usage|API billing|API credits)/i);
  assert.match(clients, /DeepSeek/i);
  assert.match(clients, /free.{0,100}(?:not guaranteed|not guaranteed|subject to|provider)/i);
  assert.match(clients, /rate limits|usage limits|provider limits/i);
  assert.match(clients, /does not.{0,120}(?:bypass|circumvent)|do not.{0,120}(?:bypass|circumvent)/i);
  assert.match(clients, /no.{0,60}universal.{0,40}(?:provider|model)|not every.{0,60}(?:provider|model)/i);

  for (const page of [firstLogin, clients]) {
    assertPageMetadata(page, "client onboarding guide");
    for (const href of localMarkdownLinks(page)) {
      const destination = decodeURIComponent(href.split(/[?#]/, 1)[0]);
      assert.ok(existsSync(path.resolve(path.dirname(path.join(root, "docs", "how-to/first-login.md")), destination)) || existsSync(path.resolve(path.dirname(path.join(root, "docs", "how-to/connect-clients.md")), destination)), `broken local guide link: ${href}`);
    }
  }

  const firstLoginImages = [...firstLogin.matchAll(/<img\b[^>]*>/gi)].map(match => match[0]);
  const expectedFirstLoginImages = new Set([
    "launchpad-services-desktop.png",
    "launchpad-services-mobile.png",
    "cloudcli-first-run-mobile.png",
    "forgejo-login-desktop.png",
  ]);
  assert.equal(firstLoginImages.length, expectedFirstLoginImages.size, "first login should show launchpad, CloudCLI and Forgejo screens");
  for (const image of firstLoginImages) {
    const source = image.match(/\bsrc="([^"]+)"/)?.[1];
    assert.ok(source, "first-login screenshot needs a source");
    assert.match(source, /^\.\.\/\.\.\/assets\/screenshots\/[a-z0-9-]+\.png$/, "nested how-to pages must resolve image URLs from the MkDocs site root");
    assert.ok(expectedFirstLoginImages.has(path.basename(source)), `unexpected first-login screenshot: ${source}`);
    assert.ok(existsSync(path.join(root, "docs/assets/screenshots", path.basename(source))), `missing first-login screenshot: ${source}`);
    assert.match(image, /\balt="[^"\s][^"]*"/);
    assert.match(image, /\bloading="lazy"/);
    assert.match(image, /\bdecoding="async"/);
  }
  assert.equal((firstLogin.match(/<figure\b/g) ?? []).length, expectedFirstLoginImages.size);
  assert.equal((firstLogin.match(/<figcaption\b/g) ?? []).length, expectedFirstLoginImages.size);
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
