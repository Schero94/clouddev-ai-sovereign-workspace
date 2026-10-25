# Container image vulnerability scan

## Scope and method

On 2026-10-26, `npm run scan:images` used Trivy 0.76.1 to rebuild the router,
IDE, and Forgejo candidates sequentially from the current Compose Dockerfiles,
then pulled the PostgreSQL 18.6 image pinned by digest. It resolved each image
reference from the current Compose configuration, inspected the immutable local
image ID, and scanned that ID. It did not start, restart, or replace running
containers. The existing local stack remained on PostgreSQL 18.1. Trivy used
its vulnerability database from `mirror.gcr.io/aquasec/trivy-db:2`.

These are findings in the local image artifacts below. They are not a scan of a
Railway deployment or a substitute for scanning the exact release images again
before publication. Package-finding counts can include the same vulnerability
in several installed packages. Trivy can also report kernel/header or embedded
Go toolchain records that need a reachability review. Do not treat the counts
as exploitability scores.

| Local image or candidate | Image ID or registry digest | Critical findings / unique IDs | High findings / unique IDs | Other findings |
| --- | --- | ---: | ---: | --- |
| OmniRoute overlay on pinned release 3.8.52 | `sha256:b8a2191a8b9c5b4287fe329e9662b436b2e874c34766dc9e0613b9ef3d089bcc` | 2 / 2 | 48 / 12 | 43 Debian package findings total; 68 medium, 65 low, 2 unknown in the first full report |
| IDE candidate with Node 24.22.0 and Caddy 2.11.7 digests | `sha256:af99cbfb7b878cfc996c2533a0b06efb6895f2329ea220a3def04516826ffb57` | 4 / 2 | 250 / 120 | 908 medium, 1,077 low, 60 unknown |
| Forgejo 17.0.0 rootless candidate | `sha256:9c7edcf4ddcc7bac6cc25930968bca44def6898adea458f138c50e7e10eb2405` | 0 / 0 | 4 / 3 | 3 medium, 4 unknown |
| PostgreSQL 18.6 Alpine 3.24 exact multi-platform digest | `sha256:898c60cb390d1085bc97bdd6a1ae968757421df394b071848b52b1c09c89d6a5` | 1 / 1 | 26 / 26 | 31 medium, 3 low, 1 unknown |

The router image's two critical findings are Next.js 16.3.8 advisories
`GHSA-2464-fhr4-w9xw` and `GHSA-673q-mjm6-r5xr`. Trivy reports fixes in Next.js
16.4.1 and later. The router also has high findings for Next.js, undici, and
other dependencies. The newest published OmniRoute release checked is 3.8.52,
and its release image still declares Next.js 16.3.8 and DOMPurify `^3.4.14`.
The `release/v3.8.53` source currently declares Next.js 16.4.2 and DOMPurify
3.4.17, but its image publication was still pending when checked. The
unversioned `next` image also contained Next.js 16.3.8. Do not substitute that
moving tag for the pinned release. G15 stays open until an immutable patched
release image is published, scanned, and passes authenticated health, inference,
and persistence checks. The upstream `Release acceptance` run for
`release/v3.8.53` was still queued at the last read-back:
[run 40238715433](https://github.com/cheaper-inference/OmniRoute/actions/runs/40238715433).
Check the [upstream releases](https://github.com/cheaper-inference/OmniRoute/releases),
[3.8.53 dependency source](https://github.com/cheaper-inference/OmniRoute/blob/release/v3.8.53/package-lock.json),
and [published image tags](https://hub.docker.com/r/diegosouzapw/omniroute/tags)
again before selecting a router image.

The IDE candidate updates bundled `shell-quote` to 1.11.0 and pins Node and
Caddy by verified digests. Trivy reports four critical package findings across
two CVE identifiers: `CVE-2026-60002` in OpenSSH packages and
`CVE-2026-93221` in `linux-libc-dev`. A fresh package-index check from the
candidate image reported the installed OpenSSH version
`1:10.0p1-7+deb13u4` and `linux-libc-dev` version `6.12.113-1` as the current
Debian candidates. No newer package was available through the configured
repositories at that check. This does not establish that either finding is
unexploitable. Both remain release-blocking under the current policy. Trivy
found 250 high package findings, including OS and embedded Go records.

The Forgejo 17.0.0 image has no critical findings and four high package
findings. Three unique IDs are `CVE-2026-111497` in brotli, `CVE-2026-111943`
in Go's standard library, and `CVE-2026-77214` in libexpat. Its release notes
also advise against upgrading to 17.0.0 because some push, merge, and other Git
operations fail in certain cases. The latest published Forgejo release checked
on 2026-10-25 remained 17.0.0; 17.0.1 was not available. Version 16.0.6 was
also scanned. It had the same three high CVE identifiers and no critical
findings, so it did not remove the Go or OS findings. No downgrade was made
against persistent data.

The PostgreSQL 18.6 Alpine image has one critical finding, `CVE-2025-68121`, in
the embedded `gosu` Go binary (`stdlib` v1.24.6), plus 26 high findings across
26 unique IDs. Trivy reports a Go standard-library fix in 1.24.13 and later.
An older 18.1 database image had two unique critical and 40 unique high
findings. PostgreSQL 18.6 passed an isolated startup check without a persistent
volume. The scanner only pulled and inspected the 18.6 candidate; the running
18.1 service and its data were not changed.

## Release decision

Do not call these images clean and do not publish the Railway template as
verified. G15 remains open for OmniRoute. G17 remains open for all service
images. The local Docker daemon has a 4 GiB memory limit. The pinned OmniRoute
upstream Dockerfile documents a 9 GiB working set for its one-worker full
source build, so a patched source rebuild was not attempted on this daemon. A
runtime-only Next.js overlay previously failed startup and is not used. The
fresh personal Railway project received a reviewed plan only; no service or
volume was created there.

Before deployment, obtain patched upstream images or build and test patched
images on a builder with sufficient memory. Scan the exact release image
digests again. Run health, authentication, inference, and persistence tests on
those same images. Record accepted, unreachable, or vendor-unfixed findings
with evidence rather than hiding them with broad suppressions.

## Reproduce the local scan

Install Trivy from the official package source for the host, then run the
release gate. It rebuilds the three Dockerfile-backed services one at a time,
pulls the pinned PostgreSQL image, and scans the configured image IDs. It does
not start or restart services. Large images need several gigabytes of temporary
space. Set `CLOUDDEV_TRIVY_TMP_DIR` to a writable volume with enough free space
if the system temporary directory is small:

```sh
CLOUDDEV_TRIVY_TMP_DIR=/path/to/large-temp-volume npm run scan:images
```

The script exits nonzero if any configured candidate reports a high or critical
finding. The report lists each configured reference and its image ID. A Railway
release must still be scanned by the immutable digest that was built and tested
for that deployment.
