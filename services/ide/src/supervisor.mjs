import { spawn } from "node:child_process";
import { serviceCommand } from "./run-service.mjs";
import { buildServiceEnvironment } from "./service-environment.mjs";

const source = process.env;
const services = [
  {
    profile: "sshd",
    command: "/usr/sbin/sshd",
    args: ["-D", "-e", "-f", "/etc/ssh/sshd_config"],
    env: { PATH: "/usr/sbin:/usr/bin:/sbin:/bin" },
  },
  {
    profile: "cloudcli",
    command: "/usr/local/bin/node",
    args: ["--import", "/opt/clouddev-ide/src/cloudcli-bootstrap.mjs", "/opt/clouddev-ide/cloudcli-ui/node_modules/@cloudcli-ai/cloudcli/dist-server/server/index.js"],
  },
  {
    profile: "code-server",
    command: "/usr/bin/code-server",
    args: [
      "--config", "/workspace/home/.config/code-server/config.yaml",
      "--user-data-dir", "/workspace/home/.local/share/code-server",
      "--extensions-dir", "/workspace/home/.local/share/code-server/extensions",
      "--bind-addr", "127.0.0.1:8081",
      "--auth", "none",
      "--disable-telemetry",
      "--disable-update-check",
      "/workspace/projects",
    ],
  },
  {
    profile: "launchpad",
    command: "/usr/local/bin/node",
    args: ["/opt/clouddev-launchpad/src/server.mjs"],
  },
  {
    profile: "caddy",
    command: "/usr/bin/caddy",
    args: ["run", "--config", "/run/clouddev-caddy/Caddyfile", "--adapter", "caddyfile"],
  },
];

function signalChild(child, signal) {
  if (!child.pid) return;
  try { process.kill(-child.pid, signal); }
  catch (error) {
    if (error?.code === "ESRCH") return;
    try { child.kill(signal); } catch { /* The child may already have exited. */ }
  }
}

function run() {
  const active = new Set();
  let stopping = false;
  let finalCode = 0;
  let killTimer;

  const finish = () => {
    if (active.size !== 0) return;
    clearTimeout(killTimer);
    process.exitCode = finalCode;
  };

  const stop = (code, signal = "SIGTERM") => {
    if (stopping) return;
    stopping = true;
    finalCode = code;
    for (const child of active) signalChild(child, signal);
    killTimer = setTimeout(() => {
      for (const child of active) signalChild(child, "SIGKILL");
    }, 5000);
    killTimer.unref();
    finish();
  };

  process.once("SIGTERM", () => stop(0));
  process.once("SIGINT", () => stop(0));

  for (const service of services) {
    const env = service.env ?? buildServiceEnvironment(service.profile, {
      source,
      home: "/workspace/home",
      projectsDirectory: "/workspace/projects",
      caddyHome: "/workspace/system/caddy",
      launchpadHome: "/workspace/system/launchpad",
    });
    const invocation = serviceCommand(service.profile, service.command, service.args);
    let child;
    try {
      child = spawn(invocation.command, invocation.args, {
        cwd: service.profile === "launchpad" ? "/opt/clouddev-launchpad" : "/workspace/projects",
        env,
        stdio: "inherit",
        detached: true,
      });
    } catch {
      stop(1, "SIGTERM");
      break;
    }
    active.add(child);
    child.once("error", () => stop(1, "SIGTERM"));
    child.once("exit", code => {
      active.delete(child);
      if (!stopping) stop(Number.isInteger(code) && code !== 0 ? code : 1, "SIGTERM");
      finish();
    });
  }
}

run();
