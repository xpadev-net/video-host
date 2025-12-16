ARG NODE_VERSION=24-alpine

# Build phase
FROM node:$NODE_VERSION AS builder
WORKDIR /app

# Copy root workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY app/frontend/package.json ./app/frontend/

RUN npm install -g pnpm@10
RUN pnpm install --frozen-lockfile --ignore-scripts --filter @video-host/frontend

# Copy frontend source
COPY app/frontend/ ./app/frontend/

WORKDIR /app/app/frontend

# Run phase
FROM node:$NODE_VERSION AS runner

LABEL org.opencontainers.image.source=https://github.com/xpadev-net/video-host
WORKDIR /app

COPY --from=builder /app/app/frontend ./

COPY app/frontend/docker/.env.placeholder ./.env

RUN npm run build

COPY app/frontend/docker/env-replacer.sh ./

RUN chmod +x ./env-replacer.sh
RUN chmod +x ./start.sh
ENTRYPOINT [ "/app/env-replacer.sh" ]

# Copy artifacts
CMD ["./start.sh"]