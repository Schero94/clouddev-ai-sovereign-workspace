# Upstream components and licenses

The license on this repository applies only to CloudDev AI's own source files.
The deployment also installs or runs upstream projects with their own terms.
Keep notices and license files for every component included in distributed
images. Verify license and version changes whenever a dependency is updated.

| Component | Pinned release | License / terms | Source |
| --- | --- | --- | --- |
| CloudCLI UI | `@cloudcli-ai/cloudcli` 1.37.5 | AGPL-3.0-or-later | [Repository](https://github.com/siteboon/claudecodeui), [npm package](https://www.npmjs.com/package/@cloudcli-ai/cloudcli) |
| OmniRoute | 3.8.52 | MIT | [Release](https://github.com/cheaper-inference/OmniRoute/tree/v3.8.52), [image](https://hub.docker.com/r/diegosouzapw/omniroute) |
| code-server | 4.143.1 | MIT | [Release](https://github.com/coder/code-server/tree/v4.143.1) |
| Forgejo | 17.0.0 rootless | GPL-3.0-or-later | [Release](https://codeberg.org/forgejo/forgejo/src/tag/v17.0.0) |
| PostgreSQL | Railway managed service | PostgreSQL License | [PostgreSQL licensing](https://www.postgresql.org/about/licence/) |
| Caddy | 2.11.6 Alpine image | Apache-2.0 | [Caddy](https://github.com/caddyserver/caddy/tree/v2.11.6) |
| Node.js | 24.22.0 | MIT and bundled third-party notices | [Node.js](https://github.com/nodejs/node/tree/v24.22.0) |
| Git | Distribution package | GPL-2.0-or-later | [Git](https://github.com/git/git) |
| OpenSSH | Distribution package | BSD-style license and notices | [OpenSSH](https://www.openssh.com/) |
| Python | Distribution package | PSF-2.0 and bundled notices | [Python](https://github.com/python/cpython) |
| OpenAI Codex CLI | 0.164.0 | Apache-2.0 | [Repository](https://github.com/openai/codex) |
| Anthropic Claude Code CLI | 2.1.310 | Anthropic proprietary terms; package includes a terms notice, not an OSI license | [Repository](https://github.com/anthropics/claude-code), [legal terms](https://code.claude.com/docs/en/legal-and-compliance) |
| pnpm | 10.34.8 | MIT | [Repository](https://github.com/pnpm/pnpm) |
| Red Hat YAML | 2.1.2026102308 | MIT | [Open VSX listing](https://open-vsx.org/extension/redhat/vscode-yaml) |
| Error Lens | 3.30.0 | MIT | [Open VSX listing](https://open-vsx.org/extension/usernamehw/errorlens) |
| Even Better TOML | 0.21.2 | MIT | [Open VSX listing](https://open-vsx.org/extension/tamasfe/even-better-toml) |

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
