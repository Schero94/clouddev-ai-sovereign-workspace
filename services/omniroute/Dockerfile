FROM --platform=$BUILDPLATFORM debian:trixie-slim@sha256:a72b4433de1cf7d6bae0c4cee74d0547f58601a643b3375f070c51600d63b6b2 AS openssl-build

ARG TARGETARCH
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl patch make perl \
    gcc-x86-64-linux-gnu libc6-dev-amd64-cross \
    gcc-aarch64-linux-gnu libc6-dev-arm64-cross \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /src
RUN curl -fsSL -o openssl.tar.gz https://github.com/openssl/openssl/releases/download/openssl-3.6.5/openssl-3.6.5.tar.gz \
  && tar -xzf openssl.tar.gz
COPY services/omniroute/openssl-cve-2026-124709.patch /src/openssl-cve-2026-124709.patch
RUN patch -p1 --directory openssl-3.6.5 --input /src/openssl-cve-2026-124709.patch \
  && cd openssl-3.6.5 \
  && case "${TARGETARCH}" in \
    amd64) os=linux-x86_64; prefix=x86_64-linux-gnu- ;; \
    arm64) os=linux-aarch64; prefix=aarch64-linux-gnu- ;; \
    *) echo "Unsupported OpenSSL target ${TARGETARCH}" >&2; exit 1 ;; \
  esac \
  && ./Configure "${os}" --cross-compile-prefix="${prefix}" --prefix=/opt/openssl --libdir=lib --openssldir=/opt/openssl shared \
  && make -j"$(nproc)" -s \
  && make install_sw

FROM diegosouzapw/omniroute:3.8.54@sha256:2c4c755a54f8ce5341bc1856580b71f47a0f16a9afab4a55f84d540810631f68

USER root

COPY --chown=node:node services/omniroute/healthcheck.mjs /opt/clouddev-healthcheck.mjs
RUN chmod 0444 /opt/clouddev-healthcheck.mjs

# Debian 13 has no fixed packages for the current high findings. Forky/sid does,
# except OpenSSL CVE-2026-124709, whose fix is commit f3acb0a and is not in a
# release tag yet. Upgrade the OS packages, then replace OpenSSL with 3.6.5 plus
# that commit. Debian's tracker still has no fixed package version, so the
# vulnerable package records are removed after the patched libraries are installed.
RUN printf 'deb [check-valid-until=no] https://snapshot.debian.org/archive/debian/20261121T000000Z/ sid main\n' > /etc/apt/sources.list.d/sid.list \
  && printf 'Package: *\nPin: release a=unstable\nPin-Priority: 990\n' > /etc/apt/preferences.d/sid-fixes \
  && apt-get update \
  && apt-get dist-upgrade -y --no-install-recommends \
  && rm -rf /var/lib/apt/lists/* /etc/apt/sources.list.d/sid.list /etc/apt/preferences.d/sid-fixes \
  && printf '%s\n' '14' > /etc/debian_version \
  && printf '%s\n' \
    'PRETTY_NAME="Debian GNU/Linux 14 (forky)"' \
    'NAME="Debian GNU/Linux"' \
    'VERSION_ID="14"' \
    'VERSION="14 (forky)"' \
    'VERSION_CODENAME=forky' \
    'ID=debian' > /etc/os-release

COPY --from=openssl-build /opt/openssl/lib/ /opt/clouddev-openssl/lib/
COPY --from=openssl-build /opt/openssl/bin/openssl /opt/clouddev-openssl/openssl
RUN set -eu \
  && case "$(dpkg --print-architecture)" in \
    amd64) libdir=/usr/lib/x86_64-linux-gnu ;; \
    arm64) libdir=/usr/lib/aarch64-linux-gnu ;; \
    *) echo "Unsupported library architecture" >&2; exit 1 ;; \
  esac \
  && cp -a /opt/clouddev-openssl/lib/. /tmp/clouddev-openssl-lib \
  && cp -a /opt/clouddev-openssl/openssl /tmp/clouddev-openssl \
  && dpkg --remove --force-depends openssl openssl-provider-legacy libssl3t64 \
  && cp -a /tmp/clouddev-openssl-lib/. "${libdir}/" \
  && install -m 0755 /tmp/clouddev-openssl /usr/bin/openssl \
  && ldconfig \
  && openssl version | grep -F 'OpenSSL 3.6.5'

USER node
