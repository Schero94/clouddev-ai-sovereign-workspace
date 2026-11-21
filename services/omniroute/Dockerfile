FROM diegosouzapw/omniroute:3.8.54@sha256:2c4c755a54f8ce5341bc1856580b71f47a0f16a9afab4a55f84d540810631f68

USER root

COPY --chown=node:node services/omniroute/healthcheck.mjs /opt/clouddev-healthcheck.mjs
RUN chmod 0444 /opt/clouddev-healthcheck.mjs

USER node
