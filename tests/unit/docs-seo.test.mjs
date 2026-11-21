import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
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

test("robots.txt lets search engines, AI answer engines and AI training crawlers read the public docs", () => {
  const robots = read("docs/robots.txt");
  const groups = robotsGroups(robots);

  assert.match(robots, /^Sitemap: https:\/\/schero94\.github\.io\/clouddev-ai-sovereign-workspace\/sitemap\.xml$/m);
  assert.ok(groups.get("*")?.includes("Allow: /"), "general search crawlers should be allowed");
  for (const bot of [
    "googlebot", "bingbot", "oai-searchbot", "chatgpt-user", "gptbot", "claude-searchbot", "claude-user", "claudebot",
    "perplexitybot", "perplexity-user", "google-extended", "applebot", "applebot-extended", "ccbot", "duckassistbot", "meta-externalagent",
  ]) {
    assert.ok(groups.get(bot)?.includes("Allow: /"), `${bot} should be explicitly allowed`);
  }
  assert.doesNotMatch(robots, /^Disallow:\s*\/\s*$/im, "no crawler may be blocked from the public docs");
});

test("llms.txt points AI assistants to the full-text llms-full.txt and the published template", () => {
  const llms = read("docs/llms.txt");
  assert.match(llms, /^# CloudDev AI/m);
  assert.match(llms, /https:\/\/schero94\.github\.io\/clouddev-ai-sovereign-workspace\/llms-full\.txt/);
  assert.match(llms, /https:\/\/railway\.com\/deploy\/clouddev-release-20261121/);
});

test("the llms-full.txt generator emits every curated page with its canonical URL and no front matter", async () => {
  const { renderLlmsFull, llmsFullPages } = await import("../../scripts/generate-llms-full.mjs");
  const output = renderLlmsFull(root);
  assert.ok(llmsFullPages.length >= 10, "llms-full.txt should cover the user-facing guides");
  for (const page of llmsFullPages) {
    assert.ok(existsSync(path.join(root, "docs", page)), `curated page ${page} must exist`);
    const url = "https://schero94.github.io/clouddev-ai-sovereign-workspace/" + page.replace(/(?:^|\/)index\.md$/, "").replace(/\.md$/, "/");
    assert.ok(output.includes(`URL: ${url}`), `llms-full.txt is missing ${url}`);
  }
  assert.doesNotMatch(output, /^---\ntitle:/m, "front matter must be stripped");
  assert.doesNotMatch(output, /\]\((?!https?:\/\/|#)[^)]+\.md(?:#[^)]*)?\)/, "relative Markdown links must become absolute URLs");
  assert.doesNotMatch(output, /test-secret|sk-[A-Za-z0-9]{20,}|github_pat_/i);
});

test("the theme override emits JSON-LD for the software, every article and visible FAQs", () => {
  const override = read(".docs-overrides/main.html");
  assert.match(override, /application\/ld\+json/);
  for (const token of ["SoftwareApplication", "WebSite", "TechArticle", "FAQPage", "page.is_homepage", "page.meta.faq", "tojson"]) {
    assert.ok(override.includes(token), `the JSON-LD override is missing ${token}`);
  }
  assert.match(override, /railway\.com\/deploy\/clouddev-release-20261121/);
  assert.match(override, /MIT/);
});

function frontMatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n/);
  return match ? match[1] : "";
}

function faqEntries(markdown) {
  const entries = [];
  const block = frontMatter(markdown).split(/^faq:\s*$/m)[1] ?? "";
  for (const match of block.matchAll(/^\s+- q: "([^"]+)"\n\s+a: "([^"]+)"/gm)) entries.push({ q: match[1], a: match[2] });
  return entries;
}

function visibleText(markdown) {
  return markdown.replace(/^---\n[\s\S]*?\n---\n/, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/<[^>]+>/g, " ").replace(/\*\*/g, "").replace(/\s+/g, " ");
}

test("FAQ structured data matches questions and answers that are visible on the page", () => {
  for (const page of ["docs/index.md", "docs/how-to/code-from-ipad.md"]) {
    const markdown = read(page);
    const entries = faqEntries(markdown);
    assert.ok(entries.length >= 4, `${page} should declare at least four FAQ entries`);
    const body = visibleText(markdown);
    for (const { q, a } of entries) {
      assert.ok(body.includes(q), `${page}: FAQ question is not visible: ${q}`);
      assert.ok(body.includes(a.replace(/\s+/g, " ")), `${page}: FAQ answer is not visible: ${a}`);
    }
  }
});

test("the docs home page targets real search intent and links the published template", () => {
  const home = read("docs/index.md");
  const title = frontMatter(home).match(/^title:\s*(.+)$/m)?.[1] ?? "";
  for (const term of ["Claude Code", "Codex", "Railway"]) assert.ok(title.includes(term), `home title should name ${term}`);
  const description = frontMatter(home).match(/^description:\s*(.+)$/m)?.[1] ?? "";
  assert.ok(description.length >= 120 && description.length <= 165, "home description should fit a search snippet");
  assert.match(home, /\(https:\/\/railway\.com\/deploy\/clouddev-release-20261121\)/);
  assert.doesNotMatch(home, /No live Railway template|Marketplace publication still require/i);
});

test("IndexNow key file and submit script cover only this Pages site", async () => {
  const keyFiles = readdirSync(path.join(root, "docs")).filter(name => /^[0-9a-f]{32}\.txt$/.test(name));
  assert.equal(keyFiles.length, 1, "exactly one IndexNow key file belongs at the docs root");
  const key = keyFiles[0].replace(/\.txt$/, "");
  assert.equal(read(`docs/${keyFiles[0]}`).trim(), key);
  const { buildIndexNowPayload } = await import("../../scripts/submit-indexnow.mjs");
  const sitemap = `<urlset><url><loc>https://schero94.github.io/clouddev-ai-sovereign-workspace/</loc></url><url><loc>https://schero94.github.io/clouddev-ai-sovereign-workspace/features/</loc></url><url><loc>https://example.com/x</loc></url></urlset>`;
  const payload = buildIndexNowPayload(sitemap, key);
  assert.equal(payload.host, "schero94.github.io");
  assert.equal(payload.keyLocation, `https://schero94.github.io/clouddev-ai-sovereign-workspace/${key}.txt`);
  assert.deepEqual(payload.urlList, [
    "https://schero94.github.io/clouddev-ai-sovereign-workspace/",
    "https://schero94.github.io/clouddev-ai-sovereign-workspace/features/",
  ]);
  const workflow = read(".github/workflows/docs.yml");
  assert.match(workflow, /node scripts\/submit-indexnow\.mjs/);
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
