import { spawnSync } from "node:child_process";
import { chmodSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

const KEY_NAME = "id_ed25519_clouddev";

function inspectRegularFile(target) {
  try {
    const metadata = lstatSync(target);
    if (metadata.isSymbolicLink()) throw new Error("Refusing a symlink at the dedicated CloudDev SSH key path.");
    if (!metadata.isFile()) throw new Error("Refusing a non-regular file at the dedicated CloudDev SSH key path.");
    return metadata;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function readPublicKey(publicPath) {
  inspectRegularFile(publicPath);
  const key = readFileSync(publicPath, "utf8").trim();
  if (!/^ssh-ed25519 [A-Za-z0-9+/]+={0,2}(?: .*)?$/.test(key)) {
    throw new Error("The existing public-key file is not a valid Ed25519 public key. Existing files were left untouched.");
  }
  return key;
}

function showPublicKey(publicKey, stdout) {
  stdout.write("Public key for Forgejo:\n");
  stdout.write(`${publicKey}\n\n`);
  stdout.write("Add this key to the SSH keys in your regular non-admin Forgejo account. Do not use the Forgejo administrator account or an administrator token.\n");
  stdout.write("Keep ~/.ssh/id_ed25519_clouddev private. Only the .pub file above should be added to Forgejo.\n");
}

function makeBackupPath(directory, suffix) {
  return path.join(directory, `.clouddev-ssh-backup-${randomUUID()}-${suffix}`);
}

export async function setupGitKey({
  home = process.env.HOME,
  sshKeygenPath = "ssh-keygen",
  spawnSyncImpl = spawnSync,
  confirmOverwrite,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  if (!home) throw new Error("The persistent IDE home directory is unavailable.");
  const homePath = path.resolve(home);
  const homeMetadata = lstatSync(homePath);
  if (homeMetadata.isSymbolicLink() || !homeMetadata.isDirectory()) throw new Error("The IDE home must be a real directory, not a symlink.");
  if (typeof process.getuid === "function" && homeMetadata.uid !== process.getuid()) throw new Error("The IDE home must belong to the current non-root user.");

  const sshDirectory = path.join(homePath, ".ssh");
  try {
    const metadata = lstatSync(sshDirectory);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) throw new Error("Refusing a symlink or non-directory at ~/.ssh.");
    if (typeof process.getuid === "function" && metadata.uid !== process.getuid()) throw new Error("The ~/.ssh directory must belong to the current non-root user.");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    mkdirSync(sshDirectory, { mode: 0o700 });
  }
  chmodSync(sshDirectory, 0o700);

  const privatePath = path.join(sshDirectory, KEY_NAME);
  const publicPath = `${privatePath}.pub`;
  const initialPrivate = inspectRegularFile(privatePath);
  const initialPublic = inspectRegularFile(publicPath);
  let overwriteConfirmed = false;
  if (initialPrivate || initialPublic) {
    if (typeof confirmOverwrite !== "function") {
      throw new Error("Existing CloudDev SSH key files were found. Run `git-setup` interactively and confirm before replacing them.");
    }
    overwriteConfirmed = await confirmOverwrite({ privatePath, publicPath, privateExists: Boolean(initialPrivate), publicExists: Boolean(initialPublic) });
    if (!overwriteConfirmed) {
      stdout.write("Existing key files were left unchanged.\n");
      let publicKey = null;
      if (initialPublic) {
        publicKey = readPublicKey(publicPath);
        showPublicKey(publicKey, stdout);
      } else {
        stderr.write("No public-key file exists, so no key was displayed. Confirm replacement only if you intend to create a new identity.\n");
      }
      return { status: "kept", publicKey, privatePath, publicPath };
    }
  }

  const stagingDirectory = mkdtempSync(path.join(sshDirectory, ".clouddev-git-setup-"));
  chmodSync(stagingDirectory, 0o700);
  const stagedPrivate = path.join(stagingDirectory, KEY_NAME);
  const stagedPublic = `${stagedPrivate}.pub`;
  const backups = [];
  const installed = [];
  let committed = false;
  try {
    let result;
    try {
      result = spawnSyncImpl(sshKeygenPath, ["-q", "-t", "ed25519", "-f", stagedPrivate, "-C", "clouddev-ai", "-N", ""], {
        encoding: "utf8",
        stdio: ["ignore", "ignore", "ignore"],
      });
    } catch {
      throw new Error("Could not start ssh-keygen. Check that the OpenSSH client is installed.");
    }
    if (result?.error || result?.status !== 0) throw new Error("ssh-keygen could not create the dedicated Ed25519 key.");

    inspectRegularFile(stagedPrivate);
    const publicKey = readPublicKey(stagedPublic);
    chmodSync(stagedPrivate, 0o600);
    chmodSync(stagedPublic, 0o644);

    for (const [target, suffix] of [[privatePath, "private"], [publicPath, "public"]]) {
      const metadata = inspectRegularFile(target);
      if (!metadata) continue;
      if (!overwriteConfirmed) throw new Error("A CloudDev SSH key appeared during setup. No existing key was replaced; run `git-setup` again to confirm.");
      const backup = makeBackupPath(sshDirectory, suffix);
      renameSync(target, backup);
      backups.push({ target, backup });
    }

    for (const [staged, target] of [[stagedPrivate, privatePath], [stagedPublic, publicPath]]) {
      // linkSync provides a no-clobber install. A file appearing after the
      // prompt is never silently replaced, even in a concurrent invocation.
      linkSync(staged, target);
      installed.push(target);
      unlinkSync(staged);
    }
    chmodSync(privatePath, 0o600);
    chmodSync(publicPath, 0o644);
    committed = true;
    for (const { backup } of backups) {
      try { unlinkSync(backup); } catch { /* Keep the new key pair if backup cleanup fails. */ }
    }

    showPublicKey(publicKey, stdout);
    return { status: "generated", publicKey, privatePath, publicPath };
  } catch (error) {
    if (!committed) {
      for (const target of installed.reverse()) {
        try { unlinkSync(target); } catch { /* Restore old key files below if there were any. */ }
      }
      for (const { target, backup } of backups.reverse()) {
        try { renameSync(backup, target); } catch { /* Preserve the original error while attempting every restore. */ }
      }
    }
    throw error;
  } finally {
    try { rmSync(stagingDirectory, { recursive: true, force: true }); } catch { /* No key material is written outside ~/.ssh. */ }
  }
}

async function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stderr.write("Run `git-setup` in the interactive IDE terminal.\n");
    return 2;
  }
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  const confirmOverwrite = async ({ privateExists, publicExists }) => {
    const files = [privateExists && "private key", publicExists && "public key"].filter(Boolean).join(" and ");
    const answer = await new Promise(resolve => readline.question(`A CloudDev ${files} already exists. Replace it? [y/N] `, resolve));
    return /^y(?:es)?$/i.test(answer.trim());
  };
  try {
    await setupGitKey({ confirmOverwrite });
    return 0;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 1;
  } finally {
    readline.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => { process.exitCode = code; }).catch(() => {
    process.stderr.write("Git SSH setup failed. Existing key files were not intentionally displayed.\n");
    process.exitCode = 1;
  });
}
