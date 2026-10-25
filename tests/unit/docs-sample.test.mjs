import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sampleRoot = path.join(root, "examples/hello-workspace");

test("first-run sample project is static, local, and safe to preview", () => {
  const readmePath = path.join(sampleRoot, "README.md");
  const htmlPath = path.join(sampleRoot, "index.html");
  const cssPath = path.join(sampleRoot, "styles.css");
  const faviconPath = path.join(sampleRoot, "favicon.svg");

  for (const file of [readmePath, htmlPath, cssPath, faviconPath]) {
    assert.ok(existsSync(file), `sample project file is missing: ${path.relative(root, file)}`);
  }

  const readme = readFileSync(readmePath, "utf8");
  const html = readFileSync(htmlPath, "utf8");
  const css = readFileSync(cssPath, "utf8");

  assert.match(readme, /index\.html/);
  assert.match(readme, /Open Folder/);
  assert.match(html, /CloudDev sample workspace/);
  assert.match(html, /rel="icon" href="favicon\.svg"/);
  assert.match(readFileSync(faviconPath, "utf8"), /<svg/);
  assert.match(html, /styles\.css/);
  assert.doesNotMatch(html, /<script\b|https?:\/\//i);
  assert.doesNotMatch(css, /@import\s+url|https?:\/\//i);
});
