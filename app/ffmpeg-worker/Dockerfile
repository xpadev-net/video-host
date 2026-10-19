ARG NODE_VERSION=22.12.0-bookworm-slim
ARG FFMPEG_PACKAGE_VERSION=7:5.1.9-0+deb12u1

FROM node:${NODE_VERSION} AS builder
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN npm install --global corepack@0.34.5 \
    && corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY app/contracts/package.json ./app/contracts/
COPY app/ffmpeg-worker/package.json ./app/ffmpeg-worker/
RUN pnpm install --frozen-lockfile --ignore-scripts --filter @video-host/ffmpeg-worker
COPY app/contracts/ ./app/contracts/
COPY app/ffmpeg-worker/ ./app/ffmpeg-worker/
RUN pnpm --filter @video-host/ffmpeg-worker build
RUN pnpm --filter @video-host/ffmpeg-worker --prod deploy --legacy /prod/worker

FROM node:${NODE_VERSION} AS runner
ARG FFMPEG_PACKAGE_VERSION
ARG COMMIT_HASH
ENV COMMIT_HASH=$COMMIT_HASH
LABEL org.opencontainers.image.source=https://github.com/xpadev-net/video-host
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends "ffmpeg=${FFMPEG_PACKAGE_VERSION}" \
    && ffmpeg -hide_banner -filters 2>&1 | grep -Eq ' zscale ' \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder /prod/worker/ ./
ENV TEMP_DIR=/tmp/ffmpeg-worker
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "try { const dir = (process.env.TEMP_DIR || '').trim() || '/tmp/ffmpeg-worker'; const age = Date.now() - require('node:fs').statSync(dir + '/healthy').mtimeMs; process.exit(age < 45000 ? 0 : 1); } catch { process.exit(1); }"]
USER node
WORKDIR /app
CMD ["node", "dist/index.js"]
