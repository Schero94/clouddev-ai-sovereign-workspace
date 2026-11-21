import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteUrl = "https://schero94.github.io/clouddev-ai-sovereign-workspace/";

export const llmsFullPages = [
  "how-to/code-from-ipad.md",
  "features.md",
  "how-to/deploy-on-railway.md",
  "how-to/first-login.md",
  "how-to/connect-clients.md",
  "how-to/providers.md",
  "providers/COMPATIBILITY.md",
  "getting-started.md",
  "architecture.md",
  "operations/RELEASE_STATUS.md",
  "operations/TROUBLESHOOTING.md",
  "security/SECURITY_HARDENING.md",
  "privacy/DATA_FLOW.md",
  "security/BACKUP_RESTORE.md",
];

function pageUrl(page) {
  return siteUrl + page.replace(/(?:^|\/)index\.md$/, "").replace(/\.md$/, "/");
}

function absoluteLinks(markdown, page) {
  return markdown.replace(/\]\(([^)\s]+)\)/g, (match, href) => {
    if (/^(?:[a-z]+:|#)/i.test(href)) return match;
    const [target, anchor] = href.split("#");
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(page), target));
    if (resolved.startsWith("..")) return match;
    const url = resolved.endsWith(".md") ? pageUrl(resolved) : siteUrl + resolved;
    return `](${url}${anchor ? `#${anchor}` : ""})`;
  });
}

function splitFrontMatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return { meta: "", body: markdown };
  return { meta: match[1], body: markdown.slice(match[0].length) };
}

export function renderLlmsFull(root = repositoryRoot) {
  const sections = [
    "# CloudDev AI: Sovereign Workspace — full documentation",
    "",
    "> Single-user Railway template that runs Claude Code, Codex, browser VS Code, Node.js and Python on the user's own Railway project, reachable from an iPad, phone or computer. Deploy: https://railway.com/deploy/clouddev-release-20261121 · Source (MIT): https://github.com/Schero94/clouddev-ai-sovereign-workspace",
    "",
    `This file concatenates the main guides of ${siteUrl} for AI assistants. Each section names its canonical URL.`,
  ];
  for (const page of llmsFullPages) {
    const { meta, body } = splitFrontMatter(readFileSync(path.join(root, "docs", page), "utf8"));
    const description = meta.match(/^description:\s*(.+)$/m)?.[1]?.trim();
    sections.push("", "---", "", `URL: ${pageUrl(page)}`);
    if (description) sections.push(`Summary: ${description}`);
    sections.push("", absoluteLinks(body, page).trim());
  }
  return `${sections.join("\n")}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(path.join(repositoryRoot, "docs/llms-full.txt"), renderLlmsFull());
  console.log(`Wrote docs/llms-full.txt with ${llmsFullPages.length} pages.`);
}
