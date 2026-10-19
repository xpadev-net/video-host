ARG NODE_VERSION=22.12.0-bookworm-slim

FROM node:${NODE_VERSION} AS builder
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN npm install --global corepack@0.34.5 \
    && corepack enable
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY app/contracts/package.json ./app/contracts/
COPY app/backend/package.json ./app/backend/
COPY app/backend/prisma ./app/backend/prisma/
RUN pnpm install --frozen-lockfile --ignore-scripts --filter @video-host/backend

COPY app/contracts/ ./app/contracts/
COPY app/backend/ ./app/backend/
RUN pnpm --filter @video-host/backend build
RUN pnpm --filter @video-host/backend --prod deploy --legacy /prod/backend
RUN pnpm --filter @video-host/backend exec prisma generate --schema=/prod/backend/prisma/schema.prisma

FROM node:${NODE_VERSION} AS runner
ARG COMMIT_HASH
ENV COMMIT_HASH=$COMMIT_HASH
LABEL org.opencontainers.image.source=https://github.com/xpadev-net/video-host
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder /prod/backend/ ./
RUN chmod +x ./start.sh
USER node
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT || 3000}/healthz`).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
EXPOSE 3000
CMD ["./start.sh"]
