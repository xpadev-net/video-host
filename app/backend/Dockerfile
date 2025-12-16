ARG NODE_VERSION=24-slim

# Build phase
FROM --platform=linux/amd64 node:$NODE_VERSION AS builder
WORKDIR /app

# Copy root workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY app/backend/package.json ./app/backend/

RUN npm install -g pnpm@10 \
	&& pnpm install --frozen-lockfile --filter @video-host/backend

# Copy backend source
COPY app/backend/ ./app/backend/

WORKDIR /app/app/backend

# Run phase
FROM --platform=linux/amd64 node:$NODE_VERSION AS runner

LABEL org.opencontainers.image.source=https://github.com/xpadev-net/video-host

WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl

COPY --from=builder /app/app/backend ./

# Copy artifacts
CMD ["/bin/bash","./start.sh"]
