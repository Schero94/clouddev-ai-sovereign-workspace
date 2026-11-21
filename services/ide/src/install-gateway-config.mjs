import path from "node:path";
import { fileURLToPath } from "node:url";
import { configureGateway, DEFAULT_BASE_URL, loadGatewayConfig, saveGatewayConfig } from "./ai-cli.mjs";

const secret = process.env.CLOUDDEV_GATEWAY_BOOTSTRAP_SECRET ?? "";
const host = process.env.CLOUDDEV_OMNIROUTE_HOST ?? "";
const port = process.env.CLOUDDEV_GATEWAY_BOOTSTRAP_PORT || "20130";
const home = process.env.HOME ?? "";
const baseUrl = process.env.CLOUDDEV_OMNIROUTE_BASE_URL || DEFAULT_BASE_URL;

function privateEndpoint() {
  if (secret.length < 32 || !home) return "";
  if (!/^[A-Za-z0-9.-]+$/.test(host)) return "";
  if (!/^[1-9][0-9]{1,4}$/.test(port) || Number(port) > 65535) return "";
  return `http://${host}:${port}/v1/workspace-gateway`;
}

export async function fetchProvisionedKey(endpoint, token, fetchImpl = fetch) {
  const response = await fetchImpl(endpoint, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Workspace gateway handoff failed with HTTP ${response.status}.`);
  const payload = await response.json();
  if (typeof payload?.apiKey !== "string" || payload.apiKey.length < 16 || /[\r\n\0]/.test(payload.apiKey)) {
    throw new Error("Workspace gateway handoff did not include an inference key.");
  }
  return payload.apiKey;
}

export async function storeProvisionedKey({ home, baseUrl, apiKey }) {
  let models = { codex: "", claude: "" };
  try {
    models = { ...models, ...loadGatewayConfig(home).models };
  } catch { /* The first handoff creates the private file. */ }
  return saveGatewayConfig(home, { baseUrl, apiKey, models });
}

async function main() {
  const endpoint = privateEndpoint();
  if (!endpoint) return;
  for (;;) {
    try {
      const apiKey = await fetchProvisionedKey(endpoint, secret);
      await storeProvisionedKey({ home, baseUrl, apiKey });
      const code = await configureGateway({ home, attempts: 1, stdout: { write() {} }, stderr: { write() {} } });
      if (code === 0) {
        const saved = loadGatewayConfig(home);
        if (saved.models.codex && saved.models.claude) return;
      }
    } catch { /* OmniRoute or its private handoff is still starting. */ }
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
