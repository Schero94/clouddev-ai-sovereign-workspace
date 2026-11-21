import assert from "node:assert/strict";
import { test } from "node:test";
import { watchCloudCliGateway } from "../src/cloudcli-gateway-refresh.mjs";

test("applies the gateway key to CloudCLI once the handoff file appears or changes", () => {
  let tick = null;
  let file = null;
  let refreshes = 0;
  const stop = watchCloudCliGateway({
    configPath: "/home/coder/.config/clouddev-ai/gateway.json",
    refresh: () => { refreshes += 1; },
    stat: () => {
      if (!file) throw Object.assign(new Error("missing"), { code: "ENOENT" });
      return file;
    },
    schedule: callback => { tick = callback; return { unref() {} }; },
    cancel: () => { tick = null; },
  });

  assert.equal(refreshes, 0, "no refresh before the key exists");
  tick();
  assert.equal(refreshes, 0);

  file = { mtimeMs: 1, size: 10 };
  tick();
  assert.equal(refreshes, 1, "refreshes as soon as the key file appears");
  tick();
  assert.equal(refreshes, 1, "does not rewrite configuration for an unchanged file");

  file = { mtimeMs: 2, size: 10 };
  tick();
  assert.equal(refreshes, 2, "picks up a replaced key");

  stop();
  assert.equal(tick, null);
});

test("retries the same file after a refresh error", () => {
  let tick = null;
  let attempts = 0;
  watchCloudCliGateway({
    configPath: "/x/gateway.json",
    refresh: () => { attempts += 1; if (attempts === 1) throw new Error("not ready"); },
    stat: () => ({ mtimeMs: 5, size: 1 }),
    schedule: callback => { tick = callback; return { unref() {} }; },
    cancel: () => {},
  });
  assert.equal(attempts, 1);
  tick();
  assert.equal(attempts, 2);
  tick();
  assert.equal(attempts, 2);
});
