# Upstream components and licenses

The license on this repository applies only to CloudDev AI's own source files.
The deployment also installs or runs upstream projects with their own terms.
Keep notices and license files for every component included in distributed
images. Verify license and version changes whenever a dependency is updated.

| Component | Pinned release | License / terms | Source |
| --- | --- | --- | --- |
| CloudCLI UI | `@cloudcli-ai/cloudcli` 1.37.9 | AGPL-3.0-or-later | [Repository](https://github.com/siteboon/claudecodeui), [npm package](https://www.npmjs.com/package/@cloudcli-ai/cloudcli) |
| OmniRoute dashboard image | 3.8.54 | MIT | [Release](https://github.com/cheaper-inference/OmniRoute/tree/v3.8.54), [image](https://hub.docker.com/r/diegosouzapw/omniroute) |
| OmniRoute CLI | 3.8.52 | MIT | [Release](https://github.com/cheaper-inference/OmniRoute/tree/v3.8.52) |
| code-server | 4.143.1 | MIT | [Release](https://github.com/coder/code-server/tree/v4.143.1) |
| Forgejo | 17.0.2 rootless | GPL-3.0-or-later | [Release](https://codeberg.org/forgejo/forgejo/src/tag/v17.0.2) |
| PostgreSQL | Railway managed service; local Compose overlay on 18.7-alpine3.24 | PostgreSQL License | [PostgreSQL licensing](https://www.postgresql.org/about/licence/) |
| Caddy | 2.11.7 Alpine image | Apache-2.0 | [Caddy](https://github.com/caddyserver/caddy/tree/v2.11.7) |
| Node.js | 26.13.1 LTS bookworm-slim, pinned by digest | MIT and bundled third-party notices | [Node.js](https://github.com/nodejs/node/tree/v26.13.1) |
| shell-quote | 1.11.0, patched into code-server 4.143.1's bundled VS Code dependency tree | MIT | [npm package](https://www.npmjs.com/package/shell-quote) |
| Git | Distribution package | GPL-2.0-or-later | [Git](https://github.com/git/git) |
| OpenSSH | Distribution package | BSD-style license and notices | [OpenSSH](https://www.openssh.com/) |
| Python | 3.15.2 standalone build installed by uv; Debian's python3 stays for system tools | PSF-2.0 and bundled notices | [Python](https://github.com/python/cpython), [python-build-standalone](https://github.com/astral-sh/python-build-standalone) |
| uv | 0.13.9, release archive checked by SHA-256 | Apache-2.0 or MIT | [Repository](https://github.com/astral-sh/uv) |
| OpenAI Codex CLI | 0.171.0 | Apache-2.0 | [Repository](https://github.com/openai/codex) |
| Anthropic Claude Code CLI | 2.1.330 | Anthropic proprietary terms; package includes a terms notice, not an OSI license | [Repository](https://github.com/anthropics/claude-code), [legal terms](https://code.claude.com/docs/en/legal-and-compliance) |
| pnpm | 12.21.0 | MIT | [Repository](https://github.com/pnpm/pnpm) |
| OpenCode CLI | 1.19.6 | MIT | [Repository](https://github.com/anomalyco/opencode) |
| TaskMaster CLI | 0.43.1, lockfile-pinned with patched `simple-git`, `undici`, and OpenTelemetry | MIT with Commons Clause | [Repository](https://github.com/eyaltoledano/claude-task-master) |
| Playwright and Chromium | Playwright 1.65.1 with its pinned Chromium build | Apache-2.0; Chromium BSD-3-Clause and bundled notices | [Playwright](https://github.com/microsoft/playwright) |
| Red Hat YAML | 2.1.2026112008 | MIT | [Open VSX listing](https://open-vsx.org/extension/redhat/vscode-yaml) |
| Error Lens | 3.30.0 | MIT | [Open VSX listing](https://open-vsx.org/extension/usernamehw/errorlens) |
| Even Better TOML | 0.21.2 | MIT | [Open VSX listing](https://open-vsx.org/extension/tamasfe/even-better-toml) |
| Python | 2026.10.0 | MIT | [Open VSX listing](https://open-vsx.org/extension/ms-python/python) |
| Python Debugger | 2026.6.0 | MIT | [Open VSX listing](https://open-vsx.org/extension/ms-python/debugpy) |
| ESLint | 3.0.34 | MIT | [Open VSX listing](https://open-vsx.org/extension/dbaeumer/vscode-eslint) |
| Prettier | 12.4.0 | MIT | [Open VSX listing](https://open-vsx.org/extension/esbenp/prettier-vscode) |
| Tailwind CSS IntelliSense | 0.16.0 | MIT | [Open VSX listing](https://open-vsx.org/extension/bradlc/vscode-tailwindcss) |
| Markdown All in One | 3.6.2 | MIT | [Open VSX listing](https://open-vsx.org/extension/yzhang/markdown-all-in-one) |
| age CLI | 1.3.2 on the maintainer test host; optional operator tool for local encrypted backups, not included in runtime images | BSD-3-Clause | [Source](https://github.com/FiloSottile/age) |

## Distribution notes

- CloudCLI remains a separate upstream AGPL program installed in the workspace
  image. This repository does not claim authorship of CloudCLI or replace its
  license and notices. Operators distributing a modified CloudCLI service must
  review and meet the applicable AGPL source-offer requirements.
- Anthropic's Claude Code package is not licensed under this repository's MIT
  license. Its use requires compliance with Anthropic's current legal
  agreements, product access rules, and account eligibility.
- Provider APIs and user subscriptions are not included. Users must follow the
  applicable provider contracts. Account rotation is not provided as a way to
  bypass usage limits.
- The container images retain upstream `/LICENSE`, notice, or package license
  files where upstream images provide them. A release process should generate a
  Software Bill of Materials and inspect the final images before publication.
