import { cpSync, lstatSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const extensionName = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,180}$/;

function assertRealDirectory(directory, label) {
  const metadata = lstatSync(directory);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error(`${label} must be a real directory.`);
  }
}

export function installEditorSeed({
  seedDirectory = process.env.CLOUDDEV_EXTENSION_SEED,
  extensionsDirectory = process.env.CLOUDDEV_EXTENSIONS_DIR,
} = {}) {
  if (!seedDirectory || !extensionsDirectory) throw new Error("Editor extension directories are required.");
  const seed = path.resolve(seedDirectory);
  const destinationRoot = path.resolve(extensionsDirectory);
  assertRealDirectory(seed, "Editor extension seed");
  try {
    mkdirSync(destinationRoot);
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
  assertRealDirectory(destinationRoot, "Editor extensions directory");

  const installed = [];
  for (const name of readdirSync(seed)) {
    const source = path.join(seed, name);
    const sourceMetadata = lstatSync(source);
    if (sourceMetadata.isSymbolicLink()) throw new Error("Editor extension seed entries must be real directories.");
    if (!sourceMetadata.isDirectory()) continue;
    if (!extensionName.test(name)) throw new Error("Editor extension seed contains an unsafe name.");
    const destination = path.join(destinationRoot, name);
    let existing = null;
    try {
      existing = lstatSync(destination);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    if (existing?.isSymbolicLink()) throw new Error("Refusing to replace an extension symlink.");
    if (existing?.isDirectory()) continue;
    if (existing) throw new Error("Refusing to replace an unexpected extension path.");
    cpSync(source, destination, { recursive: true, dereference: false });
    installed.push(name);
  }
  return installed;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    installEditorSeed();
  } catch {
    process.stderr.write("CloudDev could not install the prepared editor extensions.\n");
    process.exitCode = 1;
  }
}
