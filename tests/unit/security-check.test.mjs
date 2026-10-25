import assert from "node:assert/strict";
import { test } from "node:test";
import { findTextViolations, scanRepository } from "../../scripts/security-check.mjs";

test("detects secret-shaped literals only in runtime source", () => {
  const violations = findTextViolations(
    "services/ide/src/config.mjs",
    'const api = "sk-ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij";\n',
  );
  assert.deepEqual(violations, ["services/ide/src/config.mjs:1: secret-shaped credential"]);
});

test("checks image pinning and runtime privilege patterns in their applicable files", () => {
  assert.ok(findTextViolations("services/ide/Dockerfile", "FROM codercom/code-server:latest\n").some(item => item.includes("unpinned latest image")));
  assert.ok(findTextViolations("services/ide/Dockerfile", "RUN mount /var/run/docker.sock\n").some(item => item.includes("Docker socket")));
  assert.deepEqual(findTextViolations("README.md", "Use image:sample:latest."), []);
});

test("the repository source currently satisfies the static security policy", () => {
  const result = scanRepository();
  assert.ok(result.filesScanned > 0);
  assert.deepEqual(result.violations, []);
});
