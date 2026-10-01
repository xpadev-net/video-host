# Video Host backend

Hono/Node.js 24, Prisma 6, MySQL 8, and Better Auth 1.7.7. Browser authentication uses database-backed HttpOnly cookies. Redis remains for video jobs/progress, not authentication sessions or OIDC state.

## Local development

Use Node 24 and the pinned pnpm 10.25.0. From the repository root:

    pnpm install --frozen-lockfile
    pnpm -F @video-host/backend prisma:generate
    NODE_ENV=development PORT=3001 DATABASE_URL=mysql://... pnpm dev:backend
    API_UPSTREAM_URL=http://127.0.0.1:3001 pnpm dev:frontend

The frontend runs on http://localhost:3000. Leave `VITE_API_ENDPOINT` empty; the Vite and production Nitro proxies forward only `/api/auth/*` and `/api/v4/*` to the server-only `API_UPSTREAM_URL`. Set `BETTER_AUTH_URL` and `FRONTEND_URL` to the browser's exact origin (http://localhost:3000), not the upstream backend address. Access the same hostname consistently: localhost and 127.0.0.1 are different cookie origins.

Provide your own disposable MySQL database and run `pnpm -F @video-host/backend exec prisma migrate deploy` before starting. Production cutover is described in [the migration guide](../../docs/better-auth-migration.md). Do not apply the destructive credential migration to an existing database without the guide's backup and ownership review.

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
| `PUBLIC_ENDPOINTS` | Optional comma-separated application API path prefixes; visibility/ownership guards still apply |
| `CALLBACK_SECRET`, `VOD_INTERNAL_SECRET` | Independent machine authentication secrets; not browser credentials |

Email/password signup requires name, a valid email address and an 8–128 character password. Email delivery/verification and password recovery are not configured by this migration; an email address is not proof of ownership. Automatic same-email OAuth account linking is disabled. Domain profile names and avatars remain application-owned after initial provisioning; Better Auth names are authentication metadata.

## OpenID Connect

Set `OIDC_ENABLED=true`, `OIDC_ISSUER_URL`, and `OIDC_CLIENT_ID`; set `OIDC_CLIENT_SECRET` for confidential clients. `OIDC_SCOPE` defaults to `openid profile email` and must include openid/email. The provider must return a valid email and publish usable issuer/JWKS metadata; ID tokens are verified and authorization code flow uses state, PKCE and nonce. Tokens must include finite numeric exp/iat, expire in the future and after iat; issued-at time may be at most 60 seconds ahead to allow small clock skew.

`OIDC_DISPLAY_NAME` controls the button label. `OIDC_AUTO_PROVISION=true` (default) allows first-time SSO users independently of password signup; set false to close that route. Setting `PASSWORD_AUTH_ENABLED=false` enables SSO-only mode. At least one method must be enabled.

The provider identifier derives from a hash of the configured issuer. Fetch `/api/v4/auth/config` and use its `ssoProviderId` to register the exact provider redirect URI:

    <BETTER_AUTH_URL>/api/auth/callback/<ssoProviderId>

Changing issuer changes the provider identity; do not repoint an existing identity mapping. `OIDC_REDIRECT_URI` is obsolete. `OIDC_ALLOW_HTTP=true` is permitted only in development, for a local test provider.

Explicit linking requires an existing authenticated session and verifies the initiating account again at callback completion. Signing out or switching accounts before callback rejects the link. The same-email implicit linking path and direct browser-supplied ID-token sign-in/link paths are blocked.

## Security boundaries

Application POST/PUT/PATCH/DELETE routes require an exact trusted Origin in addition to a valid cookie session. Non-browser clients must send the configured trusted Origin and a cookie; legacy JWT bearer access has been removed. Better Auth validates its own routes. FFmpeg callbacks and VOD mappings bypass browser auth only because their routes still require independent secrets.

Auth sessions are stored in MySQL, cookie caching is disabled, and logout revokes the database session. Browser JavaScript cannot read the session cookie. Rate-limit data is shared in the database across replicas. See the migration guide for proxy/IP trust and deployment verification requirements. Never expose database/storage credentials through VITE_ variables.

## Checks

    pnpm -F @video-host/backend test
    pnpm -F @video-host/backend build
    pnpm -F @video-host/frontend test
    pnpm lint
    pnpm typecheck
    pnpm build

Deterministic handler/unit tests are not a substitute for real MySQL, external IdP, or production ingress tests. The migration guide lists the required deployment checks.
