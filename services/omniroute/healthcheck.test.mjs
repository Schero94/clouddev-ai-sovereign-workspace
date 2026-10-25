import assert from "node:assert/strict";
import { test } from "node:test";
import { checkHealth, healthUrl } from "./healthcheck.mjs";

test("uses OmniRoute's minimal local liveness endpoint", () => {
  assert.equal(healthUrl({ PORT: "20128" }), "http://127.0.0.1:20128/healthz");
  assert.equal(healthUrl({ PORT: "20128", OMNIROUTE_BASE_PATH: "/omniroute" }), "http://127.0.0.1:20128/omniroute/healthz");
  assert.equal(healthUrl({ OMNIROUTE_HEALTH_URL: "http://localhost:20128/healthz" }), "http://localhost:20128/healthz");
});

test("rejects public, credentialed, or non-health URLs", () => {
  for (const value of [
    "https://router.example.test/healthz",
    "http://127.0.0.1:20128/api/monitoring/health",
    "http://user:pass@127.0.0.1:20128/healthz",
    "http://127.0.0.1:20128/healthz?debug=true",
    "http://127.0.0.1:20128/omniroute/healthz/extra",
    "http://127.0.0.1:20128//healthz",
  ]) assert.throws(() => healthUrl({ OMNIROUTE_HEALTH_URL: value }));
  assert.throws(() => healthUrl({ PORT: "20128", OMNIROUTE_BASE_PATH: "//evil" }));
});

test("reports only healthy when the upstream returns status 200", async () => {
  assert.equal(await checkHealth({ fetchImpl: async () => new Response("ok", { status: 200 }) }), true);
  assert.equal(await checkHealth({ fetchImpl: async () => new Response("unavailable", { status: 503 }) }), false);
  assert.equal(await checkHealth({ fetchImpl: async () => { throw new Error("private details"); } }), false);
});

test("does not wait for a hanging health endpoint", async () => {
  const start = Date.now();
  const healthy = await checkHealth({ fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  }) });
  assert.equal(healthy, false);
  assert.ok(Date.now() - start < 3000);
});
