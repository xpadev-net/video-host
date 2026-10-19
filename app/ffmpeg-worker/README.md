# FFmpeg worker

The worker reads encoding jobs from Redis, downloads source media from S3-compatible storage, creates HLS renditions with FFmpeg, stores the result, and reports completion to the backend. It runs separately from the backend and frontend.

## Local development

Use Node.js 22.12, pnpm 10.25.0, and FFmpeg with `ffmpeg` and `ffprobe` on `PATH` (for example, install `ffmpeg` with Homebrew on macOS or your distribution's package manager on Linux). From the repository root, start the local dependencies with `docker compose up -d`, then copy `app/ffmpeg-worker/.env.example` to `app/ffmpeg-worker/.env`. Set its `CALLBACK_SECRET` to the same value used by the backend.

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
| `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`, `OTEL_SERVICE_NAME` | Optional OpenTelemetry metrics export configuration |

See the backend README for callback security and the root README for the local service topology.

The worker accepts MP4/MOV, Matroska/WebM, AVI, MPEG-TS/PS, FLV, and ASF inputs up to 3840×2160 and two hours. HLS playlists and concat inputs are rejected; the transcoder also restricts input protocols to local files and crypto wrappers.
