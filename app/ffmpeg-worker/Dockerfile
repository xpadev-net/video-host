FROM node:22-slim

ARG COMMIT_HASH
ENV COMMIT_HASH=$COMMIT_HASH

# Install ffmpeg
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy root workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY app/ffmpeg-worker/package.json ./app/ffmpeg-worker/

# Install pnpm and dependencies
RUN npm install -g pnpm@10 \
    && pnpm install --frozen-lockfile --ignore-scripts --filter @video-host/ffmpeg-worker

# Copy source
COPY app/ffmpeg-worker/ ./app/ffmpeg-worker/

WORKDIR /app/app/ffmpeg-worker

# Start worker
CMD ["pnpm", "start"]
