FROM codeberg.org/forgejo/forgejo:17.0.0-rootless@sha256:6554520f7574602100b7d6620c6ac5b18cec30325f823777497eac36234f5cf8

USER root
RUN apk add --no-cache postgresql17-client=17.11-r0 \
    && mkdir -p /usr/local/share/clouddev

COPY --chown=root:root entrypoint.sh /usr/local/bin/clouddev-forgejo-entrypoint.sh
COPY --chown=root:root bootstrap.sql /usr/local/share/clouddev/forgejo-bootstrap.sql
RUN chmod 0555 /usr/local/bin/clouddev-forgejo-entrypoint.sh \
    && chmod 0444 /usr/local/share/clouddev/forgejo-bootstrap.sql

ENV FORGEJO____APP_NAME="CloudDev AI - Sovereign Workspace"
ENV FORGEJO____RUN_MODE=prod
ENV FORGEJO__database__DB_TYPE=postgres
ENV FORGEJO__security__INSTALL_LOCK=true
ENV FORGEJO__service__DISABLE_REGISTRATION=true
ENV FORGEJO__service__REQUIRE_SIGNIN_VIEW=true
ENV FORGEJO__repository__DEFAULT_PRIVATE=private
ENV FORGEJO__server__DISABLE_SSH=true

VOLUME ["/var/lib/gitea"]
EXPOSE 3000 2222

HEALTHCHECK --interval=30s --timeout=8s --start-period=90s --retries=3 \
  CMD ["/usr/bin/curl", "--fail", "--silent", "--show-error", "--max-time", "5", "http://127.0.0.1:3000/api/healthz"]

USER 1000:1000
ENTRYPOINT ["/usr/bin/dumb-init", "--", "/usr/local/bin/clouddev-forgejo-entrypoint.sh"]
