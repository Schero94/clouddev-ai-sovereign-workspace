import { spawn } from "node:child_process";
import { buildServiceEnvironment } from "./service-environment.mjs";

const IDENTITIES = Object.freeze({
  "code-server": { uid: 1000, gid: 1000 },
  cloudcli: { uid: 1000, gid: 1000 },
  caddy: { uid: 1001, gid: 1001 },
  launchpad: { uid: 1002, gid: 1002 },
});

export function serviceCommand(profile, command, args = []) {
  if (typeof command !== "string" || command.length === 0) throw new Error("A service executable is required.");
  if (profile === "sshd") return { command, args: [...args] };
  const identity = IDENTITIES[profile];
  if (!identity) throw new Error(`Unknown service identity: ${profile}`);
  return {
    command: "/usr/bin/setpriv",
    args: [
      `--reuid=${identity.uid}`,
      `--regid=${identity.gid}`,
      "--clear-groups",
      "--no-new-privs",
      "--bounding-set=-all",
      "--inh-caps=-all",
      "--ambient-caps=-all",
      "--",
      command,
      ...args,
    ],
  };
}

export function runService(profile, command, args = [], {
  source = process.env,
  spawnImpl = spawn,
  onExit = code => { process.exitCode = code ?? 1; },
} = {}) {
  if (profile === "sshd" && process.getuid?.() !== 0) {
    throw new Error("OpenSSH server must start from the root supervisor.");
  }
  const environment = buildServiceEnvironment(profile, {
    source,
    home: "/workspace/home",
    projectsDirectory: "/workspace/projects",
    caddyHome: "/workspace/system/caddy",
    launchpadHome: "/workspace/system/launchpad",
  });
  const invocation = serviceCommand(profile, command, args);
  const child = spawnImpl(invocation.command, invocation.args, {
    cwd: profile === "launchpad" ? "/opt/clouddev-launchpad" : "/workspace/projects",
    env: environment,
    stdio: "inherit",
  });
  if (!child || typeof child.once !== "function") throw new Error(`Could not start ${profile}.`);

  let terminating = false;
  const relay = signal => {
    if (terminating || child.exitCode !== null) return;
    terminating = true;
    child.kill(signal);
  };
  process.on("SIGTERM", relay);
  process.on("SIGINT", relay);
  child.once("error", () => onExit(1));
  child.once("exit", (code, signal) => {
    process.off("SIGTERM", relay);
    process.off("SIGINT", relay);
    onExit(signal === "SIGTERM" ? 143 : signal === "SIGINT" ? 130 : code);
  });
  return child;
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const [profile, ...commandArgs] = process.argv.slice(2);
  const separator = commandArgs[0] === "--" ? 1 : 0;
  const command = commandArgs[separator];
  const args = commandArgs.slice(separator + 1);
  try {
    runService(profile, command, args);
  } catch {
    process.stderr.write("CloudDev could not start a required service with its restricted identity.\n");
    process.exitCode = 1;
  }
}
