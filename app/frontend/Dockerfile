ARG NODE_VERSION=24-alpine

# Build phase
FROM node:$NODE_VERSION AS builder
WORKDIR /app

# Copy root workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY app/frontend/package.json ./app/frontend/
COPY app/backend/package.json ./app/backend/

RUN npm install -g pnpm@10
RUN pnpm install --frozen-lockfile --ignore-scripts --filter @video-host/frontend --filter @video-host/backend

# Copy frontend source
COPY app/frontend/ ./app/frontend/
COPY app/backend/ ./app/backend/

RUN pnpm run prisma:generate

# Copy env placeholder for build
COPY app/frontend/docker/.env.placeholder ./app/frontend/.env

RUN pnpm -F @video-host/backend build
RUN pnpm -F @video-host/frontend build

# Run phase
FROM node:$NODE_VERSION AS runner

ARG COMMIT_HASH
ENV COMMIT_HASH=$COMMIT_HASH
ENV HOST=0.0.0.0
ENV PORT=3000

LABEL org.opencontainers.image.source=https://github.com/xpadev-net/video-host
WORKDIR /app

# Nitro's output is standalone and includes the public client assets.
COPY --from=builder /app/app/frontend/.output ./app/frontend/.output
COPY --from=builder /app/app/frontend/start.sh ./

COPY app/frontend/docker/env-replacer.sh ./

RUN chmod +x ./env-replacer.sh
RUN chmod +x ./start.sh
ENTRYPOINT [ "/app/env-replacer.sh" ]
EXPOSE 3000

CMD ["./start.sh"]
