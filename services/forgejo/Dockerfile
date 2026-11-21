FROM codeberg.org/forgejo/forgejo:17.0.2-rootless@sha256:39362ab93a94c0c9b8b330d2a877ddbb3f02fa8c0cba1b8d686d437b39f36a04

USER root
RUN apk add --no-cache postgresql17-client=17.12-r0 libxml2=2.13.9-r3 \
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
