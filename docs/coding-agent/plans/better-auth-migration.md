# Replace custom authentication with Better Auth

This living ExecPlan follows `.agent/PLANS.md`. The implementation starts from master `a8e39fb95fe08a3f306d3714e467b36824d560bc` in a fresh isolated checkout on `feat/better-auth-migration`. Local implementation was completed first. The user subsequently authorized publishing a draft pull request through the connected GitHub integration after GitHub CLI authentication proved unavailable; merge and deployment remain outside scope.

## Purpose / Big Picture

Users sign in with email/password or a configured OpenID Connect identity provider. Better Auth owns password hashing, cookie sessions, and provider state. The application's existing authors, roles, visibility, movie viewers, and system-posting rights stay separate from authentication. Browser JavaScript no longer stores or transmits bearer tokens.

## Progress

- [x] (2026-10-01 06:00Z) Cloned and verified clean baseline, read repository rules, checked current Better Auth stable release 1.7.7
- [x] (2026-10-01 06:06Z) Added separate authentication schema, drafted core integration, converted domain SYSTEM checks, removed custom user signup route, and added explicit production origin/secret validation
- [x] (2026-10-01 06:15Z) Auth core, frontend cookie client, same-origin proxy, safe explicit provider linking, and deterministic signed OIDC tests implemented
- [x] (2026-10-01 06:15Z) Wrote migration/cutover guide and deployment configuration; rendered 15 Kubernetes objects and verified required environment references
- [x] (2026-10-01 06:29Z) Ran 129 backend tests and backend build; frontend now has 7 unit tests, proxy smoke and 4 production runtime-environment tests; frozen install, Prisma validation and workspace checks passed; visual browser probe remains access-blocked
- [x] (2026-10-01 06:29Z) Independent security review completed; exact-sub hashing, strict token lifetime checks, placeholder/boolean runtime parsing and a single fail-closed session profile gate added and reviewed
- [x] (2026-10-01 06:29Z) Recorded passing evidence and real-service limits in docs/validation/better-auth.md

- [x] (2026-10-01 09:43Z) Published PR61 through connected GitHub APIs; exact remote tree verified and all 10 initial CI jobs passed
- [x] (2026-10-01 10:16Z) Implemented transport-anchored per-client rate limiting and exact config trailing-slash regression; CodeRabbit withdrew the loading-guard false positive; 174 backend tests and updated frontend/proxy checks pass
- [ ] Publish reviewed revision and verify subsequent CI/reviews until no actionable findings remain

## Surprises & Discoveries

The checked-in frontend is TanStack Start/Router with Nitro, not Next.js. No `rtk` executable is installed, so commands use the underlying tools. The preinstalled pnpm is 11, while the repository pins 10.25.0; commands explicitly use Corepack's pinned pnpm and writable temporary caches. Node is 24.19.0. Docker, MySQL, Redis-server, kubectl, and kustomize were not found in PATH. Kustomize 5.7.1 was subsequently downloaded from the official Kubernetes SIG release into /tmp and verified against its published SHA-256 digest; the prod overlay rendered successfully. Real database and external provider checks must not be claimed from mock tests. Cloud browser navigation to the local app was blocked with net::ERR_BLOCKED_BY_CLIENT; no alternate browser route was used to bypass the restriction. Built Nitro HTTP smoke tests against a synthetic upstream cover proxy mechanics, not visual browser interaction.

## Decision Log

- Decision: pin Better Auth 1.7.7 in backend and frontend. Rationale: verified current stable npm release and current official OAuth security APIs on 2026-10-01
- Decision: use AuthUser/AuthAccount/AuthSession/AuthVerification plus a nullable unique domain User.authUserId. Rationale: system authors need no email or login and must not be mistaken for passwordless SSO people
- Decision: require email/password signup or an email-bearing IdP. Rationale: avoid fake address semantics and preserve library defaults
- Decision: force fresh authentication after cutover; preserve domain user IDs and content rather than mapping by email or username. Rationale: clean breaking migration is approved; implicit remapping risks ownership takeover
- Decision: prefer same-origin /api proxy with server-only upstream configuration. Rationale: HttpOnly host cookies, HLS, and event streams can share one origin without cross-site cookie dependence

## Outcomes & Retrospective

Local implementation is complete and aggregate checks pass. Independent review found no remaining security blocker after final hardening. Production MySQL, real IdP, container and visual browser checks remain release gates. At the local-validation checkpoint, nothing had been pushed, deployed, or applied to a real database. Publication and remote CI results are recorded separately in the pull request.

## Context and Orientation

`app/backend/src/routes/api/v4` contains application APIs. Their authorization reads the domain `User` model. `app/backend/prisma/schema.prisma` also holds movies, series, playlists, and viewers. `app/backend/src/lib/auth.ts` owns Better Auth; its handler is mounted at `/api/auth/*`. `/api/v4/auth/config` is public configuration. `app/frontend/src` contains browser routes and request helpers; its backend calls go through a same-origin proxy in production and development.

## Plan of Work

Add named authentication models and a migration that discards obsolete credentials/sessions while keeping author references. Replace backend authentication middleware with session-to-domain lookup, and reject SYSTEM authentication. Add exact-origin checks for application mutations independently of Better Auth. Remove legacy JWT/password/OIDC modules and package dependencies. Replace frontend token atoms, API headers, token callbacks, login/signup, logout, HLS and event-stream credentials. Update example deployment variables and write a safe cutover guide. Supplement preserved policy tests with actual Better Auth handler tests and domain-route regressions.

## Concrete Steps

From repository root use `COREPACK_HOME=/tmp/video-host-corepack npm_config_cache=/tmp/video-host-npm-cache XDG_CACHE_HOME=/tmp/video-host-cache corepack pnpm ...` until the pinned pnpm is available on PATH. Run frozen install, Prisma validate/generate, backend test/build, then frontend tests/typecheck/build. Finish with workspace lint, typecheck and build. Use only synthetic test secrets and database contents.

## Validation and Acceptance

A synthetic user can register, receive an HttpOnly cookie, reload their session, sign out, and fail to replay the old session. Closed signup, wrong passwords, untrusted mutation origins, forged provider identities, and invalid link bindings fail. A HUMAN identity created through SSO cannot be managed as a SYSTEM account. Owners, permitted viewers, admins and strangers retain current visibility rules. Browser requests carry no bearer token or fragment credential. Machine VOD/FFmpeg routes continue requiring their internal secrets. Record which of these have runtime evidence, deterministic test evidence, or require real external services.

## Idempotence and Recovery

Changes are isolated in a fresh branch. Never apply the destructive credential migration to a live database as part of this task. A deployment operator must back up the database, review HUMAN/SYSTEM classification and ownership mappings, and migrate before starting the new build. Reverting the code alone does not restore deleted credentials; restore the database backup for rollback.

## Artifacts and Notes

The final local diff, deployment guide, and test output comprise the deliverable. No production credentials or user data are needed.

## Interfaces and Dependencies

Better Auth 1.7.7 provides email/password, Prisma MySQL storage, React client, and Generic OAuth provider registration. The application `User` remains the authorization principal. Exact external origins come from `BETTER_AUTH_URL`, `FRONTEND_URL`, and `AUTH_TRUSTED_ORIGINS`; no wildcard origins are accepted. `API_UPSTREAM_URL` is server-only. `VITE_API_ENDPOINT` is empty for the supported same-origin layout.

Plan created 2026-10-01 to capture approved implementation scope and verification boundaries. Updated at completion to record exact subject hashing (avoids MySQL collation conflation), required exp/iat claims, real optimized-asset runtime tests, and profile provisioning only at the session gate. The test adapter explicitly matches nontransactional Prisma semantics; real MySQL remains untested.
