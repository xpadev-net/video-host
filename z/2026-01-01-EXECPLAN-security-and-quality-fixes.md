# Security and Code Quality Fixes for video-host

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `.agent/PLANS.md`.

## Purpose / Big Picture

After completing this plan, the video-host application will be production-ready with hardened security, improved code quality, and comprehensive test coverage. Currently, the application has several critical security vulnerabilities (hardcoded secrets, weak password hashing) and insufficient test coverage (28 tests covering only 5 modules). Upon completion, users will be able to deploy the application to production with confidence that authentication is secure, secrets are properly managed, and the codebase follows best practices.

Observable outcomes:
- Running `pnpm test` in the backend will execute 70+ tests with all passing
- Starting the application with missing required environment variables will fail with clear error messages
- Kubernetes deployments will use Sealed Secrets instead of plaintext literals
- All `any` types in the frontend will be replaced with proper type definitions

## Progress

- [x] Milestone 1: Critical Security Fixes (2026-01-01 08:03Z)
  - [x] Removed hardcoded PASSWORD_SALT default value - now requires explicit value in production
  - [x] Removed hardcoded JWT_SECRET default value - now requires explicit value in production  
  - [x] Increased PASSWORD_HASH_ROUNDS minimum to 12 (was 10)
  - [x] Implemented comprehensive Zod-based environment validation schema
  - [x] Updated env.test.ts with 16 test cases (was 5)
  - [x] Updated setup.ts with PASSWORD_SALT for test initialization
  - [x] All 40 backend tests pass
- [x] Milestone 2: Backend Code Quality (2026-01-01 08:36Z)
  - [x] Add input validation for user registration (password requirements)
  - [x] Implement transaction handling for cascade deletes
  - [x] Create shared isSystemAccount utility
- [ ] Milestone 3: Authentication Tests
  - [ ] Create middleware-auth.test.ts with 10+ test cases
  - [ ] Add edge case tests to auth.test.ts
  - [ ] Create authorization.test.ts for permission checks
- [ ] Milestone 4: Frontend Type Safety
  - [ ] Replace any types in login/page.tsx
  - [ ] Replace any types in register/page.tsx
  - [ ] Add proper error handling to auth flows
- [ ] Milestone 5: Infrastructure Hardening
  - [ ] Convert Kubernetes secrets to Sealed Secrets
  - [ ] Update Health Checks to HTTP endpoints
  - [ ] Add SecurityContext to deployments

## Surprises & Discoveries

- Observation: The vitest test setup file (`setup.ts`) runs before all tests and sets environment variables. This means `vi.resetModules()` cannot fully reset the env.ts module after it has been imported during setup.
  Evidence: Tests that tried to dynamically reimport env.ts with different NODE_ENV values saw stale cached values.
  Resolution: Rewrote tests to validate the Zod schema directly by parsing mock environment objects instead of attempting module reload.

- Observation: Zod's `.default()` after `.transform()` requires the transformed type, not the input type.
  Evidence: TypeScript errors when using `.default("false")` after `.transform((val) => val === "true")`.
  Resolution: Changed to `.default(false)` to match the boolean output type.

## Decision Log

- Decision: Start with environment variable hardening before other changes
  Rationale: This is the highest-risk vulnerability and blocks production deployment. Other fixes depend on secure configuration being in place.
  Date/Author: 2026-01-01 / Claude Code

- Decision: Use Zod for comprehensive environment validation instead of individual requireEnv calls
  Rationale: Zod provides schema-level validation, better error messages, and type inference. It allows validating relationships between variables (e.g., S3 credentials required when S3_ENABLED=true).
  Date/Author: 2026-01-01 / Claude Code

- Decision: Export EnvSchema and DEV_DEFAULTS for testing 
  Rationale: Allows tests to validate the schema directly without needing to reload the module, which is problematic with vitest's setup file approach.
  Date/Author: 2026-01-01 / Claude Code

## Outcomes & Retrospective

### Milestone 1 Complete

The environment configuration has been significantly hardened:

1. **Security-sensitive variables** (JWT_SECRET, PASSWORD_SALT, CALLBACK_SECRET, VOD_INTERNAL_SECRET) now require explicit values in production mode - no hardcoded defaults.

2. **Development defaults** are only allowed when NODE_ENV=development, with console warnings to alert developers.

3. **PASSWORD_HASH_ROUNDS** now has a minimum of 12 (increased from 10), enforced by schema validation.

4. **Production protection** against accidental use of development defaults - the refinement rejects known dev default values.

5. **Test coverage** increased from 5 to 16 tests for environment validation, covering all security requirements.

Validation command: `cd app/backend && pnpm test` shows 40 tests passing.

### Milestone 2 Complete

Backend code quality improvements implemented:

1. **Password validation** - User registration now requires passwords with:
   - Minimum 8 characters
   - At least one uppercase letter
   - At least one lowercase letter
   - At least one number

2. **Username validation** - Usernames must be:
   - 3-32 characters long
   - Only alphanumeric characters, underscores, and hyphens

3. **Transaction handling** - Cascade deletes in `system-accounts.ts` now use `prisma.$transaction()` to ensure atomicity.

4. **Shared utility** - Created `utils/systemAccountCache.ts` with a shared `isSystemAccount` function, replacing duplicated code in series, playlists, and movies routes.

Validation command: `cd app/backend && pnpm test` shows 40 tests passing.


## Context and Orientation

This is a video hosting platform built as a monorepo with three main packages:

- `app/backend/`: Hono-based REST API server using Prisma ORM with MySQL
- `app/frontend/`: Next.js 16 application with React 19
- `app/ffmpeg-worker/`: Video encoding worker using FFmpeg

Key files relevant to this plan:

- `app/backend/src/env.ts`: Environment variable definitions with dangerous defaults
- `app/backend/src/lib/password.ts`: Password hashing using bcrypt
- `app/backend/src/middleware/auth.ts`: JWT authentication middleware (81 lines, no tests)
- `app/backend/src/routes/api/v4/users/index.ts`: User registration endpoint lacking validation
- `app/backend/src/routes/api/v4/system-accounts.ts`: Cascade delete without transactions
- `app/backend/src/__tests__/`: Test directory with 5 test files (488 lines total)
- `app/frontend/src/app/login/page.tsx`: Login page with `any` type usage
- `app/frontend/src/app/register/page.tsx`: Registration page with `any` type usage
- `k8s/overlays/prod/kustomization.yaml`: Kubernetes config with plaintext secrets

Terms used in this plan:
- **bcrypt rounds**: The work factor for password hashing; higher numbers mean slower but more secure hashing. 10 rounds takes ~100ms, 12 rounds takes ~300ms.
- **Sealed Secrets**: A Kubernetes controller that encrypts secrets so they can be safely stored in Git.
- **N+1 query**: A performance anti-pattern where code executes one query to get a list, then N additional queries for each item.

## Plan of Work

### Milestone 1: Critical Security Fixes

The environment configuration in `app/backend/src/env.ts` currently provides dangerous default values. We will replace the ad-hoc `requireEnv` function with a comprehensive Zod schema that validates all environment variables at startup and fails fast in production if required values are missing.

Edit `app/backend/src/env.ts`:
1. Import Zod at the top of the file
2. Define an `EnvSchema` that marks security-sensitive variables as required (no defaults)
3. Add a refinement to ensure PASSWORD_HASH_ROUNDS is at least 12
4. Add a refinement to reject dev defaults in production
5. Parse `process.env` through the schema at module load time
6. Export validated values instead of raw `process.env` access

Update `app/backend/src/__tests__/env.test.ts`:
1. Add test case for missing JWT_SECRET in production
2. Add test case for missing PASSWORD_SALT in production
3. Add test case for PASSWORD_HASH_ROUNDS minimum enforcement
4. Add test case for rejecting dev defaults in production

### Milestone 2: Backend Code Quality

Edit `app/backend/src/routes/api/v4/users/index.ts`:
1. Modify the `PostSchema` Zod object to add password requirements:
   - Minimum 8 characters
   - At least one uppercase letter
   - At least one lowercase letter
   - At least one number
2. Add username format validation (alphanumeric, underscore, hyphen only)
3. Add username length limits (3-32 characters)

Edit `app/backend/src/routes/api/v4/system-accounts.ts`:
1. Locate the DELETE handler around line 98
2. Wrap the cascade delete operations in `prisma.$transaction()`
3. Include all deleteMany and delete calls in the transaction array

Edit `app/backend/src/routes/api/v4/series/[series].ts` and similar files:
1. Create a shared utility function `createSystemAccountChecker()` that returns a memoized checker
2. Replace inline `isSystemAccount` calls with the memoized version
3. Clear the cache at appropriate boundaries (per-request)

### Milestone 3: Authentication Tests

Create `app/backend/src/__tests__/middleware-auth.test.ts`:
1. Set up Vitest with mocked Prisma client
2. Create test app with auth middleware applied
3. Test cases for:
   - Request without Authorization header → 401 for protected endpoints
   - Malformed Authorization header → 401
   - Token signed with wrong secret → 401
   - Expired JWT token → 401
   - Valid token but no matching session in DB → 401
   - Valid token with matching session → 200 with user in context
   - Public endpoints accessible without token

Create `app/backend/src/__tests__/authorization.test.ts`:
1. Test `buildVisibilityFilter` function with:
   - Unauthenticated user → only PUBLIC content
   - Regular user → PUBLIC + own content
   - Admin user → all content
2. Test PRIVATE content access denial

### Milestone 4: Frontend Type Safety

Create `app/frontend/src/@types/auth.ts`:
1. Define `AuthResponse` interface with status, data, and message fields
2. Define `AuthError` type for error cases

Edit `app/frontend/src/app/login/page.tsx`:
1. Import the new AuthResponse type
2. Replace `(body as any)` casts with properly typed response handling
3. Add try-catch around fetch calls
4. Handle network errors with user-friendly messages

Edit `app/frontend/src/app/register/page.tsx`:
1. Apply the same type safety improvements as login page

### Milestone 5: Infrastructure Hardening

This milestone requires the `kubeseal` CLI tool to be installed. If not available, document the manual steps for the operator.

Edit `k8s/overlays/prod/kustomization.yaml`:
1. Remove the `secretGenerator` section with plaintext literals
2. Add a reference to a SealedSecret resource

Create `k8s/overlays/prod/backend-sealed-secret.yaml`:
1. Document the structure of the SealedSecret
2. Provide instructions for generating encrypted values with kubeseal

Edit Kubernetes deployment files to add SecurityContext:
1. `k8s/base/backend/deployment.yaml`
2. `k8s/base/frontend/deployment.yaml`
3. `k8s/base/ffmpeg-worker/deployment.yaml`

Add to each deployment's container spec:

    securityContext:
      runAsNonRoot: true
      runAsUser: 1000
      readOnlyRootFilesystem: true
      allowPrivilegeEscalation: false

Edit deployment files to use HTTP health checks:
1. Replace `tcpSocket` probes with `httpGet` probes pointing to `/healthz`

## Concrete Steps

All commands should be run from the repository root: `/Users/xpadev/IdeaProjects/video-host`

### Milestone 1

Step 1: Edit environment configuration

    # First, read the current file
    cat app/backend/src/env.ts

    # Edit the file to add Zod validation (see Plan of Work for details)

Step 2: Run tests to verify changes

    cd app/backend && pnpm test

Expected output:

    ✓ env.test.ts (9 tests)

    Test Files  1 passed
    Tests       9 passed

Step 3: Verify production mode fails without required vars

    cd app/backend
    NODE_ENV=production JWT_SECRET= pnpm dev

Expected output:

    Error: Environment validation failed:
      JWT_SECRET: Required

### Milestone 2

Step 1: Update user validation schema

    # Edit app/backend/src/routes/api/v4/users/index.ts

Step 2: Test registration with weak password

    curl -X POST http://localhost:3000/api/v4/users \
      -H "Content-Type: application/json" \
      -d '{"username": "test", "password": "weak"}'

Expected output:

    {"status":"error","message":"Password must be at least 8 characters"}

Step 3: Add transaction handling

    # Edit app/backend/src/routes/api/v4/system-accounts.ts

Step 4: Run all backend tests

    cd app/backend && pnpm test

### Milestone 3

Step 1: Create auth middleware tests

    # Create app/backend/src/__tests__/middleware-auth.test.ts

Step 2: Create authorization tests

    # Create app/backend/src/__tests__/authorization.test.ts

Step 3: Run tests and verify coverage increase

    cd app/backend && pnpm test

Expected output:

    ✓ auth.test.ts (8 tests)
    ✓ middleware-auth.test.ts (10 tests)
    ✓ authorization.test.ts (6 tests)
    ...

    Test Files  8 passed
    Tests       52 passed

### Milestone 4

Step 1: Create auth types

    # Create app/frontend/src/@types/auth.ts

Step 2: Update login page

    # Edit app/frontend/src/app/login/page.tsx

Step 3: Update register page

    # Edit app/frontend/src/app/register/page.tsx

Step 4: Verify no TypeScript errors

    cd app/frontend && pnpm typecheck

Expected output:

    No errors found

### Milestone 5

Step 1: Check if kubeseal is available

    which kubeseal || echo "kubeseal not installed"

Step 2: Update Kubernetes configurations

    # Edit k8s/overlays/prod/kustomization.yaml
    # Edit k8s/base/*/deployment.yaml files

Step 3: Validate Kubernetes manifests

    kubectl kustomize k8s/overlays/prod

Expected output: Valid YAML without plaintext secret values

## Validation and Acceptance

### Security Validation

1. Start the backend without JWT_SECRET in production mode:

       NODE_ENV=production pnpm -F @video-host/backend dev

   The application must fail to start with a clear error message about missing JWT_SECRET.

2. Attempt to register a user with a weak password:

       curl -X POST http://localhost:3000/api/v4/users \
         -H "Content-Type: application/json" \
         -d '{"username": "testuser", "password": "123"}'

   The response must be a 400 error with a message about password requirements.

### Test Coverage Validation

1. Run the backend test suite:

       cd app/backend && pnpm test

   Expected: At least 50 tests passing (up from 28).

2. Verify new test files exist:

       ls app/backend/src/__tests__/

   Expected: `middleware-auth.test.ts` and `authorization.test.ts` are present.

### Type Safety Validation

1. Run TypeScript compilation on frontend:

       cd app/frontend && pnpm typecheck

   Expected: No errors, and no `any` types in login/register pages.

2. Search for remaining `any` types in auth pages:

       grep -n "as any" app/frontend/src/app/login/page.tsx app/frontend/src/app/register/page.tsx

   Expected: No matches.

### Infrastructure Validation

1. Render the production Kubernetes manifests:

       kubectl kustomize k8s/overlays/prod > /tmp/prod-manifests.yaml

2. Verify no plaintext secrets:

       grep -i "CHANGE_ME\|password\|secret" /tmp/prod-manifests.yaml

   Expected: No matches (secrets should be encrypted or referenced externally).

3. Verify SecurityContext is present:

       grep -A5 "securityContext" /tmp/prod-manifests.yaml

   Expected: `runAsNonRoot: true` appears in output.

## Idempotence and Recovery

All changes in this plan are idempotent and can be safely re-applied:

- Environment variable schema changes: Re-running the same Zod parse produces the same result
- Test additions: Running tests multiple times produces consistent results
- Kubernetes manifest changes: `kubectl apply` is idempotent

Recovery procedures:

- If environment validation breaks existing deployments, set the required environment variables before restarting
- If password validation breaks registration, existing users are unaffected; only new registrations require strong passwords
- If Sealed Secrets setup fails, the previous secretGenerator approach can be temporarily restored

## Artifacts and Notes

### Example: Improved env.ts structure

    import { z } from "zod";

    const EnvSchema = z.object({
      NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
      JWT_SECRET: z.string().min(32),
      PASSWORD_SALT: z.string().min(16),
      PASSWORD_HASH_ROUNDS: z.coerce.number().min(12).default(12),
      // ... other variables
    }).refine(
      (env) => {
        if (env.NODE_ENV === "production") {
          return env.JWT_SECRET !== "dev-jwt-secret";
        }
        return true;
      },
      { message: "Production cannot use development secrets" }
    );

    const env = EnvSchema.parse(process.env);
    export const { JWT_SECRET, PASSWORD_SALT, PASSWORD_HASH_ROUNDS } = env;

### Example: Password validation schema

    const PostSchema = z.object({
      username: z.string()
        .min(3, "Username must be at least 3 characters")
        .max(32, "Username must not exceed 32 characters")
        .regex(/^[a-zA-Z0-9_-]+$/, "Username can only contain letters, numbers, underscores, and hyphens"),
      password: z.string()
        .min(8, "Password must be at least 8 characters")
        .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
        .regex(/[a-z]/, "Password must contain at least one lowercase letter")
        .regex(/\d/, "Password must contain at least one number"),
      name: z.string().optional(),
    });

### Example: Auth middleware test structure

    describe("Auth Middleware", () => {
      it("should reject request without Authorization header", async () => {
        const res = await app.request("/api/v4/users");
        expect(res.status).toBe(401);
      });

      it("should accept valid token and set user context", async () => {
        mockPrisma.session.findFirst.mockResolvedValue({
          user: { id: "user-123", username: "test" }
        });
        const res = await app.request("/api/v4/users", {
          headers: { Authorization: `Bearer ${validToken}` }
        });
        expect(res.status).toBe(200);
      });
    });

## Interfaces and Dependencies

### New Type Definitions

In `app/frontend/src/@types/auth.ts`, define:

    export interface AuthResponse {
      status: "ok" | "error";
      data?: string;  // JWT token on success
      message?: string;  // Error message on failure
    }

    export interface AuthFormState {
      isLoading: boolean;
      error: string | null;
    }

### Updated Function Signatures

In `app/backend/src/env.ts`, the module will export validated constants:

    export const JWT_SECRET: string;  // Guaranteed non-empty in production
    export const PASSWORD_SALT: string;  // Guaranteed non-empty in production
    export const PASSWORD_HASH_ROUNDS: number;  // Guaranteed >= 12

In `app/backend/src/utils/systemAccountCache.ts` (new file), define:

    export function createSystemAccountChecker(prisma: PrismaClient): {
      isSystemAccount: (userId: string) => Promise<boolean>;
      clearCache: () => void;
    }

### Dependencies

No new dependencies are required. All implementations use existing packages:
- `zod` (already installed in backend)
- `vitest` (already installed for testing)
- `@prisma/client` (already installed)

---

*Revision 1 (2026-01-01): Initial creation based on comprehensive repository review. This plan addresses the critical findings from the security and code quality audit.*
