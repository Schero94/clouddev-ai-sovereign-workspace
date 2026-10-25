# Security policy

CloudDev AI is intended for one operator per isolated Railway deployment. Do
not expose one instance as a shared shell or multi-user service. Coding agents
and repository contents are untrusted.

## Supported versions

Security fixes target the most recent released CloudDev AI version. Upstream
components are separately pinned. Users should update only after reviewing the
release notes, configuration changes, and backup guidance.

## Reporting a vulnerability

Do not report security issues in a public issue tracker. When a public
repository exists, use its private vulnerability reporting feature if enabled.
If it is unavailable, contact the maintainers through a private contact
channel published by the repository owner. This checkout has no published
security contact yet.

Include affected versions, deployment assumptions, reproduction steps, and
impact. Avoid attaching real provider credentials, customer source code, or
production data. The maintainers should acknowledge a report within five
business days and coordinate a fix and disclosure date with the reporter.

## Security boundaries

- Caddy authenticates browser entry points. SSH uses an operator-provisioned
  public key and rejects password and keyboard-interactive auth.
- The workspace agent process can read all files available to the workspace
  user. Inference and Git credentials needed by that user are residual risks.
- No Railway token, Forgejo administrator token, OmniRoute administrator
  credential, provider master key, privileged container, or Docker socket
  belongs in the workspace.
- Railway private networking is not outbound egress control.
- A Railway restart stops active processes. Persistent transcripts may permit
  manual recovery only when the upstream provider supports it.

## Release state

No Railway deployment or Marketplace template has been verified from this
checkout. Do not treat local tests or container builds as proof of a live
deployment's authentication, region, volume, proxy, or no-sleep configuration.
