# Video Host

Video Host is a self-hosted media library. The frontend uses TanStack Start and React, the API uses Hono and Prisma, and an FFmpeg worker creates HLS renditions. Nginx with `nginx-vod-module` serves video from S3-compatible storage. MySQL stores application and authentication data; Redis carries encoding jobs and progress; S3-compatible object storage holds uploads and media.

## Requirements

- Node.js 22.12 (see `.nvmrc`) and pnpm 10.25.0 (the repository's package manager version)
- Docker Compose for Redis, MinIO and the VOD server
- A disposable MySQL 8 database for the backend; the compose file does not start MySQL
- If running the worker directly on the host, `ffmpeg` and `ffprobe` on `PATH` (the worker image includes them)

## Local development

From the repository root:

```sh
pnpm install --frozen-lockfile
docker compose up -d
```

The compose stack does not include MySQL. For a disposable local database, run this in a separate terminal (or provide your own MySQL 8 instance):

```sh
docker run --name video-host-mysql --rm \
  -e MYSQL_ROOT_PASSWORD=local-root-password \
  -e MYSQL_DATABASE=video_host \
  -e MYSQL_USER=video_host \
  -e MYSQL_PASSWORD=video_host \
  -p 127.0.0.1:3306:3306 mysql:8.0
```

Create the local service files by copying each example next to its package so the package process and Prisma can load it:

```sh
cp app/backend/.env.example app/backend/.env
cp app/ffmpeg-worker/.env.example app/ffmpeg-worker/.env
cp app/frontend/.env.example app/frontend/.env
```

Set `DATABASE_URL` in `app/backend/.env` for the disposable database. Keep `CALLBACK_SECRET` the same in backend and worker files. The root `.env.example` is a combined reference for environment managers that inject variables into workspace commands; pnpm package processes do not load it automatically. Then apply migrations and start services in separate terminals:

The local backend example signs MinIO URLs for `http://localhost:9000`; the VOD container forwards them to the Compose service `minio:9000` while preserving the signed `Host`. If you change `S3_ENDPOINT`, update both `proxy_pass` targets and the `Host` header in `nginx/nginx.conf` to match the new endpoint.

```sh
pnpm -F @video-host/backend prisma:generate
pnpm -F @video-host/backend exec prisma migrate deploy
pnpm dev:backend
pnpm dev:frontend
```

To process uploads, start the worker as well:

```sh
pnpm -F @video-host/ffmpeg-worker dev
```

The frontend is at <http://localhost:3000>, API at <http://localhost:3001>, and VOD at <http://localhost:3002>. The MinIO console is at <http://localhost:9001> (local-only default credentials are shown in `docker-compose.yml`). The compose setup is for local development and must not be exposed to the public internet. See the service READMEs for [backend configuration](app/backend/README.md) and [frontend configuration](app/frontend/README.md).

## Checks

```sh
pnpm -F @video-host/backend test
pnpm -F @video-host/backend build
pnpm -F @video-host/frontend test
pnpm lint
pnpm typecheck
pnpm build
```

## Deployment

Kubernetes manifests are under `k8s/`. The production overlay expects externally managed MySQL, Redis, S3-compatible storage, and an Ingress. Set the production values in `k8s/overlays/prod/kustomization.yaml` and replace every `CHANGE_ME` secret; the files in `k8s/base/config` are reference samples and are not consumed by the production overlay. Never apply sample credentials to a live deployment. Render the overlay with `kubectl kustomize k8s/overlays/prod` before deployment. Authentication cutover, database backup requirements, OIDC configuration, and proxy trust are documented in [the Better Auth migration and deployment guide](docs/better-auth-migration.md). Release images are built by the GitHub Actions release workflow; see [CONTRIBUTING.md](CONTRIBUTING.md) before changing release configuration.

To publish a release, use **Actions → Release → Run workflow**. Choose the version bump (`patch`, `minor`, or `major`) and select which of the backend, frontend, and worker to release. Review the resulting workflow runs and image tags before deploying them.

## Security

Please report suspected vulnerabilities privately. See [SECURITY.md](SECURITY.md) for the reporting process.
