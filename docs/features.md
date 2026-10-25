---
title: CloudDev AI features and limits
description: A factual feature list for CloudDev AI, including shared clients, persistent agent work, OmniRoute, Forgejo, and current platform limits.
tags:
  - CloudDev AI features
  - persistent workspace
  - browser development environment
  - AI provider routing
  - Forgejo
  - Railway template
---

# Features and limits

CloudDev AI combines editor and agent clients around one single-user workspace. The sections below describe the checked-in product design and its limits. Read the [release status](operations/RELEASE_STATUS.md) for current test evidence. Local tests do not prove a fresh Railway deployment.

## One project tree across three clients

| Client | What it is for | Shared state |
| --- | --- | --- |
| VS Code Desktop | Remote editing over key-only SSH | The same `/workspace/projects` files and Git checkouts |
| Browser VS Code | code-server and its integrated terminal | The same workspace files and persistent home |
| CloudCLI on a phone or tablet | Mobile-first agent conversations and session history | The same projects and supported provider-session artifacts |

The clients do not synchronize editor tabs, cursors, open windows, or other UI state. They share files and session artifacts, not an identical editor view. The workspace is single-user. It is not a shared shell or a multi-tenant service.

## Agent tasks that outlive a disconnected client

Interactive terminal agent tasks run in the shared workspace and can remain active after a browser or desktop client disconnects while the workspace process and provider connection remain healthy. `clouddev-tasks` lists recorded tasks. Use `clouddev-tasks --attach <TASK_ID>` only for a terminal task that is still running.

A Railway restart stops in-memory agent processes. CloudDev marks tracked work interrupted. It does not replay prompts or claim that a stopped process continued. Open CloudCLI and resume a conversation only when the upstream provider exposes a supported resume action. The durable task registry and saved conversation artifacts help you review what happened, but they do not guarantee that every upstream session can resume.

## OmniRoute and owner-managed providers

OmniRoute is the gateway for the agent wrappers. Add provider credentials to its authenticated dashboard, then create a scoped inference key for workspace use. `ai-setup` stores that scoped key in the persistent home. `ai-status` checks the connection, and `ai-models` lists models visible to that key.

Provider master keys do not belong in the IDE service, Git repositories, or agent environment. The scoped inference key is available to the agent process that makes requests. Rotate it if it may have been exposed. Available providers, model names, tool support, context limits, rate limits, and prices depend on the installed OmniRoute release and each provider's current account and terms. CloudDev does not promise universal model compatibility.

## Private Git hosting

Forgejo provides repository hosting with private repositories and its own user sign-in. Use a regular Forgejo account and a separate workspace Git key for day-to-day pushes. The setup does not give coding agents the Forgejo administrator password or token.

## Persistent files and service data

The workspace volume holds projects, user home, editor settings, CLI configuration, task records, and provider-session artifacts. Forgejo, PostgreSQL, and OmniRoute keep their data on their own persistent storage. Follow the [backup and restore guide](security/BACKUP_RESTORE.md); a configured backup is not proof of a successful restore.

Railway volume-backed services are configured for one replica. This release does not promise horizontal scaling. Railway restarts, volume availability, provider outages, and upstream session behavior can still interrupt work.

## Security boundaries

- Browser entry points require workspace authentication. Forgejo, CloudCLI, and OmniRoute keep their own account boundaries.
- VS Code Desktop uses the explicitly configured SSH TCP endpoint and operator-provisioned public key. `railway ssh` is not the Remote-SSH transport.
- Agent processes do not receive the Railway token, Forgejo administrator credential, OmniRoute management secrets, or provider master keys.
- Private Railway networking connects services. It does not filter outbound workspace traffic. Agents can read and change files available to the workspace user and can make outbound connections.
- Repository content and commands are untrusted. Review commands before running them; cloning a repository does not mean its scripts are safe.

These controls reduce exposure. They do not make the workspace a hostile-code sandbox or establish a certification or compliance status. See the [threat model](security/THREAT_MODEL.md) and [hardening guide](security/SECURITY_HARDENING.md).

## What CloudDev AI does not promise

- No verified live Railway deployment or published Marketplace template is available yet. Check [release status](operations/RELEASE_STATUS.md).
- No common editor UI state is synchronized between client windows.
- A restart cannot preserve an in-memory process. Manual recovery depends on upstream support.
- CloudDev does not add model quota, bypass provider rate limits, or turn a consumer subscription into API credit.
- Free tiers and free models are not guaranteed. Providers can change pricing, availability, and usage limits.
- “Any provider” and “every model” are not compatibility guarantees. Use only integrations documented by the installed OmniRoute release and confirm that the required model appears in `ai-models`.
- The Railway region does not determine where a configured AI provider processes requests.
