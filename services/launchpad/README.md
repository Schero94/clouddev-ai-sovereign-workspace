# Launchpad integration

The launchpad serves `/launchpad/` and the workspace sign-in flow on loopback port `3002`. Caddy's forward-auth subrequest checks the HttpOnly session cookie at `/auth/verify` before it forwards requests to CloudCLI, code-server, or the launchpad UI. The login page at `/auth/login` is the only public exception, along with the generic workspace health endpoint. The launchpad has no separate public domain.

The trusted launchpad process runs as UID 1002 and receives `CLOUDDEV_WORKSPACE_PASSWORD` plus `CLOUDDEV_WORKSPACE_AUTH_SECRET`. It checks same-origin login posts and signs an eight-hour HttpOnly cookie. Cookies are `SameSite=Strict` and carry `Secure` in production. The launchpad limits failed password attempts in memory. Restarting it clears the rate-limit counter; the operator should use a long random password and rotate it after suspected exposure. `CLOUDDEV_WORKSPACE_AUTH_SECRET` is a signing key and the source for Caddy's derived auth-check key. Rotate it to invalidate existing workspace cookies. Neither value is given to UID 1000 agents.

CloudCLI retains its own one-user account and Bearer API token. The workspace cookie is a gateway access check and does not replace CloudCLI's account setup. Forgejo and OmniRoute retain separate native sign-ins.

Set `LAUNCHPAD_BASE_PATH` to change the mount path and `LAUNCHPAD_PORT` to change the internal port. The server accepts both prefix-preserving and prefix-stripping proxy routes.

## Forgejo Git over SSH

Map Forgejo's TCP proxy domain and port to `GIT_SSH_PROXY_HOST` and `GIT_SSH_PROXY_PORT` on the shared workspace service. Do not use the workspace `RAILWAY_TCP_PROXY_*` values for Git SSH. The launchpad shows a `forgejo` SSH host alias that uses `~/.ssh/id_ed25519_clouddev`, the Ed25519 key created by `git-setup`. The status API returns only the configured host and port. It never returns private key contents. Forgejo HTTPS access and its native sign-in remain available.

## Recovery summary

The private task registry remains at `/workspace/home/.local/state/clouddev/tasks.json`. The launchpad does not read it, including when `LAUNCHPAD_TASK_REGISTRY` is set. The IDE writes aggregate recovery data to `/workspace/public-status/recovery.json` with mode `0644`. Set `LAUNCHPAD_RECOVERY_SUMMARY` to that summary-file path.

The summary file must be a regular, non-symlinked file no larger than 1 MiB, with no group or world write bits. Its JSON must contain `version: 1` and non-negative integer counts for `total`, `running`, `interrupted`, `completed`, `failed`, and `other`. The status API returns only those six counts and a summary status. It does not return task IDs, session IDs, prompts, keys, file paths, or credentials. `workspace.recovery` remains `manual`. A recorded `running` count is saved metadata, not a live process check.

Open integration gate: verify that the shared IDE writes the summary at the configured path with mode `0644` and that the launchpad process can read it. Recovery remains manual. Any displayed counts are saved metadata, not proof that a process is running or can resume.
