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

# Copy env placeholder for b　uild
COPY app/frontend/docker/.env.placeholder ./.env

# Build the application
RUN pnpm run build

# Run phase
FROM node:$NODE_VERSION AS runner

ARG COMMIT_HASH
ENV COMMIT_HASH=$COMMIT_HASH

LABEL org.opencontainers.image.source=https://github.com/xpadev-net/video-host
WORKDIR /app

# Copy built application and dependencies
# Copy standalone build
COPY --from=builder /app/app/frontend/.next/standalone ./
COPY --from=builder /app/app/frontend/public ./app/frontend/public
COPY --from=builder /app/app/frontend/.next/static ./app/frontend/.next/static
COPY --from=builder /app/app/frontend/start.sh ./

COPY app/frontend/docker/.env.placeholder ./.env
COPY app/frontend/docker/env-replacer.sh ./

RUN chmod +x ./env-replacer.sh
RUN chmod +x ./start.sh
ENTRYPOINT [ "/app/env-replacer.sh" ]

# Copy artifacts
CMD ["./start.sh"]