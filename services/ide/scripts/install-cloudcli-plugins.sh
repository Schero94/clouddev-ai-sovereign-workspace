#!/bin/sh
set -eu

home="${CLOUDDEV_HOME:-/workspace/home}"
plugins="${home}/.claude-code-ui/plugins"
install -d -m 0700 "${home}/.claude-code-ui" "$plugins" "${home}/.local"

# Linux plugins from the CloudCLI 1.37.9 catalog. ccx stays out because it is macOS-only.
urls="
https://github.com/cloudcli-ai/cloudcli-plugin-starter.git
https://github.com/cloudcli-ai/cloudcli-plugin-terminal.git
https://github.com/grostim/cloudcli-cron.git
https://github.com/jakeefr/cloudcli-plugin-prism.git
https://github.com/strykereye2/cloudcli-plugin-session-manager.git
https://github.com/NightmareAway/cloudcli-plugin-token-cost-calculator.git
https://github.com/TadMSTR/cloudcli-plugin-task-queue.git
https://github.com/szmidtpiotr/claude-github-issue.git
https://github.com/HandyS11/cloudcli-plugin-claude-usage.git
https://github.com/dongwook-chan/cloudcli-plugin-codex-usage.git
https://github.com/realjustinwu/CloudCLI-GLM-Usage.git
https://github.com/notetook/cloudcli-plugin-agent-monitor.git
"

for url in $urls; do
  name="${url##*/}"
  name="${name%.git}"
  dest="${plugins}/${name}"
  if [ -f "${dest}/manifest.json" ]; then
    continue
  fi
  rm -rf "$dest"
  if ! git clone --depth 1 "$url" "$dest"; then
    printf '%s\n' "CloudDev could not install the CloudCLI plugin ${name}." >&2
    rm -rf "$dest"
    continue
  fi
  if [ -f "${dest}/package.json" ]; then
    npm install --ignore-scripts --no-audit --no-fund --prefix "$dest" || true
    if node -e 'const pkg=require(process.argv[1]); process.exit(pkg.scripts&&pkg.scripts.build?0:1)' "${dest}/package.json"; then
      npm run --prefix "$dest" build || true
    fi
  fi
done

if [ -n "${IDE_UID:-}" ] && [ -n "${IDE_GID:-}" ]; then
  chown -R "${IDE_UID}:${IDE_GID}" "${home}/.claude-code-ui" "${home}/.local"
fi
