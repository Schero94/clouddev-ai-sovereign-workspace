const serviceList = document.querySelector("#service-status");
const summary = document.querySelector("#health-summary");
const workspaceHealth = document.querySelector("#workspace-health");
const recoveryState = document.querySelector("#recovery-state");
const recoverySummary = document.querySelector("#recovery-summary");
const notice = document.querySelector("#agent-notice");
const sshStatus = document.querySelector("#ssh-status");
const sshConfig = document.querySelector("#ssh-config");
const sshConfigCode = sshConfig.querySelector("code");
const sshFingerprint = document.querySelector("#ssh-fingerprint");
const gitSshStatus = document.querySelector("#git-ssh-status");
const gitSshConfig = document.querySelector("#git-ssh-config");
const gitSshConfigCode = gitSshConfig.querySelector("code");
const labels = new Map([["ready", "Ready"], ["unavailable", "Unavailable"], ["not-configured", "Not configured"]]);

function isLoopbackHostname(hostname) {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized.endsWith(".localhost");
}

function safeLink(value) {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value, window.location.href);
    const page = new URL(window.location.href);
    const sameOrigin = url.origin === page.origin;
    const localDevelopmentHttp = page.protocol === "http:" && isLoopbackHostname(page.hostname)
      && url.protocol === "http:" && isLoopbackHostname(url.hostname);
    if ((!sameOrigin && url.protocol !== "https:" && !localDevelopmentHttp)
      || url.username || url.password || url.search || url.hash) return null;
    return url.href;
  } catch {
    return null;
  }
}

function setLink(id, value) {
  const link = document.querySelector(`[data-link="${id}"]`);
  if (!link) return;
  const href = safeLink(value);
  if (!href) {
    link.removeAttribute("href");
    link.setAttribute("aria-disabled", "true");
    link.setAttribute("tabindex", "-1");
    delete link.dataset.ready;
    return;
  }
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.removeAttribute("aria-disabled");
  link.removeAttribute("tabindex");
  link.dataset.ready = "true";
}

function isValidSshProxy(ssh) {
  const hostnamePattern = /^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)(?:\.(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?))*$/;
  return Boolean(ssh && typeof ssh.host === "string" && hostnamePattern.test(ssh.host)
    && Number.isInteger(ssh.port) && ssh.port >= 1 && ssh.port <= 65535);
}

function setSshConfig(ssh, fingerprint) {
  if (!isValidSshProxy(ssh)) {
    sshConfig.hidden = true;
    sshConfigCode.textContent = "";
    sshFingerprint.hidden = true;
    sshFingerprint.textContent = "";
    sshStatus.textContent = "SSH proxy details are not configured. The operator can map the IDE TCP proxy domain and port to IDE_SSH_PROXY_HOST and IDE_SSH_PROXY_PORT.";
    return;
  }
  sshConfigCode.textContent = [
    "Host clouddev",
    `  HostName ${ssh.host}`,
    `  Port ${ssh.port}`,
    "  User coder",
    "  IdentityFile ~/.ssh/<operator-provisioned-private-key>",
    "  IdentitiesOnly yes",
  ].join("\n");
  sshConfig.hidden = false;
  sshStatus.textContent = "SSH proxy is configured. Use the private key file provisioned by the operator.";
  if (typeof fingerprint === "string" && /^SHA256:[A-Za-z0-9+/]{43}$/.test(fingerprint)) {
    sshFingerprint.textContent = `Workspace SSH host-key fingerprint: ${fingerprint}. Compare it with the first-connection prompt before accepting.`;
    sshFingerprint.hidden = false;
  } else {
    sshFingerprint.textContent = "Workspace SSH host-key fingerprint is unavailable. Verify the fingerprint with the operator before accepting a new SSH host key.";
    sshFingerprint.hidden = false;
  }
}

function setGitSshConfig(ssh) {
  if (!isValidSshProxy(ssh)) {
    gitSshConfig.hidden = true;
    gitSshConfigCode.textContent = "";
    gitSshStatus.textContent = "Git SSH proxy details are not configured. Forgejo browser access and sign-in remain on HTTPS.";
    return;
  }
  gitSshConfigCode.textContent = [
    "Host forgejo",
    `  HostName ${ssh.host}`,
    `  Port ${ssh.port}`,
    "  User git",
    "  IdentityFile ~/.ssh/id_ed25519_clouddev",
    "  IdentitiesOnly yes",
  ].join("\n");
  gitSshConfig.hidden = false;
  gitSshStatus.textContent = "Git SSH is configured for workspace Git commands. Forgejo browser access and sign-in remain on HTTPS.";
}

function setStatusRow(service) {
  const row = document.createElement("li");
  row.className = "status-row";
  const dot = document.createElement("span");
  dot.className = `status-dot ${service.status}`;
  dot.setAttribute("aria-hidden", "true");
  const name = document.createElement("span");
  name.textContent = service.label;
  const state = document.createElement("span");
  state.className = "status-state";
  state.textContent = labels.get(service.status) ?? "Unknown";
  row.append(dot, name, state);
  return row;
}

async function refreshStatus() {
  summary.textContent = "Checking services…";
  try {
    const response = await fetch("api/status", { headers: { accept: "application/json" }, cache: "no-store" });
    if (!response.ok) throw new Error("status unavailable");
    const body = await response.json();
    if (!Array.isArray(body.services)) throw new Error("status unavailable");
    const rows = document.createDocumentFragment();
    let ready = 0;
    for (const service of body.services) {
      rows.append(setStatusRow(service));
      if (service.status === "ready") ready += 1;
    }
    serviceList.replaceChildren(rows);
    summary.textContent = `${ready} of ${body.services.length} services ready`;
    const workspaceLabel = labels.get(body.workspace?.health) ?? "Unknown";
    workspaceHealth.textContent = `Workspace: ${workspaceLabel}`;
    recoveryState.textContent = body.workspace?.recovery === "manual"
      ? "Recovery is manual. Check CloudCLI for interrupted work and resume only through an action supported by the provider."
      : "Recovery guidance is unavailable. Check CloudCLI after a restart.";
    const summaryData = body.workspace?.recoverySummary;
    if (summaryData?.status === "available" && Number.isSafeInteger(summaryData.counts?.running)
      && Number.isSafeInteger(summaryData.counts?.interrupted)) {
      recoverySummary.textContent = `Recovery summary: ${summaryData.counts.interrupted} interrupted, ${summaryData.counts.running} listed as running. These counts do not show whether a process is live.`;
    } else if (summaryData?.status === "not-configured") {
      recoverySummary.textContent = "Recovery summary is not configured. Recovery remains manual.";
    } else {
      recoverySummary.textContent = "Recovery summary is unavailable. Recovery remains manual.";
    }
    recoverySummary.hidden = false;
    for (const id of ["cloudcli", "vscode", "git", "router"]) setLink(id, body.links?.[id]);
    setSshConfig(body.links?.ssh, body.links?.sshHostFingerprint);
    setGitSshConfig(body.links?.gitSsh);
  } catch {
    summary.textContent = "Health check unavailable";
    workspaceHealth.textContent = "Workspace: status unavailable";
    recoveryState.textContent = "Recovery is manual. Check CloudCLI for interrupted work and resume only through an action supported by the provider.";
    recoverySummary.textContent = "Recovery summary is unavailable. Recovery remains manual.";
    recoverySummary.hidden = false;
    gitSshStatus.textContent = "Git SSH proxy status is unavailable. Forgejo browser access and sign-in remain on HTTPS.";
    gitSshConfig.hidden = true;
    gitSshConfigCode.textContent = "";
    const row = document.createElement("li");
    row.className = "status-row";
    row.textContent = "Could not load service status. Check the launchpad logs.";
    serviceList.replaceChildren(row);
  }
}

document.querySelector("#refresh").addEventListener("click", refreshStatus);
document.querySelectorAll("[data-agent]").forEach(button => {
  button.addEventListener("click", async () => {
    const command = button.dataset.agent === "codex" ? "ai-codex" : "ai-claude";
    const vscode = document.querySelector('[data-link="vscode"]');
    if (!vscode?.dataset.ready) {
      notice.hidden = false;
      notice.textContent = "The Browser VS Code link is not configured. Check the launchpad service domains.";
      return;
    }
    window.open(vscode.href, "_blank", "noopener,noreferrer");
    let copied = false;
    try {
      await navigator.clipboard.writeText(command);
      copied = true;
    } catch {
      copied = false;
    }
    notice.hidden = false;
    notice.textContent = copied
      ? `Opened Browser VS Code. In its terminal, paste ${command} to start the agent.`
      : `Open a terminal in Browser VS Code and run ${command} to start the agent.`;
  });
});

refreshStatus();
