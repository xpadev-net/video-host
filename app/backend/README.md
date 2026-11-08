# Video Host backend

Hono/Node.js 22.23.4, Prisma 6, MySQL 8, and Better Auth 1.7.7. Browser authentication uses database-backed HttpOnly cookies. Redis remains for video jobs/progress, not authentication sessions or OIDC state.

## Local development

Use Node 22.23.4 and the pinned pnpm 10.25.0. Copy `app/backend/.env.example` to `app/backend/.env` and set `DATABASE_URL` to a disposable MySQL database before starting the backend. From the repository root:

    pnpm install --frozen-lockfile
    pnpm -F @video-host/backend prisma:generate
    NODE_ENV=development PORT=3001 DATABASE_URL=mysql://... pnpm dev:backend
    API_UPSTREAM_URL=http://127.0.0.1:3001 pnpm dev:frontend

The frontend runs on http://localhost:3000. Leave `VITE_API_ENDPOINT` empty; the Vite and production Nitro proxies forward only `/api/auth/*` and `/api/v4/*` to the server-only `API_UPSTREAM_URL`. Set `BETTER_AUTH_URL` and `FRONTEND_URL` to the browser's exact origin (http://localhost:3000), not the upstream backend address. Access the same hostname consistently: localhost and 127.0.0.1 are different cookie origins.

The root Compose file provides a disposable MySQL 8.4 database on `127.0.0.1:3306`; wait for its health check, then run `pnpm -F @video-host/backend exec prisma migrate deploy` before starting the backend directly. The container entrypoint holds a MySQL advisory lock on a dedicated connection while applying pending migrations, releases the lock, and only then serves requests. This serializes migration attempts from replicas starting together. Prisma CLI and the MySQL driver are included in the production image for this step. You can also point `DATABASE_URL` at another disposable MySQL 8 database. Production cutover is described in [the migration guide](../../docs/better-auth-migration.md). Back up production first, and use a maintenance window for migrations that are destructive or incompatible with the previous application version.

## Configuration

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | Required explicit development, test, or production mode |
| `BETTER_AUTH_SECRET` | At least 32 random characters, identical on all replicas; production rejects development and CHANGE_ME defaults |
| `BETTER_AUTH_URL` | Exact public browser origin, HTTPS in production; auth mounts at `/api/auth` |
| `FRONTEND_URL` | Exact frontend origin, HTTPS in production |
| `AUTH_TRUSTED_PROXY_CIDRS` | Required in production: comma-separated explicit frontend/ingress proxy IPs or CIDRs; no wildcard or /0; see cutover guide |
| `AUTH_TRUSTED_ORIGINS` | Optional comma-separated exact additional browser origins; wildcard origins are rejected |
| `CORS_ORIGIN` | Optional exact CORS origins; included in mutation/Better Auth trusted origins |
| `PASSWORD_AUTH_ENABLED` | Defaults true; false disables email/password authentication |
| `SIGNUP_ENABLED` | Defaults false; governs password signup |
| `SIGNUP_CODE` | Optional additional shared registration code, checked server-side |
| `MAX_UPLOAD_BYTES` | Maximum upload size in bytes (default 5 GiB, the S3 single-PUT limit; uploads are one presigned PUT). Bound into the presigned PUT URL and re-checked when an upload completes; k8s key `max-upload-bytes` |
| `PUBLIC_ENDPOINTS` | Optional comma-separated application API path prefixes; visibility/ownership guards still apply |
| `CALLBACK_SECRET`, `VOD_INTERNAL_SECRET` | Independent machine authentication secrets; not browser credentials |

Email/password signup requires name, a valid email address and an 8–128 character password. Email delivery/verification and password recovery are not configured by this migration; an email address is not proof of ownership. Automatic same-email OAuth account linking is disabled. Profile names and avatars are application-owned; Better Auth names are account authentication metadata. Profiles are created explicitly after login.

## Accounts and profiles

An account owns any number of profiles up to the configured profile limit.
`AuthUser` is the common account model: it holds the account role, optional
login email, credentials and sessions. `User` stores a profile, linked directly
by its required `accountId`. There is no system/user classification or separate
subaccount membership table. Every profile has the same visibility and content
ownership rules. There is no default profile. Accounts may have zero profiles; authentication
does not automatically create or select one. Each device explicitly selects a
profile and remembers that selection. Missing or invalid selections show the
profile picker, or the profile creation form when the account has none.

Administrators manage all accounts at `/api/v4/accounts` and can select an
account with `X-Account-Id`; `X-Profile-Id` must identify a profile belonging to
that account. Requests always use the authenticated account's permissions.
`/api/v4/accounts/me` returns that account independently of profile selection.
Profile-dependent protected APIs return 409 when `X-Profile-Id` is missing;
invalid or foreign selections return 403. Public reads remain available without
a selected profile and follow anonymous visibility rules.
`/api/v4/users/profiles` lists or creates profiles for the signed-in account;
an administrator can supply `accountId` to manage another account's profiles.
Creating an account from administration creates its first profile atomically;
login credentials are optional. Account deletion is blocked while its profiles
own content and cannot delete the signed-in account.

The schema migration keeps fresh database initialization through
`pnpm -F @video-host/backend exec prisma migrate deploy` and the container
entrypoint aligned with this model. It includes no existing-data backfill or
compatibility layer; existing populated databases are outside this change's
scope. Use a new disposable database to validate the complete migration history.

## Schema and search behavior

Deleting a movie cascades to its variants, viewer rows, and playlist entries; deleting a playlist cascades to its entries. Movie, series, and playlist ownership relations explicitly restrict deleting a user while owned content remains. Move or delete owned content before deleting its user. Before applying the variant uniqueness migration to an existing database, check for duplicate `(movieId, variantId)` groups and resolve any intentionally distinct rows:

```sql
SELECT `movieId`, `variantId`, COUNT(*) AS `count`
FROM `MovieVariant`
GROUP BY `movieId`, `variantId`
HAVING COUNT(*) > 1;
```

List search uses substring matching so it works on both MySQL and TiDB. The client generator provider is explicitly `prisma-client-js` while the Prisma CLI and client are pinned to the same Prisma 6 release; keep the provider explicit when changing Prisma versions.

CI applies migrations to a disposable MySQL 8 database and checks that the migration history matches `schema.prisma` by replaying migrations into a disposable shadow database. Run `pnpm -F @video-host/backend exec prisma migrate deploy` and `pnpm -F @video-host/backend prisma:schema-check` locally with `DATABASE_URL` and `SHADOW_DATABASE_URL` pointed at disposable databases.

## OpenID Connect

Set `OIDC_ENABLED=true`, `OIDC_ISSUER_URL`, and `OIDC_CLIENT_ID`; set `OIDC_CLIENT_SECRET` for confidential clients. `OIDC_SCOPE` defaults to `openid profile email` and must include openid/email. The provider must return a valid email and publish usable issuer/JWKS metadata; ID tokens are verified and authorization code flow uses state, PKCE and nonce. Tokens must include finite numeric exp/iat, expire in the future and after iat; issued-at time may be at most 60 seconds ahead to allow small clock skew.

`OIDC_DISPLAY_NAME` controls the button label. `OIDC_AUTO_PROVISION=true` (default) allows first-time SSO users independently of password signup; set false to close that route. Setting `PASSWORD_AUTH_ENABLED=false` enables SSO-only mode. At least one method must be enabled.

The provider identifier derives from a hash of the configured issuer. Fetch `/api/v4/auth/config` and use its `ssoProviderId` to register the exact provider redirect URI:

    <BETTER_AUTH_URL>/api/auth/callback/<ssoProviderId>

Changing issuer changes the provider identity; do not repoint an existing identity mapping. `OIDC_REDIRECT_URI` is obsolete. `OIDC_ALLOW_HTTP=true` is permitted only in development, for a local test provider.

Explicit linking requires an existing authenticated session and verifies the initiating account again at callback completion. Signing out or switching accounts before callback rejects the link. The same-email implicit linking path and direct browser-supplied ID-token sign-in/link paths are blocked.

## Security boundaries

Application POST/PUT/PATCH/DELETE routes require an exact trusted Origin in addition to a valid cookie session. Non-browser clients must send the configured trusted Origin and a cookie; legacy JWT bearer access has been removed. Better Auth validates its own routes. FFmpeg callbacks and VOD mappings bypass browser auth only because their routes still require independent secrets. VOD playback URLs returned by the API carry a short-lived HMAC token (`/vod/<token>/<s3Key>/master.m3u8`, bound to that key and signed with `VOD_INTERNAL_SECRET`, valid for 6–7 hours); the mapping endpoint rejects requests without a valid token, so knowing an `s3Key` is not enough to stream a PRIVATE or LIMITED movie. Existing stored `contentUrl` values need no migration: the token is added when the API serves them. Tokens are issued only in responses that already passed the visibility checks. `VOD_INTERNAL_SECRET` must be at least 32 random characters in production (it keys the HMAC and tokens appear in public URLs). Cached nginx mappings/manifests expire after 60 s, which bounds how long a cached response can outlive its token. Rolling out this change: old pods hand out unsigned URLs and do not understand tokenized ones, so briefly set `VOD_ALLOW_UNSIGNED=true` (k8s config key `vod-allow-unsigned`) while old and new pods coexist, then remove it.

Auth sessions are stored in MySQL, cookie caching is disabled, and logout revokes the database session. Browser JavaScript cannot read the session cookie. Rate-limit data is shared in the database across replicas. See the migration guide for proxy/IP trust and deployment verification requirements. Never expose database/storage credentials through VITE_ variables.

## Checks

    pnpm -F @video-host/backend test
    pnpm -F @video-host/backend build
    pnpm -F @video-host/frontend test
    pnpm lint
    pnpm typecheck
    pnpm build

Deterministic handler/unit tests are not a substitute for real MySQL, external IdP, or production ingress tests. The migration guide lists the required deployment checks.

## Middleware order

Authentication runs before `trimTrailingSlash`, deliberately: anonymous requests for a trailing-slash variant of a protected path get 401 rather than a redirect, so the redirect cannot be used to discover which routes exist. Only the exact `/api/v4/auth/config/` alias is public.
