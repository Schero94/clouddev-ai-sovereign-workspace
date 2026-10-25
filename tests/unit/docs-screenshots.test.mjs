import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const docsRoot = path.join(root, "docs");
const pages = [
  "index.md",
  "how-to/first-login.md",
  "how-to/connect-clients.md",
  "how-to/providers.md",
];

test("every displayed product screenshot has a real local file, descriptive alt text, and a caption", () => {
  let imageCount = 0;
  for (const relativePage of pages) {
    const pagePath = path.join(docsRoot, relativePage);
    const markdown = readFileSync(pagePath, "utf8");
    const figures = [...markdown.matchAll(/<figure\b[^>]*>([\s\S]*?)<\/figure>/gi)].map(match => match[1]);

    for (const figure of figures) {
      const image = figure.match(/<img\b[^>]*>/i)?.[0];
      if (!image) continue;
      imageCount += 1;
      const source = image.match(/\bsrc="([^"]+)"/i)?.[1];
      const alternative = image.match(/\balt="([^"]*)"/i)?.[1];
      const caption = figure.match(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i)?.[1];

      assert.ok(source && !/^(?:https?:|data:)/i.test(source), `${relativePage} images must be local files`);
      assert.ok(alternative?.trim().length >= 24, `${relativePage} screenshot alt text must describe the visible UI`);
      assert.ok(caption?.trim(), `${relativePage} screenshots must include a visible caption and source context`);
      const rootedSource = decodeURIComponent(source).replace(/^(?:\.\.\/)+/, "");
      assert.match(rootedSource, /^assets\/screenshots\/[a-z0-9-]+\.png$/i, `${relativePage} image must resolve to docs/assets/screenshots`);
      const imagePath = path.resolve(docsRoot, rootedSource);
      assert.ok(imagePath.startsWith(`${docsRoot}${path.sep}`), `${relativePage} image must stay under docs/assets`);
      assert.ok(existsSync(imagePath), `${relativePage} image file is missing: ${source}`);
      assert.ok(statSync(imagePath).size > 0 && statSync(imagePath).size < 8_000_000, `${source} must be non-empty and reasonably sized`);
      assert.match(image, /\bwidth="\d+"/i);
      assert.match(image, /\bheight="\d+"/i);
      assert.match(image, /\bloading="lazy"/i);
      assert.match(image, /\bdecoding="async"/i);
    }
  }

  assert.ok(imageCount >= 8, `expected the product and onboarding guides to show at least eight screenshots; found ${imageCount}`);
});

test("unused and cropped local captures are excluded from the published site", () => {
  const configuration = readFileSync(path.join(root, "mkdocs.yml"), "utf8");
  const pagesText = pages.map(page => readFileSync(path.join(docsRoot, page), "utf8")).join("\n");
  const excluded = [
    "browser-vscode-empty-local.png",
    "cloudcli-first-run-desktop.png",
    "forgejo-login-local-desktop.png",
    "forgejo-login-mobile.png",
    "omniroute-onboarding-wizard-desktop.png",
    "omniroute-onboarding-wizard-mobile.png",
    "omniroute-provider-catalog-desktop.png",
  ];

  for (const filename of excluded) {
    assert.match(configuration, new RegExp(`assets/screenshots/${filename.replaceAll(".", "\\.")}`));
    assert.doesNotMatch(pagesText, new RegExp(filename.replaceAll(".", "\\.")));
  }
});
