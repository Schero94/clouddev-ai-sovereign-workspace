# Security hardening

## Browser and SSH entry points

- Require the per-deployment, signed HttpOnly workspace cookie for CloudCLI,
  browser code-server, and the embedded launchpad. The launchpad auth process
  under UID 1002 issues the cookie; Caddy calls its loopback verification
  route before forwarding. Railway must provide HTTPS in production. Do not
  expose loopback application ports directly.
- Verify that the Caddy upstream listeners bind to loopback and that the Caddy
  admin API is disabled.
- Keep code-server bound to loopback at port 8081 and set its own auth mode to
  `none` only because Caddy checks the workspace cookie before every public
  editor route. Verify that the internal port has no public mapping and an
  unauthenticated request to `/vscode/` redirects to `/auth/login`.
- Do not use Basic Auth for the shared workspace gateway. CloudCLI's own API
  uses `Authorization: Bearer`; Basic Auth in that header blocks its API calls.
- Require OpenSSH public-key auth only. Disable passwords, keyboard
  interaction, root login, agent forwarding, X11 forwarding, tunnels, and
  gateway ports. Keep operator authorized keys root-owned and non-writable
  outside the workspace volume. Public-key files must be readable through the
  path by OpenSSH's privilege-separated pre-auth process. Keep Forgejo Git
  identity keys in the workspace user's persistent home, separately from the
  Remote-SSH key.
- On Debian with `UsePAM no`, a locked shadow account is rejected before
  public-key authentication. Startup assigns `coder` a random, discarded
  password so the Unix account remains eligible. SSH still permits only
  public-key authentication. Do not set an empty or known password.
- Compare the workspace SSH host-key fingerprint before accepting a first
  connection. Treat unexplained fingerprint changes as an incident.
- Expose Forgejo's web UI and built-in Git SSH only when their public
  networking settings have the expected HTTPS/TCP authentication. Keep
  PostgreSQL and OmniRoute private. Reach the OmniRoute dashboard only through
  the cookie-protected workspace `/omniroute/` path, then require its native
  login. The loopback-only Caddy adapter directs CLI health checks to the
  dashboard port and `/v1/*` traffic to the private inference port; require a
  scoped API key there.

## Runtime privilege separation

- Start code-server, CloudCLI, the launchpad, and agent CLIs as unprivileged
  users with no Linux capabilities. Limit the root startup work to mount
  permissions, root-owned SSH keys, host keys, and the sshd master process.
- Never mount `/var/run/docker.sock` or run privileged containers.
- Keep service-specific environments allowlisted. The workspace password and
  signing secret go only to the launchpad auth process. Caddy gets the private
  verification key in its protected config. Neither is inherited by agents.
  Forgejo database/bootstrap credentials and Railway-provided values must not
  reach agents. CloudCLI receives only a scoped inference credential needed to
  route requests; the agent may read it as its operating-system user.
- Do not place secrets in project files, `.codex` project configuration,
  prompts, command-line arguments, or logs.
- Do not automatically run repository scripts after clone. Treat task files,
  shell commands, extensions, and repository hooks as untrusted.

## Gateway and provider credentials

- Keep provider master credentials in OmniRoute only. Create a separate
  inference key for the workspace, restrict its models and scope where the
  pinned OmniRoute release allows it, and rotate it in OmniRoute.
- Verify anonymous inference is rejected with a real inference route, not only
  `/v1/models`. OmniRoute 3.8.52 documents different authentication gates for
  the model catalog and inference routes. The separate API bridge is bound to
  router loopback; workspace clients use a scoped key through the private
  dashboard API route and the loopback Caddy adapter.
- Do not use multiple accounts to evade service terms, contractual limits, or
  rate limits.
- Use Railway sealed variables for non-bootstrap secrets where possible. Do
  not seal initial login passwords until the operator has recorded them and
  completed first login, because Railway does not make sealed values visible or
  retrievable.

## Logging and outbound access

- Disable request-body, prompt, source-code, stream-chunk, and provider-key
  logging in ordinary operation.
- Keep log retention short. Treat stack traces and proxy logs as potential
  data disclosure surfaces.
- Do not claim that `HTTP_PROXY` or Railway private networking blocks egress.
  A malicious repository or agent can make outbound requests unless a real
  network enforcement layer is configured and verified.

## Verification checklist

- [ ] Public browser app routes redirect to `/auth/login` without a valid
      workspace cookie; login and health paths expose no application data.
- [ ] Workspace SSH rejects password and keyboard-interactive authentication.
- [ ] Wrong or absent workspace keys fail, and the correct key connects as
      `coder` only.
- [ ] Forgejo rejects unauthenticated private repository access and public
      registration.
- [ ] OmniRoute rejects unauthenticated inference on every published
      endpoint; API port remains private.
- [ ] Database and application secrets do not appear in agent environments,
      process arguments, stdout, or build logs.
- [ ] No privileged container, Docker socket, or unexpected capability exists.
- [ ] Railway app sleeping is disabled and the live setting is read back.
- [x] Gitleaks scanned all committed Git history and reported no leaks on
      2026-10-25. The source repository was rechecked after pushing.
- [ ] `npm run scan:images` has been run against every image that would ship,
      and the remaining high and critical findings have been resolved or
      formally assessed before the template is published.
- [ ] Dependency audits and live penetration checks have recorded outputs for
      the release. The current router and IDE image security hold is documented
      in [IMAGE_SCAN.md](IMAGE_SCAN.md).

Passing a local static check does not prove a corresponding Railway setting.
