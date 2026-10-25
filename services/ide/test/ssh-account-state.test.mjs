import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const ideDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("keeps the SSH account eligible for public-key auth without enabling password login", () => {
  const entrypoint = readFileSync(path.join(ideDirectory, "entrypoint.sh"), "utf8");
  const sshd = readFileSync(path.join(ideDirectory, "sshd_config"), "utf8");
  assert.match(entrypoint, /openssl rand -base64 48/);
  assert.match(entrypoint, /printf 'coder:%s\\n' "\$random_coder_password" \| \/usr\/sbin\/chpasswd/);
  assert.match(entrypoint, /unset random_coder_password/);
  assert.doesNotMatch(entrypoint, /usermod\s+-p|chpasswd\s+-e|--password/);
  assert.match(sshd, /^PasswordAuthentication no$/m);
  assert.match(sshd, /^PermitEmptyPasswords no$/m);
  assert.match(sshd, /^KbdInteractiveAuthentication no$/m);
  assert.match(sshd, /^AuthenticationMethods publickey$/m);
  assert.match(sshd, /^UsePAM no$/m);
});
