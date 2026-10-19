ARG NODE_VERSION=22.12.0-bookworm-slim

FROM node:${NODE_VERSION} AS builder
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN npm install --global corepack@0.34.5 \
    && corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY app/ffmpeg-worker/package.json ./app/ffmpeg-worker/
RUN pnpm install --frozen-lockfile --ignore-scripts --filter @video-host/ffmpeg-worker
COPY app/ffmpeg-worker/ ./app/ffmpeg-worker/
RUN pnpm --filter @video-host/ffmpeg-worker build
RUN pnpm --filter @video-host/ffmpeg-worker --prod deploy --legacy /prod/worker

FROM node:${NODE_VERSION} AS runner
ARG COMMIT_HASH
ENV COMMIT_HASH=$COMMIT_HASH
LABEL org.opencontainers.image.source=https://github.com/xpadev-net/video-host
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder /prod/worker/ ./
USER node
WORKDIR /app
CMD ["node", "dist/index.js"]
