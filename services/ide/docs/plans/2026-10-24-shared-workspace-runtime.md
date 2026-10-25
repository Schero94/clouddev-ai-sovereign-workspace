# Shared workspace runtime implementation plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Run CloudCLI, authenticated browser code-server, key-only Remote-SSH, and persistent agent tasks in one secured IDE service.

**Architecture:** One `/workspace` volume stores the user's home and projects. Caddy authenticates all browser paths. A root bootstrap injects root-owned operator keys and starts services with clean per-UID environments. A pinned CloudCLI hook reloads the private gateway configuration before every provider runtime call. Launchpad sees only an atomic recovery-count file.

**Tech Stack:** Node.js 24, code-server 4.143.1, Caddy 2.11.6, CloudCLI 1.37.5, OpenSSH, tmux, Docker, Node test runner.

---

## Contract

- Change only `services/ide/**`.
- Keep the Docker build context at the repository root so it can package the parent-owned launchpad source.
- Keep the browser entry gate as a signed workspace cookie verified by the loopback launchpad. Do not use Basic Auth because it conflicts with CloudCLI's Bearer API. code-server has `auth: none` on loopback only.
- Keep OmniRoute's dashboard on private port 20128 and bind its auxiliary API bridge on 20131 to router loopback. Caddy's loopback-only port 20129 maps the CLI health route to the documented dashboard health path and rewrites `/v1/*` calls to OmniRoute's `/omniroute/api/v1/*` dashboard API. Local probes of the pinned release confirmed the required model, chat, and Anthropic Messages routes there.
- Use `SSH_AUTHORIZED_KEYS` for root-owned OpenSSH login keys outside `/workspace`.
- Pass only the public SSH host fingerprint and `LAUNCHPAD_RECOVERY_SUMMARY` to launchpad.
- Keep `/workspace/home/.local/state/clouddev/tasks.json` at 0600 and the counts-only `/workspace/public-status/recovery.json` at 0644.
- Do not pass Railway, Forgejo admin, or OmniRoute master secrets to agent processes.

## Implemented components

1. The Dockerfile pins base images and npm CLIs, installs the runtime tools, creates Caddy and launchpad UIDs, changes the coder passwd home to `/workspace/home`, and publishes only ports 8080 and 2222.
2. The root entrypoint creates the persistent host key, derives its fingerprint, injects operator keys under `/run`, writes the private Caddy config, validates it, and starts the sanitized supervisor.
3. Caddy calls the launchpad's private forward-auth route before CloudCLI, code-server, or launchpad requests. The supervisor starts services under their assigned UIDs.
4. The task registry stores authoritative task records privately and atomically writes a counts-only launchpad summary. CloudCLI and terminal wrappers register lifecycle transitions.
5. The pinned CloudCLI provider runtime hook reloads the current mode-0600 gateway config before each Claude or Codex run, so post-startup `ai-setup` changes take effect without a workspace restart.
6. The tests cover the Caddy proxy, credentials, SSH path and forwarding policy, public summary permissions and contents, service-environment separation, local/production launchpad modes, and the pinned CloudCLI runtime refresh.

## Verification to finish

Run from the repository root or the IDE directory as noted:

```sh
npm --prefix services/ide test
npm --prefix services/ide run check
docker build -f services/ide/Dockerfile -t clouddev-ide:local .
```

Then run container checks for Caddy auth, direct code-server port exposure, root-owned SSH authorization, user home, fingerprint, and SSH forwarding. A local mock endpoint is not a paid provider request. A desktop Remote-SSH client, Railway plan/deploy, and live cross-device workflow require separate evidence.
