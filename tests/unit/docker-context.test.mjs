import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const rootIgnore = readFileSync(path.join(root, ".dockerignore"), "utf8");
const rootGitIgnore = readFileSync(path.join(root, ".gitignore"), "utf8");
const forgejoIgnorePath = path.join(root, "services/forgejo/.dockerignore");
const mockIgnorePath = path.join(root, "tests/mock-llm/.dockerignore");
let forgejoIgnore;
let mockIgnore;
try {
  forgejoIgnore = readFileSync(forgejoIgnorePath, "utf8");
} catch {
  forgejoIgnore = "";
}
try {
  mockIgnore = readFileSync(mockIgnorePath, "utf8");
} catch {
  mockIgnore = "";
}

const contexts = {
  ide: readFileSync(path.join(root, "services/ide/Dockerfile"), "utf8"),
  forgejo: readFileSync(path.join(root, "services/forgejo/Dockerfile"), "utf8"),
  router: readFileSync(path.join(root, "services/omniroute/Dockerfile"), "utf8"),
  compose: readFileSync(path.join(root, "docker-compose.yml"), "utf8"),
  mockCompose: readFileSync(path.join(root, "docker-compose.mock.yml"), "utf8"),
  mockDockerfile: readFileSync(path.join(root, "tests/mock-llm/Dockerfile"), "utf8"),
  railway: readFileSync(path.join(root, ".railway/railway.ts"), "utf8"),
};

function patterns(text) {
  return text.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith("#"));
}

test("every current Docker context excludes Markdown from its outbound build context", () => {
  const rootPatterns = patterns(rootIgnore);
  const forgejoPatterns = patterns(forgejoIgnore);
  const extensions = ["md", "MD", "markdown", "MARKDOWN", "mdx", "MDX"];
  const markdownFiles = execFileSync("git", ["ls-files", "-z"], { cwd: root })
    .toString("utf8").split("\0").filter(Boolean).filter(file => /\.(?:md|markdown|mdx)$/i.test(file));

  assert.ok(markdownFiles.length > 0, "fixture must include source Markdown files");
  for (const extension of extensions) {
    assert.ok(rootPatterns.includes(`**/*.${extension}`), `root build context must exclude **/*.${extension}`);
    assert.ok(forgejoPatterns.includes(`**/*.${extension}`), `Forgejo build context must exclude **/*.${extension}`);
  }
  assert.ok(rootPatterns.includes("docs/"), "root contexts should omit the documentation tree entirely");
  for (const localOnly of ["docs-site/", "docs-site/.venv/", "**/.venv/", "tests/", "gates/", "scripts/", "examples/", ".github/", ".railway/", ".agents/", ".claude/", ".codex/", ".cursor/", ".vscode/", ".docs-overrides/"]) {
    assert.ok(rootPatterns.includes(localOnly), `root contexts should omit ${localOnly}`);
  }
  assert.ok(rootPatterns.includes(".playwright-cli/"), "root contexts should not send local browser traces and tokens");
  assert.ok(rootPatterns.includes(".lurus/"), "root contexts should not send local agent metadata");
  assert.ok(rootPatterns.includes(".git") || rootPatterns.includes(".git/"), "root contexts should not send Git metadata");
  assert.ok(patterns(rootGitIgnore).includes(".lurus/"), "the local encrypted assistant index must not be committed to the public repository");
  assert.ok(forgejoPatterns.includes(".git/"), "Forgejo context should not send Git metadata");

  const forgejoMarkdown = markdownFiles.filter(file => file.startsWith("services/forgejo/"));
  assert.ok(forgejoMarkdown.length > 0, "Forgejo context fixture must include a Markdown file");
  assert.ok(!rootPatterns.some(pattern => /^!.*\.(?:md|markdown|mdx)$/i.test(pattern)), "root Docker rules must not re-include Markdown");
  assert.ok(!forgejoPatterns.some(pattern => /^!.*\.(?:md|markdown|mdx)$/i.test(pattern)), "Forgejo Docker rules must not re-include Markdown");
});

test("Compose and Railway use only the documented root and Forgejo subdirectory contexts", () => {
  assert.match(contexts.compose, /clouddev-ide:\s*\n\s+build:\s*\n\s+context:\s*\./);
  assert.match(contexts.compose, /clouddev-router:\s*\n\s+build:\s*\n\s+context:\s*\./);
  assert.match(contexts.compose, /clouddev-git:\s*\n\s+build:\s*\n\s+context:\s*\.\/services\/forgejo/);
  assert.match(contexts.railway, /rootDirectory:\s*"services\/forgejo"/);
  for (const [name, dockerfile] of Object.entries(contexts)) {
    if (name === "compose" || name === "railway") continue;
    assert.doesNotMatch(dockerfile, /COPY\s+(?:--from=[^\s]+\s+)?(?:\.|\.\/|\/workspace)(?:\s|$)/i,
      `${name} Dockerfile must not copy the entire build context into the image`);
  }
});

test("the mock-provider image uses a minimal nested context with its own Markdown exclusions", () => {
  const mockPatterns = patterns(mockIgnore);
  const extensions = ["md", "MD", "markdown", "MARKDOWN", "mdx", "MDX"];

  assert.match(contexts.mockCompose, /clouddev-mock-llm:\s*\n\s+profiles:\s*\[[^\]]*integration[^\]]*\]\s*\n\s+image:[^\n]+\n\s+build:\s*\n\s+context:\s*\.\/tests\/mock-llm\s*\n\s+dockerfile:\s*Dockerfile/);
  assert.match(contexts.mockDockerfile, /COPY\s+--chown=1000:1000\s+server\.mjs\s+/);
  assert.doesNotMatch(contexts.mockDockerfile, /COPY\s+tests\//);
  for (const extension of extensions) {
    assert.ok(mockPatterns.includes(`**/*.${extension}`), `mock build context must exclude **/*.${extension}`);
  }
  assert.ok(mockPatterns.includes(".git/"));
  assert.ok(mockPatterns.includes("node_modules/"));
  assert.ok(!mockPatterns.some(pattern => /^!.*\.(?:md|markdown|mdx)$/i.test(pattern)));
});

test("local Compose host ports can be changed for an isolated docs-preview project", () => {
  for (const [name, port] of [
    ["CLOUDDEV_HTTP_PUBLISH_PORT", "8080"],
    ["CLOUDDEV_SSH_PUBLISH_PORT", "2222"],
    ["FORGEJO_HTTP_PUBLISH_PORT", "3000"],
    ["FORGEJO_SSH_PUBLISH_PORT", "2223"],
    ["OMNIROUTE_DASHBOARD_PUBLISH_PORT", "20128"],
  ]) {
    assert.ok(contexts.compose.includes(`\${${name}:-${port}}`), `Compose should preserve port ${port} by default while allowing a preview override for ${name}`);
  }
});

test("repository automation does not publish container images", () => {
  const workflowDirectory = path.join(root, ".github/workflows");
  const workflows = readdirSync(workflowDirectory).filter(file => file.endsWith(".yml") || file.endsWith(".yaml"));
  assert.ok(workflows.length > 0, "the workflow directory should contain documented automation");

  const source = workflows.map(file => readFileSync(path.join(workflowDirectory, file), "utf8")).join("\n");
  assert.doesNotMatch(source, /docker\/build-push-action|docker\/login-action|docker push|ghcr\.io/i);
});
