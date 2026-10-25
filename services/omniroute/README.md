# OmniRoute service

CloudDev AI uses the published OmniRoute `3.8.52` Docker image, pinned by its registry digest. This is the latest image tag verified in the registry during implementation. The package registry reported the same release. A newer source branch existed but had not been published as an image, so it is not used here.

```text
diegosouzapw/omniroute:3.8.52@sha256:b08a12e876baa8a5ccadd1ebbe346fe7267dba3b1c9f4fd6bb02070fae41ab6c
```

OmniRoute's published project is now maintained at [cheaper-inference/OmniRoute](https://github.com/cheaper-inference/OmniRoute). The project documentation is at [omniroute.hagicode.com](https://omniroute.hagicode.com/en-US/).

## Security release hold

The pinned router image contains Next.js `16.3.8`. Trivy 0.76.1 reports two
critical Next.js advisories. The fixed Next.js release listed in the scan data
is `16.4.1` or later. The pinned OmniRoute source package declares DOMPurify
`^3.4.14`; npm reports critical/high DOMPurify findings through `3.4.16`.

CloudDev's separate OmniRoute CLI dependency tree now overrides Next.js to
`16.4.3`, DOMPurify to `3.4.17`, and Zod to `4.6.6`. `npm run
audit:omniroute-cli` reports zero high or critical advisories in that lockfile
(7 low remain). These overrides have not yet been rebuilt into the IDE image.
They do not modify the router's published image or app source.

The inspected upstream Next.js configuration sets `cacheComponents: false`,
`images.unoptimized: true`, and `dangerouslyAllowSVG: false`. The router image
contains Sharp `0.35.5`, the workaround named in the Next.js SVG optimizer
advisory. These settings mitigate specific advisory paths. They do not update
the vulnerable dependency ranges. The local router image was scanned with
Trivy 0.76.1 on 2026-10-25. It contains two critical Next.js advisories and 48
high package findings. See [the image scan record](../../docs/security/IMAGE_SCAN.md)
for the scanned image ID and the results for all local service images.

On 2026-10-25, the original CLI lockfile audit reported 10 advisories: 6 low,
1 moderate, 1 high, and 2 critical. After the lockfile overrides, the CLI audit
reports 7 low and no high or critical advisories. The same audit reported 20
advisories for CloudCLI's pinned package
tree (5 low and 15 moderate), and none for the direct Codex, Claude Code, and
pnpm tool manifest. These are npm lockfile audits, not scans of the final
container images. The exact image scans are in `docs/security/IMAGE_SCAN.md`.

A runtime-only replacement of Next.js `16.3.8` with `16.4.3` failed at startup
because the prebuilt application artifacts did not match the newer runtime.
That overlay was removed. The local and Railway Dockerfiles now use the pinned
upstream image and add only the local health probe. Gate G15 blocks public
deployment until OmniRoute publishes a patched image, or a full source rebuild
passes image build, health, authentication, inference, and dependency checks.
Keep the router dashboard private; the release hold still applies because the UI is reachable through the authenticated workspace proxy.

## Storage and credentials

Mount persistent storage at `/app/data` and set `DATA_DIR=/app/data`. The SQLite database holds provider connections, generated API keys, settings, usage metadata and audit data. Set unique values for `JWT_SECRET`, `API_KEY_SECRET`, `STORAGE_ENCRYPTION_KEY`, `MACHINE_ID_SALT` and `OMNIROUTE_WS_BRIDGE_SECRET`. `API_KEY_SECRET` protects API-key values, while `STORAGE_ENCRYPTION_KEY` enables full SQLite database encryption at rest. Losing the encryption key can make the database unreadable. Include it in the operator's protected backup and recovery plan.

Set `INITIAL_PASSWORD` to a generated value before the first start. OmniRoute uses it only until a dashboard password is saved. The launchpad's **Manage AI providers** link opens `/omniroute/dashboard/providers` on the authenticated workspace origin. Complete OmniRoute's separate sign-in before connecting providers. Never use a known default password. Keep the generated bootstrap value in Railway's protected variable store until a recovery procedure can safely recreate the first-admin credential.

The router requires inference API keys with `REQUIRE_API_KEY=true`. The launchpad password is separate. The IDE receives only an inference key created in OmniRoute. It does not receive the dashboard password, `JWT_SECRET`, `API_KEY_SECRET`, `STORAGE_ENCRYPTION_KEY` or Railway credentials.

## Data and log settings

The service disables file logs, detailed request logs, stream-chunk capture, Arena leaderboard sync, and models.dev pricing sync. It omits client IPs and first-chunk timing from process and proxy logs. Application and call-log retention are set to one day, with bounded SQLite log tables. OmniRoute can still retain summary usage, proxy and audit metadata in SQLite. Review the [data flow](../../docs/privacy/DATA_FLOW.md) before deciding whether that metadata is suitable for your use.

The template sets `ARENA_ELO_SYNC_ENABLED=false` and `MODELS_DEV_SYNC_ENABLED=false`. These disable the Arena leaderboard and models.dev pricing syncs while leaving provider/model discovery available for authenticated `ai-setup` requests.

## Health and access

The container health check calls the minimal `GET /omniroute/healthz` endpoint on loopback. It reports liveness only. The launchpad probes that endpoint over Railway private networking. Workspace Caddy exposes a loopback-only adapter at `127.0.0.1:20129`: it rewrites `GET /api/monitoring/health` to the private dashboard health path and rewrites `/v1/*` to the documented `/omniroute/api/v1/*` API routes on dashboard port 20128. This works for model listing, OpenAI chat, and Anthropic Messages without forwarding the OmniRoute dashboard cookie. In the pinned OmniRoute image, the separate API bridge on port 20131 did not serve these client routes. CloudDev binds that bridge to loopback so workspace agents cannot reach it over Railway private networking. The dashboard itself is proxied under `/omniroute/` after workspace-cookie authentication, then uses OmniRoute's own login. Do not assign a public domain or TCP proxy to `clouddev-router`.

`REQUIRE_API_KEY=true` protects inference routes. OmniRoute uses a separate dashboard-auth posture for `GET /v1/models`; a valid scoped API key can authenticate that catalog request after the dashboard password is set. A `401` from `/v1/models` is not evidence that inference is protected. Probe an inference route without credentials and require `401` during security testing.

The `services/omniroute/healthcheck.mjs` check accepts only local HTTP health URLs, includes the configured `/omniroute` base path, and has a bounded timeout. It does not print the response body or error details.

## CLI integration

The pinned CLI `3.8.52` supports `omniroute run codex` and `omniroute run claude` with `--remote`, `--model` and `--api-key-env`. Its documented health check requires the management dashboard route. The pinned image serves the client model catalog, OpenAI chat, and Anthropic Messages routes under the dashboard's `/omniroute/api/v1/*` API path. The IDE's loopback-only Caddy adapter rewrites client `/v1/*` routes to this path. The wrappers query `/v1/models?kind=chat` with the scoped key, validate the selected model against the live catalog, and pass the key to the OmniRoute CLI through a short-lived environment variable. The wrapper does not put the key in process arguments or shell history.

The CLI also provides `omniroute setup-codex` and `omniroute setup-claude`, which write profiles. CloudDev AI does not use them by default because the runtime wrappers avoid writing gateway credentials into agent-specific config files. The selected model and inference key are saved in a private, persistent CloudDev config file.

No provider account is included. Do not use multiple provider accounts to work around terms, quotas or rate limits.

## Reference checks

- [OmniRoute Docker guide](https://omniroute.hagicode.com/en-US/guides/setup-guide)
- [OmniRoute environment reference](https://github.com/cheaper-inference/OmniRoute/blob/v3.8.52/docs/reference/ENVIRONMENT.md)
- [OmniRoute CLI integrations at v3.8.52](https://github.com/cheaper-inference/OmniRoute/blob/v3.8.52/docs/guides/CLI-INTEGRATIONS.md)
- [Docker image tag](https://hub.docker.com/layers/diegosouzapw/omniroute/3.8.52/images/sha256-b08a12e876baa8a5ccadd1ebbe346fe7267dba3b1c9f4fd6bb02070fae41ab6c)
