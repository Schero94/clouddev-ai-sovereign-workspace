import assert from "node:assert/strict";
import { test } from "node:test";
import { localSshEndpoint, parseEnvText, quotePosix } from "../../scripts/verify-local-utils.mjs";

test("parses generated env data without evaluating shell syntax", () => {
  const values = parseEnvText([
    "# local test secrets",
    "CODE_SERVER_PASSWORD=private=value",
    "SSH_AUTHORIZED_KEYS=ssh-ed25519 AAAA test",
    "UNTRUSTED=$(touch /tmp/clouddev-must-not-run)",
  ].join("\n"));
  assert.equal(values.CODE_SERVER_PASSWORD, "private=value");
  assert.equal(values.SSH_AUTHORIZED_KEYS, "ssh-ed25519 AAAA test");
  assert.equal(values.UNTRUSTED, "$(touch /tmp/clouddev-must-not-run)");
});

test("rejects malformed and duplicate env keys", () => {
  assert.throws(() => parseEnvText("NOT A KEY=value"), /invalid/i);
  assert.throws(() => parseEnvText("KEY=one\nKEY=two"), /duplicate/i);
});

test("quotes remote POSIX shell arguments, including embedded apostrophes", () => {
  assert.equal(quotePosix("/workspace/project's file"), "'/workspace/project'\\''s file'");
  assert.equal(quotePosix("a; rm -rf /"), "'a; rm -rf /'");
});

test("accepts only loopback host and a valid local SSH port", () => {
  assert.deepEqual(localSshEndpoint({ IDE_SSH_PROXY_HOST: "localhost", IDE_SSH_PROXY_PORT: "2222" }), {
    host: "localhost",
    port: 2222,
  });
  assert.throws(() => localSshEndpoint({ IDE_SSH_PROXY_HOST: "workspace.example", IDE_SSH_PROXY_PORT: "2222" }), /loopback/);
  assert.throws(() => localSshEndpoint({ IDE_SSH_PROXY_HOST: "localhost", IDE_SSH_PROXY_PORT: "0" }), /port/);
});
