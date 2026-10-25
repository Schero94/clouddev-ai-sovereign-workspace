FROM node:24.22.0-bookworm-slim

USER root
RUN install -d -o 1000 -g 1000 /opt/clouddev-mock-llm
COPY --chown=1000:1000 tests/mock-llm/server.mjs /opt/clouddev-mock-llm/server.mjs

USER 1000:1000
WORKDIR /opt/clouddev-mock-llm
ENV PORT=18080
EXPOSE 18080
CMD ["node", "/opt/clouddev-mock-llm/server.mjs"]

HEALTHCHECK --interval=5s --timeout=2s --start-period=2s --retries=10 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:18080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
