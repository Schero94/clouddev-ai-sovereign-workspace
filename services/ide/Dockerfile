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

FROM node:24.22.0-bookworm-slim@sha256:91acba91b842bec0bf7ea6f5e09c644c7ccad72c4996ed9616d861d1c7cd60d4 AS node-runtime
FROM caddy:2.11.7-alpine@sha256:eb4d35b7452d1ab6171fbdbe8d9275b2301dad6dad92115d91e19fb9b24d510f AS caddy-runtime

FROM codercom/code-server:4.143.1@sha256:377b66bec5645510ed52549bb00e648c273edc604d230a3f90fd2b2433afcb97

USER root
ENV DEBIAN_FRONTEND=noninteractive

# The official code-server image includes passwordless sudo and fixuid. Neither
# is needed by the root bootstrap, which drops privileges before starting apps.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    build-essential \
    ca-certificates \
    curl \
    git \
    openssh-client \
    openssh-server \
    python3 \
    python3-venv \
    tmux \
    util-linux \
  && SUDO_FORCE_REMOVE=yes apt-get purge -y sudo \
  && rm -f /usr/local/bin/fixuid /etc/fixuid/config.yml /etc/sudoers.d/nopasswd \
  && rm -rf /var/lib/apt/lists/*

COPY --from=node-runtime /usr/local/ /usr/local/
COPY --from=caddy-runtime /usr/bin/caddy /usr/bin/caddy

RUN groupadd --gid 1001 caddy \
  && useradd --uid 1001 --gid 1001 --home-dir /workspace/system/caddy --shell /usr/sbin/nologin --no-create-home caddy \
  && groupadd --gid 1002 launchpad \
  && useradd --uid 1002 --gid 1002 --home-dir /workspace/system/launchpad --shell /usr/sbin/nologin --no-create-home launchpad \
  && usermod --home /workspace/home coder \
  && install -d -o root -g root -m 0755 /opt/clouddev-ide /opt/clouddev-launchpad

WORKDIR /opt/clouddev-ide
COPY services/ide/agent-tools/package.json services/ide/agent-tools/package-lock.json /opt/clouddev-ide/agent-tools/
RUN npm ci --prefix /opt/clouddev-ide/agent-tools --no-audit --no-fund

COPY services/ide/cloudcli-ui/package.json services/ide/cloudcli-ui/package-lock.json /opt/clouddev-ide/cloudcli-ui/
RUN npm ci --prefix /opt/clouddev-ide/cloudcli-ui --omit=dev --no-audit --no-fund

COPY services/ide/omniroute-cli/package.json services/ide/omniroute-cli/package-lock.json /opt/clouddev-ide/omniroute-cli/
# OmniRoute's run integration needs its pinned CLI bundle and platform esbuild
# binary, not the CLI's optional local inference/database install features.
RUN npm ci --prefix /opt/clouddev-ide/omniroute-cli --omit=optional --ignore-scripts --no-audit --no-fund
COPY services/ide/esbuild-runtime/package.json services/ide/esbuild-runtime/package-lock.json /opt/clouddev-ide/esbuild-runtime/
RUN npm ci --prefix /opt/clouddev-ide/esbuild-runtime --no-audit --no-fund \
  && install -d /opt/clouddev-ide/omniroute-cli/node_modules/@esbuild \
  && case "$(dpkg --print-architecture)" in \
    amd64) ln -s /opt/clouddev-ide/esbuild-runtime/node_modules/@esbuild/linux-x64 /opt/clouddev-ide/omniroute-cli/node_modules/@esbuild/linux-x64 ;; \
    arm64) ln -s /opt/clouddev-ide/esbuild-runtime/node_modules/@esbuild/linux-arm64 /opt/clouddev-ide/omniroute-cli/node_modules/@esbuild/linux-arm64 ;; \
    *) echo "Unsupported architecture for the pinned OmniRoute CLI runtime." >&2; exit 1 ;; \
  esac \
  && /opt/clouddev-ide/omniroute-cli/node_modules/.bin/omniroute --version >/dev/null \
  && /usr/bin/caddy version | grep -F 'v2.11.7' >/dev/null

RUN install -d -o root -g root -m 0755 /opt/clouddev-ide/extension-seed \
  && code-server --extensions-dir /opt/clouddev-ide/extension-seed --install-extension redhat.vscode-yaml@2.1.2026102308 \
  && code-server --extensions-dir /opt/clouddev-ide/extension-seed --install-extension usernamehw.errorlens@3.30.0 \
  && code-server --extensions-dir /opt/clouddev-ide/extension-seed --install-extension tamasfe.even-better-toml@0.21.2 \
  && chown -R root:root /opt/clouddev-ide/extension-seed \
  && chmod -R a+rX /opt/clouddev-ide/extension-seed

COPY services/ide/src/ /opt/clouddev-ide/src/
COPY services/ide/scripts/ /opt/clouddev-ide/scripts/
COPY services/ide/test/ /opt/clouddev-ide/test/
COPY services/ide/Caddyfile.template /opt/clouddev-ide/Caddyfile.template
COPY services/ide/bashrc /opt/clouddev-ide/bashrc
COPY services/ide/entrypoint.sh /opt/clouddev-ide/entrypoint.sh
COPY services/ide/sshd_config /etc/ssh/sshd_config
COPY services/launchpad/src/ /opt/clouddev-launchpad/src/
COPY services/launchpad/public/ /opt/clouddev-launchpad/public/

RUN chmod 0755 /opt/clouddev-ide/entrypoint.sh /opt/clouddev-ide/scripts/* \
  && install -m 0755 /opt/clouddev-ide/scripts/ai-codex /usr/local/bin/ai-codex \
  && install -m 0755 /opt/clouddev-ide/scripts/ai-claude /usr/local/bin/ai-claude \
  && install -m 0755 /opt/clouddev-ide/scripts/ai-status /usr/local/bin/ai-status \
  && install -m 0755 /opt/clouddev-ide/scripts/ai-models /usr/local/bin/ai-models \
  && install -m 0755 /opt/clouddev-ide/scripts/ai-setup /usr/local/bin/ai-setup \
  && install -m 0755 /opt/clouddev-ide/scripts/git-setup /usr/local/bin/git-setup \
  && install -m 0755 /opt/clouddev-ide/scripts/clouddev-tasks /usr/local/bin/clouddev-tasks \
  && install -m 0755 /opt/clouddev-ide/entrypoint.sh /usr/local/bin/clouddev-ide-entrypoint

# code-server 4.143.1 vendors shell-quote 1.10.0 in its VS Code dependency
# tree. Replace that compatible runtime dependency with patched 1.11.0. Verify
# the immutable npm tarball before extracting it, and do not run lifecycle code.
RUN set -eu; \
  curl -fsSL https://registry.npmjs.org/shell-quote/-/shell-quote-1.11.0.tgz -o /tmp/shell-quote-1.11.0.tgz; \
  actual_sha512=$(sha512sum /tmp/shell-quote-1.11.0.tgz | cut -d ' ' -f 1); \
  expected_sha512=25dc433c3d03053caed3ca6ad243c2d3148d7adfeab14d3ba93e88b17d404bca0ed8808d458e2574d6bc38023a3eec001fcb46de5c4485baa6ca9e03c38d37ea; \
  [ "$actual_sha512" = "$expected_sha512" ] || { echo "shell-quote integrity check failed" >&2; exit 1; }; \
  mkdir -p /tmp/clouddev-shell-quote; \
  tar -xzf /tmp/shell-quote-1.11.0.tgz -C /tmp/clouddev-shell-quote; \
  node -e "if(require('/tmp/clouddev-shell-quote/package/package.json').version !== '1.11.0') process.exit(1)"; \
  rm -rf /usr/lib/code-server/lib/vscode/node_modules/shell-quote; \
  mv /tmp/clouddev-shell-quote/package /usr/lib/code-server/lib/vscode/node_modules/shell-quote; \
  node -e "if(require('/usr/lib/code-server/lib/vscode/node_modules/shell-quote/package.json').version !== '1.11.0') process.exit(1)"; \
  rm -rf /tmp/clouddev-shell-quote /tmp/shell-quote-1.11.0.tgz

# Same package upgrade and OpenSSL replacement as the router image. Debian 13
# has no fixed packages for the current high findings. OpenSSL 3.6.5 plus
# commit f3acb0a replaces the one finding that forky still ships.
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
  && openssl version | grep -F 'OpenSSL 3.6.5' \
  && dpkg --remove --force-depends linux-libc-dev libperl5.40 perl-modules-5.40

ENV HOME=/workspace/home \
    USER=coder \
    LOGNAME=coder \
    CODEX_HOME=/workspace/home/.codex \
    CLAUDE_CONFIG_DIR=/workspace/home/.claude \
    OMNIROUTE_CLI_HOME=/workspace/home/.config/omniroute \
    CLOUDDEV_OMNIROUTE_BASE_URL=http://127.0.0.1:20129 \
    CLOUDDEV_PROJECTS_DIR=/workspace/projects \
    PATH=/opt/clouddev-ide/agent-tools/node_modules/.bin:/opt/clouddev-ide/omniroute-cli/node_modules/.bin:/usr/local/bin:/workspace/home/.local/bin:/usr/bin:/bin

WORKDIR /workspace/projects
VOLUME ["/workspace"]
EXPOSE 8080 2222
ENTRYPOINT ["/usr/local/bin/clouddev-ide-entrypoint"]

HEALTHCHECK --interval=30s --timeout=8s --start-period=45s --retries=3 \
  CMD ["/usr/local/bin/node", "/opt/clouddev-ide/src/healthcheck.mjs"]
