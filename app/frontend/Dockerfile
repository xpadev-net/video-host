ARG NODE_VERSION=22.12.0-bookworm-slim

FROM node:${NODE_VERSION} AS builder
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN npm install --global corepack@0.34.5 \
    && corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY app/frontend/package.json ./app/frontend/
COPY app/backend/package.json ./app/backend/
RUN pnpm install --frozen-lockfile --ignore-scripts --filter @video-host/frontend --filter @video-host/backend
COPY app/frontend/ ./app/frontend/
COPY app/backend/ ./app/backend/
RUN pnpm --filter @video-host/backend build
COPY app/frontend/docker/.env.placeholder ./app/frontend/.env
RUN pnpm --filter @video-host/frontend build

FROM node:${NODE_VERSION} AS runner
ARG COMMIT_HASH
ENV COMMIT_HASH=$COMMIT_HASH
ENV HOST=0.0.0.0
ENV PORT=3000
LABEL org.opencontainers.image.source=https://github.com/xpadev-net/video-host
WORKDIR /app
COPY --from=builder --chown=node:node /app/app/frontend/.output ./app/frontend/.output
COPY --from=builder --chown=node:node /app/app/frontend/start.sh ./start.sh
COPY --chown=node:node app/frontend/docker/env-replacer.sh ./env-replacer.sh
COPY --chown=node:node app/frontend/docker/replace-runtime-env.mjs ./replace-runtime-env.mjs
RUN chmod +x ./env-replacer.sh ./start.sh
ENTRYPOINT ["/app/env-replacer.sh"]
EXPOSE 3000
USER node
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["./start.sh"]
