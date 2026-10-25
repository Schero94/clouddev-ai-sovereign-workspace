# Subprocessor register

This is a technical inventory of services a deployment may use. It is not a
complete contractual subprocessor list and does not replace each vendor's
current legal notices, DPA, or subprocessors page. The operator must verify
current entities, locations, services, and transfer terms before production.

| Service | Data it may process | Configuration boundary | Operator action |
| --- | --- | --- | --- |
| Railway | Application source at build time, environment variables, repository/container artifacts, stored volumes, deployment logs, metrics, network metadata | Hosting, build, HTTP/TCP routing, volumes, managed PostgreSQL | Review Railway's current DPA, subprocessors, region availability, retention, support access, and incident terms. |
| OpenAI API | Prompts, code context, tool output, model and request metadata sent via OmniRoute | Provider account and model selected by the operator | Review the account's applicable DPA, retention/training controls, region settings, and transfer mechanism. |
| Anthropic API | Prompts, code context, tool output, model and request metadata sent via OmniRoute | Provider account and model selected by the operator | Review the account's applicable DPA, retention/training controls, region settings, and transfer mechanism. |
| Other OmniRoute providers | Data in routed requests and provider metadata | Operator-added provider connections | Add each selected provider to the deployment's own register and assess its terms before sending data. |
| npm registry and Open VSX | Build-time package and extension downloads, IP/request metadata | Image build only; not normally contacted by end-user runtime | Review package provenance, licenses, pinned versions, and build-time network access. |

Forgejo and PostgreSQL are self-hosted services inside the Railway project, not
independent SaaS processors for the application operator. Railway still
operates the underlying hosting. OmniRoute is also self-hosted, but it forwards
requests to operator-selected providers.

Review this register whenever the deployment changes region, provider, image,
extension, or external integration. Record the review date and the vendor
documents used in the operator's processing records.
