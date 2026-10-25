FROM diegosouzapw/omniroute:3.8.52@sha256:b08a12e876baa8a5ccadd1ebbe346fe7267dba3b1c9f4fd6bb02070fae41ab6c

USER root

COPY --chown=node:node services/omniroute/healthcheck.mjs /opt/clouddev-healthcheck.mjs
RUN chmod 0444 /opt/clouddev-healthcheck.mjs

USER node
