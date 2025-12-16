ARG NODE_VERSION=24-slim

# Build phase
FROM --platform=linux/amd64 node:$NODE_VERSION AS builder
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm@9 \
	&& pnpm install --frozen-lockfile

# Prepare node_modules
COPY ./ ./

# Run phase
FROM --platform=linux/amd64 node:$NODE_VERSION AS runner

LABEL org.opencontainers.image.source=https://github.com/xpadev-net/video-host-api

WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl

COPY --from=builder /app ./

# Copy artifacts
CMD ["/bin/bash","./start.sh"]
