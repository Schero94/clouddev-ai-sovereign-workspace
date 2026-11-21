import { chmodSync, closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";

function gatewayApiUrl(baseUrl) {
  const url = new URL(baseUrl);
  url.pathname = "/v1";
  return url.toString().replace(/\/$/, "");
}

function writePrivateFile(file, content) {
  try {
    if (lstatSync(file).isSymbolicLink()) throw new Error(`${file} refuses a symlink.`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const temporaryPath = `${file}.${randomUUID()}.tmp`;
  let descriptor;
  try {
    descriptor = openSync(temporaryPath, "wx", 0o600);
    writeSync(descriptor, content, null, "utf8");
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporaryPath, file);
    chmodSync(file, 0o600);
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    try { unlinkSync(temporaryPath); } catch { /* The temp file may already be renamed. */ }
    throw error;
  }
}

function readExistingConfig(configPath) {
  let text;
  try {
    text = readFileSync(configPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw error;
  }
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch { /* Reported below. */ }
  throw new Error("The OpenCode config is not plain JSON. CloudDev leaves it unchanged.");
}

export function ensureOpenCodeGatewayConfig({ home, baseUrl, apiKey, model }) {
  if (typeof apiKey !== "string" || apiKey.length < 16) throw new Error("OpenCode needs the workspace inference key.");
  const keyDirectory = path.join(home, ".config", "clouddev-ai");
  const configDirectory = path.join(home, ".config", "opencode");
  mkdirSync(keyDirectory, { recursive: true, mode: 0o700 });
  mkdirSync(configDirectory, { recursive: true, mode: 0o700 });
  const keyPath = path.join(keyDirectory, "opencode-key");
  const configPath = path.join(configDirectory, "opencode.json");

  const config = readExistingConfig(configPath);
  const provider = config.provider && typeof config.provider === "object" ? config.provider : {};
  provider.omniroute = {
    npm: "@ai-sdk/openai-compatible",
    name: "OmniRoute",
    options: { baseURL: gatewayApiUrl(baseUrl), apiKey: `{file:${keyPath}}` },
    models: model ? { [model]: { name: model } } : {},
  };
  config.provider = provider;
  if (model && typeof config.model !== "string") config.model = `omniroute/${model}`;
  if (!config.$schema) config.$schema = "https://opencode.ai/config.json";

  writePrivateFile(keyPath, apiKey);
  writePrivateFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return configPath;
}
