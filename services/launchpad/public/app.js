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
const copySsh = document.querySelector("#copy-ssh");
const sshHelp = document.querySelector("#ssh-help");
const gitSshHelp = document.querySelector("#git-ssh-help");
const sshBlockPattern = /^Host clouddev\n  HostName \S+\n  Port \d+\n  User coder\n  IdentityFile ~\/\.ssh\/<operator-provisioned-private-key>\n  IdentitiesOnly yes$/;
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

function editorHref(href) {
  const url = new URL(href);
  if (url.search || url.hash) return null;
  url.searchParams.set("folder", "/workspace/projects");
  return url.href;
}

function setLink(id, value) {
  const links = document.querySelectorAll(`[data-link="${id}"]`);
  const href = safeLink(value);
  const targetHref = href && id === "vscode" ? editorHref(href) : href;
  for (const link of links) {
    if (!targetHref) {
      link.removeAttribute("href");
      link.setAttribute("aria-disabled", "true");
      link.setAttribute("tabindex", "-1");
      delete link.dataset.ready;
      continue;
    }
    link.href = targetHref;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.removeAttribute("aria-disabled");
    link.removeAttribute("tabindex");
    link.dataset.ready = "true";
  }
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
    sshStatus.textContent = "Not needed on a phone or iPad. A computer connection appears here only after it is set up.";
    if (copySsh) copySsh.disabled = true;
    if (sshHelp) sshHelp.hidden = true;
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
  if (copySsh) copySsh.disabled = false;
  if (sshHelp) sshHelp.hidden = false;
  sshStatus.textContent = "The computer connection is ready. Use Copy the computer connection. The private key stays on that computer.";
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
    gitSshStatus.textContent = "You can skip Git. Private file history in the browser stays available. A Git connection appears here only after it is set up.";
    if (gitSshHelp) gitSshHelp.hidden = true;
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
  if (gitSshHelp) gitSshHelp.hidden = false;
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

function setServiceStates(services, allReady) {
  const byId = new Map(services.map(service => [service.id, service.status]));
  for (const card of document.querySelectorAll("[data-service]")) {
    const state = card.querySelector(".card-state");
    const status = byId.get(card.dataset.service);
    if (!state) continue;
    state.dataset.state = status ?? "";
    state.textContent = status ? labels.get(status) ?? "Unknown" : "";
  }
  const heroDot = document.querySelector("#hero-dot");
  if (heroDot) heroDot.className = `status-dot ${allReady ? "ready" : "pending"}`;
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
    setServiceStates(body.services, ready === body.services.length);
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
    gitSshStatus.textContent = "Git status is unavailable. You can still open private file history in the browser.";
    if (gitSshHelp) gitSshHelp.hidden = true;
    gitSshConfig.hidden = true;
    gitSshConfigCode.textContent = "";
    const row = document.createElement("li");
    row.className = "status-row";
    row.textContent = "Could not load service status. Check the launchpad logs.";
    serviceList.replaceChildren(row);
  }
}

const copyCommands = new Map([
  ["git-setup", "git-setup"],
  ["ai-setup", "ai-setup"],
  ["ai-status", "ai-status"],
]);
const openTargets = new Set(["vscode"]);
const copyNotice = document.querySelector("#copy-notice");

function placeNotice(button, element, message) {
  const slot = button.closest(".guide-body") || button.closest(".section");
  if (slot) slot.append(element);
  element.hidden = false;
  element.textContent = message;
}

function openReadyLink(id) {
  if (!openTargets.has(id)) return false;
  const link = document.querySelector(`[data-link="${id}"][data-ready="true"]`);
  if (!link?.href) return false;
  return Boolean(window.open(link.href, "_blank", "noopener,noreferrer"));
}

document.querySelector("#refresh").addEventListener("click", refreshStatus);
document.querySelectorAll("[data-copy]").forEach(button => {
  button.addEventListener("click", async () => {
    const command = copyCommands.get(button.dataset.copy);
    if (!command || !copyNotice) return;
    const wantsOpen = typeof button.dataset.open === "string";
    const opened = wantsOpen && openReadyLink(button.dataset.open);
    let copied = false;
    try {
      await navigator.clipboard.writeText(command);
      copied = true;
    } catch {
      copied = false;
    }
    let message = opened
      ? `Workspace opened. Clipboard is blocked. Open Terminal and type ${command}.`
      : `Clipboard is blocked. Open Terminal in the workspace and type ${command}.`;
    if (copied && wantsOpen && opened) {
      message = "Workspace opened and setup copied. In the workspace, open Terminal and paste. Do not paste an account password.";
    } else if (copied && wantsOpen) {
      message = "Copied. The workspace is not ready yet. When Open the workspace is active, open it and paste in Terminal. Do not paste an account password.";
    } else if (copied) {
      message = "Copied. Open Terminal in the workspace and paste. Do not paste an account password.";
    }
    placeNotice(button, copyNotice, message);
  });
});
if (copySsh) {
  copySsh.addEventListener("click", async () => {
    const text = sshConfigCode.textContent;
    if (sshConfig.hidden || !sshBlockPattern.test(text) || !copyNotice) return;
    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      copied = false;
    }
    placeNotice(copySsh, copyNotice, copied
      ? "Copied. Paste it into the SSH config on your computer."
      : "Clipboard is blocked. Select the connection text and copy it.");
  });
}
document.querySelectorAll("[data-agent]").forEach(button => {
  button.addEventListener("click", async () => {
    const command = button.dataset.agent === "codex" ? "ai-codex" : "ai-claude";
    const vscode = document.querySelector('[data-link="vscode"]');
    if (!vscode?.dataset.ready) {
      placeNotice(button, notice, "The workspace page is not ready yet. Try again when its card shows Ready.");
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
    placeNotice(button, notice, copied
      ? "Opened the workspace. Open Terminal and paste. That starts the assistant."
      : `Opened the workspace. Open Terminal and type ${command}.`);
  });
});

refreshStatus();
