import assert from "node:assert/strict";
import { test } from "node:test";
import { isWorkspaceHealthy } from "../src/healthcheck.mjs";

test("treats the protected VS Code route's unauthenticated redirect as healthy", async () => {
  const httpTargets = [];
  const portTargets = [];
  const healthy = await isWorkspaceHealthy({
    httpProbe: async (url, expectedStatus) => {
      httpTargets.push([url, expectedStatus]);
      return true;
    },
    portProbe: async port => {
      portTargets.push(port);
      return true;
    },
  });

  assert.equal(healthy, true);
  assert.deepEqual(httpTargets, [
    ["http://127.0.0.1:8080/healthz", 200],
    ["http://127.0.0.1:8080/vscode/", 302],
    ["http://127.0.0.1:3002/healthz", 200],
    ["http://127.0.0.1:20129/api/monitoring/health", 200],
  ]);
  assert.deepEqual(portTargets, [3001, 8081, 2222]);
});

test("fails workspace health when any required listener or HTTP route is unavailable", async () => {
  assert.equal(await isWorkspaceHealthy({
    httpProbe: async () => true,
    portProbe: async port => port !== 2222,
  }), false);

  assert.equal(await isWorkspaceHealthy({
    httpProbe: async (url, expectedStatus) => expectedStatus !== 302,
    portProbe: async () => true,
  }), false);
});
