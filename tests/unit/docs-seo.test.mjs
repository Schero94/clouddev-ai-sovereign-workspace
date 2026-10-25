import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = relative => readFileSync(path.join(root, relative), "utf8");

function robotsGroups(contents) {
  const groups = new Map();
  let current = [];
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.split("#", 1)[0].trim();
    if (!trimmed) continue;
    const agent = trimmed.match(/^User-agent:\s*(\S+)$/i);
    if (agent) {
      current = [agent[1]];
      for (const name of current) groups.set(name.toLowerCase(), []);
      continue;
    }
    const rule = trimmed.match(/^(Allow|Disallow):\s*(.*)$/i);
    if (rule) for (const name of current) groups.get(name.toLowerCase()).push(`${rule[1]}: ${rule[2]}`);
  }
  return groups;
}

test("robots.txt keeps public search pages crawlable and blocks training-only bots", () => {
  const robots = read("docs/robots.txt");
  const groups = robotsGroups(robots);

  assert.match(robots, /^Sitemap: https:\/\/schero94\.github\.io\/clouddev-ai-sovereign-workspace\/sitemap\.xml$/m);
  assert.ok(groups.get("*")?.includes("Allow: /"), "general search crawlers should be allowed");
  for (const searchBot of ["oai-searchbot", "perplexitybot", "perplexity-user", "claude-searchbot", "claude-user"]) {
    assert.ok(groups.get(searchBot)?.includes("Allow: /"), `${searchBot} should be allowed for search or user-directed retrieval`);
  }
  for (const trainingBot of ["gptbot", "claudebot"]) {
    assert.ok(groups.get(trainingBot)?.includes("Disallow: /"), `${trainingBot} should be blocked by the published crawler policy`);
  }
  assert.ok(groups.get("google-extended")?.includes("Allow: /"), "Google-Extended should remain allowed for requested Gemini retrieval visibility, with its broader data-use trade-off documented");
  assert.doesNotMatch(robots, /User-agent:\s*\*\s*\nDisallow:\s*\//i);
});

test("MkDocs emits page-specific Open Graph and Twitter metadata from its supported theme override", () => {
  const configuration = read("mkdocs.yml");
  const override = read(".docs-overrides/main.html");

  assert.match(configuration, /custom_dir:\s*\.docs-overrides/);
  for (const token of ["og:type", "og:site_name", "og:title", "og:description", "og:url", "og:image", "og:image:alt", "twitter:card", "twitter:title", "twitter:description", "twitter:image"]) {
    assert.ok(override.includes(token), `the theme override is missing ${token}`);
  }
  assert.match(override, /page\.canonical_url/);
  assert.match(override, /page\.meta\.description/);
  assert.match(override, /assets\/clouddev-social-preview\.png/);
  assert.match(override, /summary_large_image/);
  assert.doesNotMatch(override, /https?:\/\/(?:www\.)?(?:googleapis|googletagmanager)\.com/i);
});

test("the social preview is a readable 1200 by 630 image with an honest README description", () => {
  const pngPath = path.join(root, "docs/assets/clouddev-social-preview.png");
  const svgPath = path.join(root, "docs/assets/clouddev-social-preview.svg");
  const png = readFileSync(pngPath);
  const svg = readFileSync(svgPath, "utf8");
  const readme = read("README.md");

  assert.ok(existsSync(pngPath) && existsSync(svgPath));
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
  assert.ok(png.byteLength < 1_000_000, "social preview should remain below GitHub's 1 MB upload limit");
  for (const phrase of ["CloudDev AI", "Sovereign Workspace", "VS Code Desktop", "Browser VS Code", "CloudCLI mobile"]) {
    assert.ok(svg.includes(phrase), `the preview should name ${phrase}`);
  }
  assert.match(readme, /!\[Illustration of the CloudDev AI single-user workspace[^\]]*\]\(docs\/assets\/clouddev-social-preview\.png\)/i);
  assert.match(readme, /illustration[^\n]{0,100}not a product screenshot/i);
  assert.doesNotMatch(svg, /test-secret|sk-[A-Za-z0-9]{20,}|github_pat_|password\s*[:=]/i);
});
