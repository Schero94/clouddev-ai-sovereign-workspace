FROM node:24.22.1-bookworm-slim

ENV NODE_ENV=production \
    LAUNCHPAD_PORT=3002

WORKDIR /app
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public

USER node
EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3002/healthz').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"

CMD ["node", "src/server.mjs"]
