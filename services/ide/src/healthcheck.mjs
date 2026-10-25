import { connect } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

function checkPort(port, timeoutMs = 1500) {
  return new Promise(resolve => {
    const socket = connect({ host: "127.0.0.1", port });
    const timer = setTimeout(() => socket.destroy(new Error("timeout")), timeoutMs);
    const finish = success => {
      clearTimeout(timer);
      socket.destroy();
      resolve(success);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

async function checkHttp(url, expectedStatus, timeoutMs = 2000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { redirect: "manual", signal: controller.signal });
    return response.status === expectedStatus;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function isWorkspaceHealthy({ httpProbe = checkHttp, portProbe = checkPort } = {}) {
  const checks = [
    httpProbe("http://127.0.0.1:8080/healthz", 200),
    // Caddy must redirect an anonymous browser away from this protected route.
    httpProbe("http://127.0.0.1:8080/vscode/", 302),
    httpProbe("http://127.0.0.1:3002/healthz", 200),
    httpProbe("http://127.0.0.1:20129/api/monitoring/health", 200),
    portProbe(3001),
    portProbe(8081),
    portProbe(2222),
  ];
  return (await Promise.all(checks)).every(Boolean);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!await isWorkspaceHealthy()) process.exitCode = 1;
}
