import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ensureCodexGatewayConfig } from "./codex-config.mjs";
import { createCloudCliGatewayRefresher } from "./cloudcli-gateway-refresh.mjs";
import { createTaskRegistry } from "./task-registry.mjs";
import { installCloudCliTaskHook } from "./cloudcli-runtime-hook.mjs";

function requireRuntimePath(name) {
  const value = process.env[name];
  if (typeof value !== "string" || value.length === 0 || !path.isAbsolute(value)) {
    throw new Error(`CloudCLI runtime requires an absolute ${name} path.`);
  }
  return value;
}

const home = requireRuntimePath("HOME");
const cloudcliPackageRoot = requireRuntimePath("CLOUDCLI_PACKAGE_ROOT");
const manifest = JSON.parse(readFileSync(path.join(cloudcliPackageRoot, "package.json"), "utf8"));
if (manifest.version !== "1.37.5") throw new Error("CloudCLI runtime package version does not match the pinned release.");

const baseUrl = process.env.CLOUDDEV_OMNIROUTE_BASE_URL || "http://127.0.0.1:20129";
ensureCodexGatewayConfig({ codexHome: process.env.CODEX_HOME, baseUrl });

const taskRegistry = createTaskRegistry({ home });
const interruptedCount = taskRegistry.markRunningInterrupted();
const registryModulePath = path.join(cloudcliPackageRoot, "dist-server/server/modules/websocket/services/chat-run-registry.service.js");
const registryModule = await import(pathToFileURL(registryModulePath).href);
const providerRegistryPath = path.join(cloudcliPackageRoot, "dist-server/server/modules/providers/provider.registry.js");
const providerRegistryModule = await import(pathToFileURL(providerRegistryPath).href);
const providerModelsPath = path.join(cloudcliPackageRoot, "dist-server/server/modules/providers/services/provider-models.service.js");
const providerModelsModule = await import(pathToFileURL(providerModelsPath).href);
const refreshProviderConfig = createCloudCliGatewayRefresher({ home });
installCloudCliTaskHook(registryModule.chatRunRegistry, taskRegistry, {
  providerRegistry: providerRegistryModule.providerRegistry,
  providerModelsService: providerModelsModule.providerModelsService,
  refreshProviderConfig,
});

process.stderr.write(`CloudCLI task recovery ready; ${interruptedCount} prior run(s) require manual review.\n`);
