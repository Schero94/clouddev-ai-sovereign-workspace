# Container image vulnerability scan

## Scope and method

On 2026-10-25, Trivy 0.76.1 scanned the local Compose images that were running
at the time of the initial scan, then scanned a rebuilt IDE candidate and two
PostgreSQL 18.6 candidates. The scanner did not filter by severity or suppress
unfixed findings. Trivy downloaded its vulnerability database from
`mirror.gcr.io/aquasec/trivy-db:2` during the first scan.

These are findings in the local image artifacts below. They are not a scan of a
Railway deployment or a substitute for scanning the exact release images again
before publication. Package-finding counts can include the same vulnerability
in several installed packages. Trivy can also report kernel/header or embedded
Go toolchain records that need a reachability review. Do not treat the counts
as exploitability scores.

| Local image or candidate | Image ID or registry digest | Critical package findings / unique IDs | High package findings / unique IDs | Other findings |
| --- | --- | ---: | ---: | --- |
| `clouddev-ai-sovereign-workspace-local-clouddev-router:latest` | `sha256:b8a2191a8b9c5b4287fe329e9662b436b2e874c34766dc9e0613b9ef3d089bcc` | 2 / 2 | 48 / 12 | 68 medium, 65 low, 2 unknown package findings |
| IDE image running before shell-quote patch | `sha256:d60b1f7ab4a91fee6f1d7c04407953c10a00d11ecc5cb8c56f26c743b2245432` | 8 / 6 | 252 / 122 | 910 medium, 1,081 low, 60 unknown package findings |
| `clouddev-ai-sovereign-workspace-local-clouddev-ide:latest` after shell-quote patch | `sha256:7e20e7c4fd50487e75c717f64aa3385d75c200c318f8a70402d870515a19b045` | 7 / 5 | 252 / 122 | 910 medium, 1,081 low, 60 unknown package findings |
| `clouddev-ai-sovereign-workspace-local-clouddev-git:latest` | `sha256:9c7edcf4ddcc7bac6cc25930968bca44def6898adea458f138c50e7e10eb2405` | 0 / 0 | 4 / 3 | 3 medium, 4 unknown package findings |
| `postgres:18.1-alpine3.22` | `sha256:270579ee277a572fa8cfdbaec0e1ff588bb7247da92d25165c7237c483e565d9` | 3 / 2 | 47 / 40 | 56 medium, 35 low, 3 unknown package findings |
| `postgres:18.6-alpine3.24` candidate, amd64 platform manifest | `sha256:3b0ef735388b2cb097fc29b8bb421d86d57d0ddbe7aa1fbd6493e06d65028503` | 1 / 1 | 26 / 26 | 31 medium, 3 low, 1 unknown package finding |
| `postgres:18.6-alpine3.24` multi-platform index, arm64 selected locally | `sha256:898c60cb390d1085bc97bdd6a1ae968757421df394b071848b52b1c09c89d6a5` | 1 / 1 | 26 / 26 | 31 medium, 3 low, 1 unknown package finding |

The router image's two critical findings are Next.js 16.3.8 advisories
`GHSA-2464-fhr4-w9xw` and `GHSA-673q-mjm6-r5xr`. Trivy reports fixes in Next.js
16.4.1 and later. The router also has high findings for Next.js, undici, and
other dependencies. The current OmniRoute release tag remains 3.8.52, and its
package manifest still declares Next.js 16.3.8 and DOMPurify `^3.4.14`.

The original IDE image contained a critical `shell-quote` finding plus critical
findings in OpenSSH, a Linux header package, Next.js, and DOMPurify. A new IDE
candidate image updates bundled `shell-quote` from 1.10.0 to 1.11.0, and Trivy
no longer reports that vulnerability. The candidate still has five unique
critical CVEs, including Next.js and DOMPurify. An npm lockfile override now
pins those application dependencies to patched releases, but that updated CLI
lockfile has not yet been rebuilt into the image. Several OS findings have no
fixed package version. The Forgejo image has three unique
high-severity findings. PostgreSQL 18.1 had two unique critical and 40 unique
high findings. The official PostgreSQL 18.6 Alpine 3.24 image, updated on
2026-10-22, reduces that to one unique critical and 26 unique high findings on
both amd64 and arm64. Compose now pins the multi-platform digest
`sha256:898c60cb390d1085bc97bdd6a1ae968757421df394b071848b52b1c09c89d6a5`.
The running local database remains on 18.1; it was not restarted or migrated.
The 18.6 image passed a startup smoke test without a persistent volume. That
does not verify migration or recovery of the existing database.

## Release decision

Do not call these images clean and do not publish the Railway template as
verified. G15 remains open for OmniRoute. G17 tracks the wider service-image
findings. The local filesystem has less than 1.5 GiB free after the local build
and security database download. The local Docker daemon has a 4 GiB memory
limit. The pinned
OmniRoute upstream Dockerfile documents a measured 9 GiB build working set for
its one-worker build, so a full patched source rebuild was not attempted on
this daemon. The earlier runtime-only Next.js overlay failed startup and is
not used.

Before deployment, obtain patched upstream images or build and test patched
images on a builder with sufficient memory. Scan the exact release image
digests again. Run health, authentication, inference, and persistence tests on
those same images. Record accepted, unreachable, or vendor-unfixed findings
with evidence rather than hiding them with broad suppressions.

## Reproduce the local scan

Install Trivy from the official package source for the host. Build and start the
Compose services, then run the release gate. Large images need several gigabytes
of temporary space. Set `CLOUDDEV_TRIVY_TMP_DIR` to a writable volume with enough
free space if the system temporary directory is small:

```sh
CLOUDDEV_TRIVY_TMP_DIR=/path/to/large-temp-volume npm run scan:images
```

The script scans the image IDs of the four running Compose services and exits
nonzero if any report a high or critical finding. Tags are local build names.
Verify each image ID before comparing future scan results. A Railway release
must be scanned by the immutable image digest that was actually built and
tested.
