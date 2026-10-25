# FFmpeg worker

The worker reads encoding jobs from Redis, downloads source media from S3-compatible storage, creates HLS renditions with FFmpeg, stores the result, and reports completion to the backend. It runs separately from the backend and frontend.

## Local development

Use Node.js 22.23.4, pnpm 10.25.0, and FFmpeg with `ffmpeg` and `ffprobe` on `PATH` (for example, install `ffmpeg` with Homebrew on macOS or your distribution's package manager on Linux). From the repository root, start the local dependencies with `docker compose up -d`, then copy `app/ffmpeg-worker/.env.example` to `app/ffmpeg-worker/.env`. Set its `CALLBACK_SECRET` to the same value used by the backend.

```sh
pnpm install --frozen-lockfile
pnpm -F @video-host/ffmpeg-worker dev
```

The root `.env.example` is a combined reference for environment managers that inject variables into workspace commands; pnpm package processes do not load it automatically. Local SeaweedFS S3 credentials and development secrets are only for a private local setup; replace them before deployment. The worker container image installs FFmpeg itself; the host-based command above requires both binaries to be installed locally.

## Configuration

| Variable | Purpose |
| --- | --- |
| `REDIS_URL` | Redis queue and progress connection; defaults to local Redis |
| `REDIS_SENTINEL_HOSTS`, `REDIS_SENTINEL_NAME`, `REDIS_SENTINEL_PASSWORD` | Optional Redis Sentinel configuration |
| `S3_TMP_BUCKET`, `S3_PROD_BUCKET`, `S3_REGION` | Source and output bucket names and AWS region |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT`, `S3_FORCE_PATH_STYLE` | S3-compatible credentials and endpoint; endpoint/path-style settings support the local SeaweedFS S3 API |
| `BACKEND_BASE_URL`, `CALLBACK_SECRET` | Backend base URL (including any deployment path prefix) and shared machine secret for completion callbacks |
| `VOD_BASE_URL` | Browser-reachable public VOD origin, without a trailing `/vod` path |
| `POLL_INTERVAL_MS`, `TEMP_DIR`, `MIN_DISK_SPACE_GB`, `JOB_TIMEOUT_SECONDS`, `FFMPEG_THREADS` | Queue polling and local encoding resource limits |
| `LOG_LEVEL` | Structured worker log threshold; defaults to `info` |
| `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`, `OTEL_SERVICE_NAME` | Optional OpenTelemetry metrics export configuration |

Worker logs are JSON with service/version fields. Claimed job logs also include `movieId`, `claimId`, `retryCount`, and `s3Key`. The worker exposes queue and scratch disk gauges, job/stage duration histograms, input size and FFmpeg speed histograms, callback failure counters, and reaper recovery counters when metrics export is configured.

See the backend README for callback security and the root README for the local service topology.

## Worker checks

Run the worker lint, formatting, typecheck, and test commands from the repository root. Queue integration tests connect to the Redis URL in `REDIS_URL` (default `redis://127.0.0.1:6379`); start Redis before running them. Invalid numeric settings, boolean flags, and log levels fail at startup with the offending environment variable named in the error.

```sh
pnpm -F @video-host/ffmpeg-worker lint
pnpm -F @video-host/ffmpeg-worker format:check
pnpm -F @video-host/ffmpeg-worker typecheck
pnpm -F @video-host/ffmpeg-worker test
```

The worker accepts MP4/MOV, Matroska/WebM, AVI, MPEG-TS/PS, FLV, and ASF inputs up to 3840×2160 and two hours. HLS playlists and concat inputs are rejected; the transcoder also restricts input protocols to local files and crypto wrappers. Outputs are H.264 High/yuv420p at up to 1080p with 48 kHz stereo AAC, and HDR sources are tone-mapped to BT.709.

The worker image pins the Debian Bookworm FFmpeg package and checks that its `zscale` filter is available for HDR tone mapping. Update `FFMPEG_PACKAGE_VERSION` in the Dockerfile when changing that runtime dependency.

## Retry and dead-letter queues

Transient failures are retried up to `MAX_RETRY_COUNT` (currently three retries) with 1, 2, and 4 minute delays. Timeouts, invalid media, oversized inputs, and exhausted retries are written to the `video:encode:dead` sorted set with a reason and, when available, the stderr tail. The set retains the newest 10,000 entries. Disk pressure defers a job for one minute without consuming a retry. Malformed queue entries are dead-lettered with their raw payload.

Inspect dead letters with `redis-cli ZRANGE video:encode:dead 0 -1`. For a valid entry, use its `job` object to create a fresh encode queue message after addressing the recorded cause. A manually requeued message must include `movieId`, `s3Key`, `userId`, and `createdAt`; reset or omit `retryCount` to give it a fresh retry budget. Malformed entries store the original payload under `raw` and need to be repaired before requeueing.
