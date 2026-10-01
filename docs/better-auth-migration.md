# Better Auth migration and deployment checklist

This is a breaking authentication cutover. It does not deploy anything automatically. Better Auth 1.7.7 replaces custom JWT/bcrypt/openid-client authentication. Existing passwords and sessions are deliberately invalidated; browser tokens stored in localStorage are no longer used. Do not attempt to reuse old JWTs as cookie sessions.

## Preserved data and changed identities

The application `User` table still owns video/series/playlist authorship, viewer lists, usernames, profiles, and USER/ADMIN roles. Its IDs and content relations are preserved. New `AuthUser`, `AuthAccount`, `AuthSession`, `AuthVerification`, and `AuthRateLimit` tables own authentication only. `User.authUserId` is an optional unique mapping; `User.kind` is explicitly HUMAN or SYSTEM. SYSTEM users must never acquire an AuthUser mapping.

The migration classifies old rows with both password=NULL and externalId=NULL as SYSTEM, using the prior system-administration definition. Other rows remain HUMAN. Review that classification against your data before applying it: custom imports may not follow this convention. Old SSO externalId values are retained only as historical domain data and are not used to authenticate or claim an account.

OIDC subjects are case-sensitive. The configured provider ID hashes the exact issuer, and the provider account ID hashes the exact verified subject using SHA-256. This avoids MySQL case-insensitive and trailing-space comparisons conflating distinct subjects such as `abc`, `ABC`, and `abc `. Do not normalize these values or change the mapping for an existing provider.

New logins create new HUMAN domain profiles with ordinary USER role. Old HUMAN author profiles remain unclaimed. The application never claims old content by matching email, display name, username, or a mutable provider profile. If preserving an author's access matters, an operator must explicitly verify the new authentication identity and map that AuthUser to the correct legacy HUMAN profile, preserving role and viewer relationships. First remove/reconcile the newly provisioned empty profile after confirming it owns no content or viewer memberships. This is a manual database-administration task, not an automatic migration or a public endpoint.

## Before cutover

1. Back up the full database and verify recovery. Export/review the HUMAN/SYSTEM classification and admin/content ownership mappings
2. Stop old backend replicas, block writes, and revoke old credentials operationally. Mixed old/new replicas are unsupported
3. Set a new random `BETTER_AUTH_SECRET` (at least 32 characters), shared by all new replicas. Remove `JWT_SECRET`, `PASSWORD_SALT`, `PASSWORD_HASH_ROUNDS`, `TOKEN_EXPIRY`, and `OIDC_REDIRECT_URI`
4. Set explicit `NODE_ENV=production`. Set `BETTER_AUTH_URL` and `FRONTEND_URL` to the same HTTPS public origin, for example https://video.example.com. Leave `VITE_API_ENDPOINT` empty and set frontend server-only `API_UPSTREAM_URL=http://backend:3000`
5. Configure exact trusted origins and `AUTH_TRUSTED_PROXY_CIDRS` containing only the actual frontend and ingress proxy source IPs/CIDRs. This is required in production; replace the deliberately invalid sample placeholder. Terminate HTTPS at a trusted ingress and prevent direct public access to the private backend. The ingress must append the actual socket peer to X-Forwarded-For or overwrite it with the actual client address; never pass through an unverified header unchanged
6. For SSO, obtain `ssoProviderId` from the new auth config and register `<BETTER_AUTH_URL>/api/auth/callback/<ssoProviderId>` with the IdP. Use an email-bearing provider with discovery issuer/JWKS, PKCE, and signed ID tokens
7. Decide whether signup is open, code-gated, or SSO-only. Password signup and SSO auto-provision are separate switches: close both if no new accounts should be created

## Apply schema and bootstrap

With a backup and only the new build selected, run from the repository root:

    pnpm -F @video-host/backend exec prisma migrate deploy
    pnpm -F @video-host/backend prisma:generate

Migration `20261001060000_better_auth` drops the old `Session` table and `User.password` column. It preserves content rows and adds the authentication models/mapping. Do not run `db push --accept-data-loss` as a substitute.

Bootstrap one verified human identity using an allowed signup or SSO flow. For a new installation, explicitly grant that domain profile ADMIN in an operator-controlled database session; registration always grants USER. For an existing installation, explicitly map a verified AuthUser to the reviewed legacy administrator profile as described above. Disable temporary signup afterward if desired. Never expose a bootstrap-admin HTTP endpoint.

Start only the new backend/frontend replicas and use fresh browser login. Existing browser localStorage entries can be removed by the user; they confer no access. New session cookies are host-only, HttpOnly, SameSite=Lax and Secure in production. External cross-site API origins are not the supported default; same-origin proxy avoids third-party-cookie policy dependence.

## Rate-limit IP policy

Better Auth limits email sign-in and signup to five attempts per minute per resolved client IP (IPv6 is grouped by /64), stored in the shared database. The Hono HTTP boundary starts with the actual Node socket peer, walks X-Forwarded-For from right to left only through `AUTH_TRUSTED_PROXY_CIDRS`, and overwrites an internal client-IP header. Direct untrusted peers cannot select their own bucket using X-Forwarded-For, X-Real-IP, Forwarded, or the internal header. Missing transport metadata, malformed trusted forwarding chains, or a chain containing only trusted proxies (no identifiable client) return 503 rather than silently falling back to one global bucket.

Both Nitro and Vite append the actual transport peer to X-Forwarded-For and strip alternate/internal IP headers. Nitro reads the Node socket directly, not a runtime IP getter that might trust supplied headers. Configure the backend list for the narrow source addresses of every trusted proxy hop (frontend and ingress), not for end users or an entire cluster/private network. A trusted ingress must append/overwrite the real client IP. Network controls must prevent untrusted workloads from impersonating those trusted peers. Do not enable a blanket trust-proxy option, trust /0, or disable IP tracking.

For local development the default empty trust list uses the backend socket peer. Proxy integration tests must give the client a distinct source address outside the configured proxy ranges; do not configure a localhost address as trusted when it is also the end-user address. Configure IPv4 proxies with native IPv4 CIDRs (IPv4-mapped IPv6 configuration and ranges covering all mapped IPv4 are rejected; mapped socket addresses still work). Production requires a nonempty reviewed list; there is no safe universal CIDR default for an unknown deployment. At staging verify two different client addresses do not share a bucket, one client cannot rotate forged headers to evade its bucket, and bypassing the frontend does not make forwarded values authoritative. Users behind the same NAT or IPv6 /64 intentionally share a limit. Real ingress source addresses and isolation are operator release gates, not inferred from these samples.

## Operational security and functional checks

Check against a disposable real MySQL 8 database first, then staging:

- All migrations apply from a clean database and from a synthetic pre-migration fixture; schema introspection matches Prisma
- Signup, incorrect/correct password, cookie attributes, reload, expiry, logout and replay, revoked session on a second backend replica
- Closed password signup, invalid registration code, disabled SSO provisioning, same-email different-provider collision, missing provider email
- Real provider authorization-code callback, tampered state, bad nonce/signature/audience/issuer, missing JWKS, missing/expired exp, missing/future iat, expired/replayed state, logout/account switch during linking, duplicate subjects across issuers
- PUBLIC/UNLISTED/PRIVATE/LIMITED reads for owner, viewer, stranger, anonymous and admin; only SYSTEM authors permit delegated admin posting
- Browser HLS requests and edit-progress SSE use cookies only for the trusted API origin; unrelated storage/VOD hosts receive no auth credentials
- Application mutations reject missing, null and untrusted Origin; auth endpoints reject unsafe callback URLs; browser cookie cannot substitute for FFmpeg/VOD secrets
- Production Nitro proxy streams SSE and preserves Set-Cookie and redirect responses without following them server-side; `/api/healthz` still works
- Real shared-database rate limiting across replicas and database-outage behavior; attacker-supplied forwarded IP headers cannot create unlimited buckets
- Render `kustomize build k8s/overlays/prod`, inspect environment-key/Secret references, build/start containers, and verify served HTML has no runtime placeholders or server-only secret values

The credential migration does not make external object storage or the standalone VOD server private. Existing VOD/object-store routing remains a separate boundary; review its access controls for the actual deployment.

## Rollback

Stop all new replicas before rollback. Reverting code alone cannot restore deleted passwords or legacy sessions. Restore the reviewed pre-cutover database backup, restore the corresponding old configuration, then start the old build. Do not mix model versions or attempt implicit reverse conversion of Better Auth credential hashes.

## Verification record

The accompanying local validation report/ExecPlan states checks actually run. Unit tests use synthetic data; they do not establish production IdP, database, ingress, or container behavior unless explicitly recorded. No real secrets, deployments, or production records were changed during implementation.
