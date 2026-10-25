const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function parseEnvText(text) {
  if (typeof text !== "string") throw new TypeError("Local environment contents must be text.");
  const values = Object.create(null);
  for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
    if (rawLine.trim() === "" || rawLine.trimStart().startsWith("#")) continue;
    const separator = rawLine.indexOf("=");
    if (separator < 1) throw new Error(`Invalid local environment line ${index + 1}.`);
    const name = rawLine.slice(0, separator);
    if (!ENV_NAME.test(name)) throw new Error(`Invalid local environment variable name on line ${index + 1}.`);
    if (Object.hasOwn(values, name)) throw new Error(`Duplicate local environment variable ${name}.`);
    values[name] = rawLine.slice(separator + 1);
  }
  return values;
}

export function quotePosix(value) {
  if (typeof value !== "string" || /[\0\r\n]/.test(value)) {
    throw new TypeError("A POSIX shell argument must be a single line of text.");
  }
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function localSshEndpoint(env) {
  const host = env.IDE_SSH_PROXY_HOST || "localhost";
  const rawPort = env.IDE_SSH_PROXY_PORT || "2222";
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error("Local SSH host must be loopback-only.");
  }
  if (typeof rawPort !== "string" || !/^[1-9][0-9]{0,4}$/.test(rawPort)) {
    throw new Error("Local SSH port must be an integer from 1 through 65535.");
  }
  const port = Number(rawPort);
  if (port > 65535) throw new Error("Local SSH port must be an integer from 1 through 65535.");
  return { host, port };
}
