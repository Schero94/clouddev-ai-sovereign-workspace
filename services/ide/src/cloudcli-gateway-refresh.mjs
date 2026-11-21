import { statSync } from "node:fs";
import path from "node:path";
import { loadGatewayConfig } from "./ai-cli.mjs";
import { ensureCodexGatewayConfig } from "./codex-config.mjs";

const SCOPED_INFERENCE_ENVIRONMENT = ["OMNIROUTE_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL"];

export function createCloudCliGatewayRefresher({
  home = process.env.HOME,
  env = process.env,
  loadConfig = loadGatewayConfig,
  writeCodexConfig = ensureCodexGatewayConfig,
} = {}) {
  if (typeof home !== "string" || home.length === 0) {
    throw new Error("CloudCLI gateway refresh requires the persistent user home directory.");
  }

  return function refreshCloudCliGateway() {
    for (const name of SCOPED_INFERENCE_ENVIRONMENT) delete env[name];
    const gatewayConfig = loadConfig(home);
    const codexHome = env.CODEX_HOME || path.join(home, ".codex");
    writeCodexConfig({ codexHome, baseUrl: gatewayConfig.baseUrl });
    env.OMNIROUTE_API_KEY = gatewayConfig.apiKey;
    env.ANTHROPIC_AUTH_TOKEN = gatewayConfig.apiKey;
    env.ANTHROPIC_BASE_URL = gatewayConfig.baseUrl;
    return { baseUrl: gatewayConfig.baseUrl, models: { ...gatewayConfig.models } };
  };
}

// CloudCLI starts before the router hands over the workspace key. Its
// provider status page reads process.env, so apply the key when it arrives.
export function watchCloudCliGateway({
  configPath,
  refresh,
  intervalMs = 5000,
  stat = statSync,
  schedule = callback => setInterval(callback, intervalMs),
  cancel = clearInterval,
}) {
  let applied = null;
  const check = () => {
    let signature;
    try {
      const info = stat(configPath);
      signature = `${info.mtimeMs}:${info.size}`;
    } catch {
      return;
    }
    if (signature === applied) return;
    try {
      refresh();
      applied = signature;
    } catch {
      // The handoff may still be writing models; retry on the next tick.
    }
  };
  check();
  const timer = schedule(check);
  timer?.unref?.();
  return () => cancel(timer);
}
