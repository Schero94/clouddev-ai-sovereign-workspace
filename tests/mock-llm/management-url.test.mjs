import assert from "node:assert/strict";
import test from "node:test";
import { resolveManagementUrl } from "./management-url.mjs";

test("OmniRoute management routes retain the configured base path without duplicating api", () => {
  assert.equal(
    resolveManagementUrl("http://localhost:8080/omniroute/", "/api/keys").href,
    "http://localhost:8080/omniroute/api/keys",
  );
  assert.equal(
    resolveManagementUrl("http://localhost:8080/omniroute", "/api/providers/one/sync-models?mode=import&quiet=1").href,
    "http://localhost:8080/omniroute/api/providers/one/sync-models?mode=import&quiet=1",
  );
});

test("OmniRoute management URL construction rejects routes outside the base path", () => {
  assert.throws(
    () => resolveManagementUrl("http://localhost:8080/omniroute/", "/../auth/login"),
    /must stay under the configured base path/,
  );
});
