# Video Host

Video Host is a self-hosted media library. The frontend uses TanStack Start and React, the API uses Hono and Prisma, and an FFmpeg worker creates HLS renditions. Nginx with `nginx-vod-module` serves video from S3-compatible storage. MySQL stores application and authentication data; Redis carries encoding jobs and progress; S3-compatible object storage holds uploads and media.

## Requirements

- Node.js 22.12 (see `.nvmrc`) and pnpm 10.25.0 (the repository's package manager version)
- Docker Compose for MySQL 8.4, Redis, SeaweedFS's S3 API and the VOD server
- If running the worker directly on the host, `ffmpeg` and `ffprobe` on `PATH` (the worker image includes them)

## Local development

From the repository root, create the root Compose environment file and start the local dependencies:

```sh
cp .env.example .env
pnpm install --frozen-lockfile
pnpm exec lefthook install
docker compose up -d
```

Compose starts a disposable MySQL 8.4 database on `127.0.0.1:3306`; wait for `docker compose ps` to show `mysql` as healthy before applying migrations. The sample passwords in `.env` are for local development only.

Create the local service files by copying each example next to its package so the package process and Prisma can load it:

```sh
cp app/backend/.env.example app/backend/.env
cp app/ffmpeg-worker/.env.example app/ffmpeg-worker/.env
cp app/frontend/.env.example app/frontend/.env
```

Set `DATABASE_URL` in `app/backend/.env` to the Compose database (`mysql://video_host:video_host@127.0.0.1:3306/video_host`). Keep `CALLBACK_SECRET` the same in backend and worker files. The root `.env` configures Compose; the root `.env.example` is also a combined reference for environment managers, and pnpm package processes do not load it automatically. Then apply migrations and start services in separate terminals:

The local backend and worker examples use SeaweedFS's S3-compatible endpoint at `http://localhost:8333` with the local `admin` / `secret` sample credentials. Compose renders the canonical VOD Nginx template from `k8s/base/vod/nginx.conf.template`, using `VOD_INTERNAL_SECRET` from the root `.env` file. Keep that value identical to `VOD_INTERNAL_SECRET` in `app/backend/.env`; the package process does not read the root `.env`. Use only letters, digits, hyphens, and underscores in this secret. If you change `S3_ENDPOINT`, update the VOD renderer settings in `docker-compose.yml` as well.

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

The frontend is at <http://localhost:3000>, API at <http://localhost:3001>, VOD at <http://localhost:3002>, and the S3 API at <http://localhost:8333>. Compose only publishes service ports on loopback. This setup is for local development and must not be exposed to the public internet. See the service READMEs for [backend configuration](app/backend/README.md) and [frontend configuration](app/frontend/README.md).

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
