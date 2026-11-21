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

## Current router pin

On 2026-11-21, Trivy 0.76.2 scanned the published amd64 image
`diegosouzapw/omniroute@sha256:2be638c210c7a559643e8f68bdcac2167e4eacfef370fdd9eabb825eebe56d32`
with `--image-src remote`. Docker was not used. The multi-platform index is
`sha256:2c4c755a54f8ce5341bc1856580b71f47a0f16a9afab4a55f84d540810631f68`, also
published as `cheaperinference/omniroute:3.8.54`. The image contains `next`
16.4.2 and `zod` 4.6.7. The scan reported 0 critical and 49 high findings.
The high findings are Debian 13.7 packages, principally util-linux, SQLite,
and OpenSSL. No Next.js advisory was reported at high or critical, and
DOMPurify was not detected as a separate package.

The Dockerfile now pins that index. This is a scan of the upstream image, not
a rebuilt CloudDev overlay, and the container was not started. Health,
authentication, inference, and persistence checks have not been run on 3.8.54.
G15 stays open for those runtime checks. The later local overlay scan closed
the image-finding part recorded as G17.

## 2026-10-26 local overlay scan

The 2026-10-26 local overlay scan below used OmniRoute 3.8.52. Its two critical
findings were Next.js 16.3.8 advisories `GHSA-2464-fhr4-w9xw` and
`GHSA-673q-mjm6-r5xr`. That image is no longer the pinned release. The table
remains the last full four-image local scan. The IDE, Forgejo, and PostgreSQL
rows have not been repeated.

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

On 2026-11-21, Trivy 0.76.2 scanned the published Forgejo 17.0.2 rootless
amd64 manifest
`sha256:020d7e5ed6228f147c9681a9c4a3bff485a07c59108e4731a2e94672f0f2202a`
remotely. The multi-platform index is
`sha256:39362ab93a94c0c9b8b330d2a877ddbb3f02fa8c0cba1b8d686d437b39f36a04`.
The scan reported 0 critical findings and 1 high finding, `CVE-2026-86144`
in `libxml2` 2.13.9-r2, with a fix listed in 2.13.9-r3. The Dockerfile pins
that index and installs Alpine's current `libxml2=2.13.9-r3` during the
overlay build. This scan did not rebuild the CloudDev overlay or start the
container, so the upgraded package is not yet present in a built image. The
17.0.2 release notes include the internal SSH public-key exact-match fix.

The 2026-10-26 Forgejo 17.0.0 image had no critical findings and four high
package findings. Three unique IDs were `CVE-2026-111497` in brotli,
`CVE-2026-111943` in Go's standard library, and `CVE-2026-77214` in libexpat.
Its release notes advised against upgrading to 17.0.0 because some push,
merge, and other Git operations failed in certain cases. That image is no
longer the pin. Version 16.0.6 had the same three high CVE identifiers and no
critical findings, so it was not used. No existing volume was changed.

The PostgreSQL 18.6 Alpine image has one critical finding, `CVE-2025-68121`, in
the embedded `gosu` Go binary (`stdlib` v1.24.6), plus 26 high findings across
26 unique IDs. Trivy reports a Go standard-library fix in 1.24.13 and later.
An older 18.1 database image had two unique critical and 40 unique high
findings. PostgreSQL 18.6 passed an isolated startup check without a persistent
volume. The scanner only pulled and inspected the 18.6 candidate; the running
18.1 service and its data were not changed.

On 2026-11-21, Trivy 0.76.2 remotely scanned the rebuilt 18.6 Alpine amd64
manifest `sha256:300ebd02c6d4de9ee27ad7f6855d5d21b4d3a4a5117767c1197d284c635d9736`
and Postgres 18.7 Alpine amd64
`sha256:68e33adb18d9962952f00d5e3b8644305e10e375f98dd652bf6ee6a1836314ba`.
Both still contain `CVE-2025-68121` in `stdlib` v1.24.6. The 18.7 scan has 27
high findings (`stdlib` and `libxml2`) and no longer lists `krb5-libs` or
`libxslt`. The local Compose database is now an overlay on that 18.7 digest.
It rebuilds gosu 1.20 with Go 1.27.4 and installs `libxml2=2.13.9-r3`. A local
Trivy 0.76.2 scan of that built amd64 image reported 0 high and 0 critical
findings. The container was not started.

## Release decision

On 2026-11-21, `npm run scan:images` with Trivy 0.76.2 rebuilt the four amd64
Compose candidates and exited 0. It printed `No HIGH or CRITICAL
vulnerabilities were found in the configured Compose candidate images.` The
scanned IDs were router
`sha256:b2083f120e4fbea399bb4c80e50449499cd15e9ad39eb2f652c335f25a0bfcb8`, IDE
`sha256:e7b12e3d45dd5941ff1423491d0fd159228cf6b1d5cc0bba5c5e02cf6bd6db3a`,
Forgejo
`sha256:27b7885a4cb3b66db4c3d692792fc48a46d3a58b48edadc5a9ced779bc506a0e`, and
Postgres
`sha256:b9b84d30c48bdc118fb51aba69106318b6c588a1af804592da4b5b3cd2abfa73`.
OmniRoute reaches that result by upgrading from the Debian sid snapshot
`20261121T000000Z` and replacing OpenSSL with 3.6.5 plus commit `f3acb0a`.
The IDE image replaces Kerberos 1.22.3, Git 2.55.1, OpenSSL 3.6.5, and the
Caddy binary built with Go 1.27.4. That first IDE image did not start. Its
Caddy build imported the reverse-proxy package but not
`caddyhttp/reverseproxy/forwardauth`, so Caddy rejected the gateway
Caddyfile. The binary now imports that package and still does not import
`modules/standard`. The rebuilt amd64 IDE is
`sha256:56e8d1ab5f9cda9752983d63226ff3928f0b40f6d10c6c0297f55ed7f9a735d8`.
Trivy 0.76.2 scanned that ID with `--severity HIGH,CRITICAL --exit-code 1`
and exited 0. `npm run scan:images` was not rerun after this rebuild. A local
boot of this IDE with the scanned router returned `/healthz` 200 and
`/vscode/` 302, and `node /opt/clouddev-ide/src/healthcheck.mjs` exited 0.
The boot project and its volumes were removed. That HTTP check does not close
G4. No Railway service or volume was created.

G17 is closed for these local candidates. On the same day the rebuilt amd64
router answered `GET /omniroute/healthz` with 200, rejected anonymous and
wrong-password requests, accepted the dashboard login, routed a scoped chat
completion through a local mock provider, and kept that provider and key after
a restart. G15 is closed for that private run. Do not publish the Railway
template as verified from this local evidence.

Before deployment, scan the rebuilt overlay and the other three release images
again. Run the runtime checks on those same images. Record accepted,
unreachable, or vendor-unfixed findings with evidence rather than hiding them
with broad suppressions.

## Railway runtime scan

On 2026-11-21, Trivy 0.76.2 scanned the running Railway containers with
`trivy rootfs`, skipping mounted volumes. The binary was checked against the
published SHA-256 checksum before use.

The first IDE scan reported 68 high or critical findings. It also showed that
Railway's runtime kept files that later image layers had deleted: `sudo`, its
`NOPASSWD` rule, and setuid `fixuid` were present, and UID 1000 could run
`sudo -n` as root. The IDE image is now one flattened layer, and the
entrypoint removes those paths and refuses to start if any survives. After
that deploy, `/usr/bin/sudo` and `fixuid` were absent and `sudo -n` failed for
UID 1000. The remaining findings were fixed by pinning TaskMaster with a
lockfile and patched dependencies, removing the Xvfb packages, removing Path
IntelliSense and the setuid Kerberos `ksu`, and pinning `protobufjs` 8.8.1
under OpenTelemetry 0.217.

`.trivyignore.yaml` records one exception, `CVE-2025-47273` for
`pkg:pypi/setuptools@70.3.0`. pip 26.3 lists that release in its vendored SBOM
because it ships `pkg_resources`. The vulnerable `setuptools.package_index`
module is not vendored, and no `package_index.py` exists in the IDE image.

The router and Forgejo containers reported 0 high and 0 critical findings.
Their only setuid binaries are standard Debian or Alpine account tools.

PostgreSQL uses Railway's managed `postgres()` service. On the same day its
image `ghcr.io/railwayapp-templates/postgres-ssl@sha256:4fc833b43d2aaf6ecc9b18615f5533602b723a32d0e2efe2dae8ca0f7217c863`
reported 156 high or critical package findings. Railway maintains and patches
that image. CloudDev does not rebuild it, and it has no public endpoint. Only
Forgejo connects to it over the private network. This is an accepted
provider-managed exception, not a passing scan.

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
