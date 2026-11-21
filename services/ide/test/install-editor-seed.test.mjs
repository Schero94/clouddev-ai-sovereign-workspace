import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { installEditorSeed } from "../src/install-editor-seed.mjs";

function seedWith(root, name, content) {
  const directory = path.join(root, name);
  mkdirSync(directory);
  writeFileSync(path.join(directory, "package.json"), content);
  return directory;
}

test("installs prepared editor extensions once and leaves an operator copy unchanged", () => {
  const root = mkdtempSync(path.join(tmpdir(), "clouddev-editor-seed-"));
  const seed = path.join(root, "seed");
  const extensions = path.join(root, "extensions");
  mkdirSync(seed);
  mkdirSync(extensions);
  seedWith(seed, "redhat.vscode-yaml-2.1.2026102308", "{\"name\":\"yaml\"}\n");

  const first = installEditorSeed({ seedDirectory: seed, extensionsDirectory: extensions });
  const installedFile = path.join(extensions, "redhat.vscode-yaml-2.1.2026102308", "package.json");
  writeFileSync(installedFile, "{\"name\":\"operator\"}\n");
  const second = installEditorSeed({ seedDirectory: seed, extensionsDirectory: extensions });

  assert.deepEqual(first, ["redhat.vscode-yaml-2.1.2026102308"]);
  assert.deepEqual(second, []);
  assert.equal(readFileSync(installedFile, "utf8"), "{\"name\":\"operator\"}\n");
});

test("ignores code-server metadata files in the prepared seed", () => {
  const root = mkdtempSync(path.join(tmpdir(), "clouddev-editor-seed-"));
  const seed = path.join(root, "seed");
  const extensions = path.join(root, "extensions");
  mkdirSync(seed);
  mkdirSync(extensions);
  writeFileSync(path.join(seed, "extensions.json"), "[]\n");
  writeFileSync(path.join(seed, ".obsolete"), "");
  seedWith(seed, "redhat.vscode-yaml-2.1.2026102308", "{\"name\":\"yaml\"}\n");

  const installed = installEditorSeed({ seedDirectory: seed, extensionsDirectory: extensions });

  assert.deepEqual(installed, ["redhat.vscode-yaml-2.1.2026102308"]);
});

test("refuses symlink seeds and symlink extension destinations", () => {
  const root = mkdtempSync(path.join(tmpdir(), "clouddev-editor-seed-"));
  const seed = path.join(root, "seed");
  const extensions = path.join(root, "extensions");
  const outside = path.join(root, "outside");
  mkdirSync(seed);
  mkdirSync(extensions);
  mkdirSync(outside);
  symlinkSync(outside, path.join(seed, "publisher.editor-1.0.0"));
  assert.throws(() => installEditorSeed({ seedDirectory: seed, extensionsDirectory: extensions }), /real directories/);

  const cleanSeed = path.join(root, "clean-seed");
  mkdirSync(cleanSeed);
  seedWith(cleanSeed, "publisher.editor-1.0.0", "{\"name\":\"editor\"}\n");
  symlinkSync(outside, path.join(extensions, "publisher.editor-1.0.0"));
  assert.throws(() => installEditorSeed({ seedDirectory: cleanSeed, extensionsDirectory: extensions }), /symlink/);
});
