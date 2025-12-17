ARG NODE_VERSION=24-slim

# Build phase
FROM --platform=linux/amd64 node:$NODE_VERSION AS builder
WORKDIR /app

# Copy root workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY app/backend/package.json ./app/backend/
COPY app/backend/prisma ./app/backend/prisma/

RUN npm install -g pnpm@10 \
	&& pnpm install --frozen-lockfile --ignore-scripts --filter @video-host/backend

# Generate Prisma client
WORKDIR /app/app/backend
WORKDIR /app/app/backend
COPY app/backend/ .
RUN pnpm exec prisma generate
RUN pnpm run build

# Run phase
FROM --platform=linux/amd64 node:$NODE_VERSION AS runner

ARG COMMIT_HASH
ENV COMMIT_HASH=$COMMIT_HASH

LABEL org.opencontainers.image.source=https://github.com/xpadev-net/video-host

WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl && npm install -g pnpm@10

COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=builder /app/app/backend/package.json ./app/backend/
COPY --from=builder /app/app/backend/prisma ./app/backend/prisma/

# Install production dependencies only
RUN pnpm install --prod --ignore-scripts --filter @video-host/backend

# Copy built artifacts
COPY --from=builder /app/app/backend/dist ./app/backend/dist
COPY --from=builder /app/app/backend/start.sh ./app/backend/start.sh

WORKDIR /app/app/backend

# Generate Prisma Client for production
RUN pnpm exec prisma generate

RUN chmod +x ./start.sh

CMD ["./start.sh"]
