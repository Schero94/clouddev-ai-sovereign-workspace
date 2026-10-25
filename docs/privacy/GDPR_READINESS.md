# GDPR readiness notes

CloudDev AI is designed to support privacy-conscious operation. This document
does not claim that a deployment is GDPR-compliant or that the operator has met
all legal duties. Applicability depends on the operator, users, data, providers,
contracts, and actual configuration. Obtain qualified legal advice for a
production use case.

## Technical measures in the template design

- One isolated deployment per operator, not a shared multi-tenant workspace.
- One persistent workspace volume with restricted container services and
  private state paths.
- TLS for public browser services through Railway's HTTPS edge.
- A workspace cookie gate plus CloudCLI's own account; separate native
  authentication for Forgejo and OmniRoute.
- Forgejo registration disabled and private repositories as the default.
- PostgreSQL and OmniRoute inference API kept on private service networking.
- Provider master credentials remain in OmniRoute rather than the IDE.
- Shorter call-log retention, reduced application logging, and optional
  aggregate health only in the launchpad.
- Operator-controlled provider selection and separate data-processing terms.
- Documented backup and incident procedures. Restore claims require a completed
  restore drill.

## Operator responsibilities

The operator must identify data categories, define a lawful basis and purpose,
minimize project data sent to AI providers, approve provider accounts and
models, review provider DPAs and international transfer mechanisms, set
retention periods, manage subject requests where applicable, protect backups,
control staff access, and maintain incident-response contacts. The operator
also selects a Railway region and must verify all services and volumes are in
that region. A UI label or IaC setting alone is not proof of a live deployment
location.

## Limits

- Commercial AI providers may process information outside the Railway EU West
  region.
- Railway private networking restricts inbound service reachability, not
  arbitrary outbound connections from a coding agent.
- Coding agents can read files available to the workspace user and can send
  data to external endpoints.
- Railway restarts terminate active processes. Session files may permit
  provider-supported resume, but no process continuity is promised across a
  restart.
- The template does not provide a legal retention/deletion workflow across
  provider accounts, Railway logs, workspace files, Git history, and backups.
- MFA is available only where an upstream interface supports it; no platform
  wide MFA claim is made.

## Review before launch

Complete the DPA checklist, subprocessor review, threat model, and backup/restore
runbook. Verify public endpoints, secret sealing, access logs, volume access,
provider privacy controls, and local authority transfer requirements. Record
the configuration and review date in the deployment's own compliance records.
