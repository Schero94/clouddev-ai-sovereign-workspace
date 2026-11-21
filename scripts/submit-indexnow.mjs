import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteUrl = "https://schero94.github.io/clouddev-ai-sovereign-workspace/";

export function buildIndexNowPayload(sitemapXml, key) {
  const urlList = [...sitemapXml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)]
    .map(match => match[1])
    .filter(url => url.startsWith(siteUrl));
  return { host: new URL(siteUrl).host, key, keyLocation: `${siteUrl}${key}.txt`, urlList };
}

function readKey() {
  const files = readdirSync(path.join(repositoryRoot, "docs")).filter(name => /^[0-9a-f]{32}\.txt$/.test(name));
  if (files.length !== 1) throw new Error("Expected exactly one IndexNow key file in docs/.");
  return files[0].replace(/\.txt$/, "");
}

async function waitForKey(keyLocation, key) {
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const response = await fetch(keyLocation, { cache: "no-store" }).catch(() => null);
    if (response?.ok && (await response.text()).trim() === key) return;
    await new Promise(resolve => setTimeout(resolve, 15_000));
  }
  throw new Error("The published IndexNow key file did not become reachable.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const key = readKey();
    const sitemap = await (await fetch(`${siteUrl}sitemap.xml`, { cache: "no-store" })).text();
    const payload = buildIndexNowPayload(sitemap, key);
    if (payload.urlList.length === 0) throw new Error("The live sitemap lists no documentation URLs.");
    await waitForKey(payload.keyLocation, key);
    const response = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
    });
    if (response.status !== 200 && response.status !== 202) throw new Error(`IndexNow returned HTTP ${response.status}.`);
    console.log(`IndexNow accepted ${payload.urlList.length} URLs with HTTP ${response.status}.`);
  } catch (error) {
    console.error(`IndexNow submission failed: ${error instanceof Error ? error.message : "unknown error"}`);
    process.exitCode = 1;
  }
}
