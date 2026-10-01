# Better Auth validation record

Local implementation based on `a8e39fb95fe08a3f306d3714e467b36824d560bc`, tested 2026-10-01 with Node 24.19.0 and pnpm 10.25.0. This record covers the local-validation checkpoint, before publication. No changes were deployed or applied to a real database; subsequent remote CI evidence belongs to the pull request checks for its exact head commit.

## Passing checks

- Frozen workspace installation and Prisma client generation
- Prisma schema validation with a synthetic MySQL connection URL (validation only, no connection)
- Workspace `pnpm lint`, `pnpm typecheck`, and `pnpm build`, including backend declarations and FFmpeg-worker types/build
- Backend tests: real Better Auth HTTP handling/password hashing/cookie signing/session revocation and real RSA verification using a memory adapter and deterministic mocked OIDC discovery/token/JWKS responses; domain/profile/authorization code uses synthetic Prisma fakes
- Frontend callback/proxy/password validation tests and built production Nitro HTTP proxy smoke
- Compiled backend Hono health and auth-config routes return 200 with Better Auth initialization
- Kustomize 5.7.1 rendered 15 production-overlay objects; every required ConfigMap/Secret environment reference resolves
- Legacy JWT/bcrypt/openid-client imports, browser bearer headers, and credential-fragment handling absent from production source

Final backend suite: 129 passed across 7 files. Frontend: 7 unit tests, 1 production proxy smoke test, and 4 built-output runtime-environment tests passed. Placeholder production build explicitly prerendered 1 page. Runtime tests verified unresolved-placeholder, empty same-origin and explicit HTTPS-origin configurations in optimized assets and served root/login/health HTTP responses. The memory adapter transaction callback is intentionally configured to match production Prisma nontransactional behavior for partial-failure tests; it is not real SQL evidence.

## Security cases exercised

Signup policy/code, incorrect passwords, secure HttpOnly SameSite cookies, invalid/revoked/expired sessions, old bearer rejection, CSRF and unsafe redirects, PUBLIC/UNLISTED/PRIVATE/LIMITED rules, HUMAN/SYSTEM separation, admin delegation, separate FFmpeg/VOD secrets, failed/idempotent profile provisioning, signed provider identity, case-sensitive/trailing-space subjects, missing/invalid claims, wrong signature/issuer/audience/nonce, replay/missing state cookie, closed SSO provisioning, no implicit same-email linking, and explicit linking after signout or switching identities.

Proxy smoke uses a synthetic HTTP upstream and real built Nitro server. It checks body/Cookie/Origin forwarding, spoofed forwarding-header removal, multiple Set-Cookie headers, non-followed redirects, streamed SSE, and the independent frontend health endpoint. It does not establish real database-backed browser login.

## Independent review

A separate reviewer inspected authentication/authorization, provider mapping, account-link mutation order in Better Auth 1.7.7 source, and proxy/session boundaries. No confirmed security blocker was found. Required OIDC lifetime claims were subsequently tightened as defense in depth. The final deployment-contract check found the library rejected unresolved API URL placeholders during prerender; this required a separate frontend correction and regression check before completion.

## Not run and release gates

- Real MySQL fresh/upgrade migration, Prisma query behavior, concurrent sessions or rate limits across real replicas
- Real external IdP discovery/callback, secret configuration or account access
- Docker image build/start and real Kubernetes ingress deployment
- Visual desktop/mobile browser interaction: cloud browser localhost navigation failed with `net::ERR_BLOCKED_BY_CLIENT`; no workaround was used to bypass that restriction
- Remote GitHub CI was not run at this local-validation checkpoint; consult the pull request checks for subsequent results. Merge and deployment are outside this record

The default rate limiter deliberately trusts no client IP headers and uses a shared per-path database bucket. Email sign-in/signup are each limited globally to five attempts per minute, an acknowledged availability tradeoff until a trustworthy ingress IP mechanism is configured. Email delivery, verification and recovery are not configured. See `docs/better-auth-migration.md` before any staging/production cutover.
