# Plan: Migrate frontend from Next.js to TanStack Start

- status: done
- generated: 2026-08-31
- last_updated: 2026-09-01
- work_type: code

## Goal

- Replace the hybrid Next.js frontend runtime and routing with TanStack Start on Vite while preserving current URLs, UI, client-side API/auth semantics, player continuity, health endpoint, and container release behavior.

## Definition of Done

- All existing UI routes and `/api/healthz` resolve at their current URLs through TanStack Start file-based routes.
- Frontend source, configuration, container runtime, and documentation no longer depend on Next.js, `.next`, styled-jsx, or the Next server.
- SWR/Hono data fetching, localStorage-backed authentication and preferences, global shell behavior, dynamic titles, images, and persistent player/PiP behavior remain compatible.
- `routeTree.gen.ts` is generated and committed as application runtime source, and its inventory matches the migrated routes.
- Runtime-substituted public environment values work in the built container artifact.
- Required lint, typecheck, build, production health, and independent desktop/mobile browser checks pass.

## Scope / Non-goals

- Scope: frontend dependencies/scripts/config, route tree, Next-specific navigation/head/image/style replacements, public environment handling, health server route, Docker/start/runtime substitution, CI checks, frontend docs, and focused regression checks.
- Non-goals: backend API/schema or authorization redesign; replacing SWR/Jotai/Hono with TanStack Query/server functions; visual redesign; player rewrite; public URL or auth storage changes; new image optimization service.
- Non-goal: unrelated route anomalies are not silently preserved through untyped escape hatches; obvious invalid internal destinations exposed by typed routing may be corrected and recorded as compatibility fixes.

## Context (workspace)

- Related files/areas: `app/frontend/package.json`, `app/frontend/src/pages/**`, `app/frontend/src/app/**`, `app/frontend/src/components/**`, `app/frontend/Dockerfile`, `.github/workflows/ci.yaml`.
- Existing patterns or references: client-only SWR/Hono fetching; Jotai localStorage state; split auth/public shells; long-running Node container with runtime placeholder substitution.
- Repo reference docs consulted: `app/frontend/CLAUDE.md` (partially stale), official TanStack Start build, SPA mode, environment, server-route, and Router file-routing documentation.

## Open Questions (max 3)

- None blocking.

## Assumptions

- Use TanStack Start SPA mode initially because the current application has no SSR data loaders and depends heavily on localStorage/browser media APIs; retain Start server routes for `/api/healthz`.
- Preserve runtime-configurable container environment substitution by scanning the actual TanStack output rather than converting values to immutable image build arguments.
- Keep port 3000 and the current external API/auth contracts unchanged.

## Quality Routing

- Routing level: L3 because this is a framework/runtime migration spanning TypeScript, React, routing, frontend/backend type integration, CI, and container delivery.
- In-scope docs: core principles, architecture gates, frontend/backend boundaries, TypeScript/JavaScript, web frameworks, testing/validation, Vercel React performance guidance.
- Out-of-scope docs: backend-language, database, and security-specific implementation guides because backend runtime, persistence, and authorization behavior are not being changed.
- Top risks: migration, external dependencies, contract compatibility, hydration/client-only state, build/runtime parity, and UI regressions.

## Tasks

### Task_1: Establish the TanStack Start foundation

- type: impl
- owns:
  - `app/frontend/package.json`
  - `package.json`
  - `.gitignore`
  - `.dockerignore`
  - `pnpm-lock.yaml`
  - `app/frontend/vite.config.ts`
  - `app/frontend/.dockerignore`
  - `app/frontend/.gitignore`
  - `app/frontend/.biomeignore`
  - `app/frontend/.env.example`
  - `app/frontend/public/next.svg`
  - `k8s/base/frontend/deployment.yaml`
  - `k8s/base/config/frontend-config.sample.yaml`
  - `k8s/overlays/prod/kustomization.yaml`
  - `app/frontend/vite.config.ts`
  - `app/frontend/tsconfig.json`
  - `app/frontend/.biomeignore`
  - `app/frontend/biome.json`
  - `app/frontend/src/env.d.ts`
  - `app/frontend/src/router.tsx`
  - `app/frontend/src/routes/__root.tsx`
  - `app/frontend/src/routes/api.healthz.ts`
  - `app/frontend/src/routes/index.tsx`
  - `app/frontend/src/routeTree.gen.ts`
  - `app/frontend/src/contexts/env.ts`
- depends_on: []
- description: |
  Add the current TanStack Start/Router and Vite foundation, enable SPA mode, preserve port 3000, create the Japanese root document/providers and health server route, type Vite environment values, and establish generated route-tree handling. Keep Next temporarily installed until all consumers are migrated.
- acceptance:
  - Official plugin order and current `getRouter`/root-document APIs are used.
  - SPA mode preserves client-only execution while `/api/healthz` remains server-handled.
  - Vite environment values are typed and required API endpoint absence fails clearly.
  - The generated route tree is committed and ignored by formatter/linter as appropriate.
- validation:
  - kind: command
    required: true
    owner: worker
    detail: "Run pnpm install, backend build, frontend typecheck, and frontend build; if legacy Next files prevent a full check, report exact remaining errors rather than claiming pass."
  - kind: review
    required: true
    owner: reviewer
    detail: "Verify TanStack Start/Vite/SPA/server-route configuration against official current APIs."

### Task_2: Replace Next runtime APIs in shared frontend code

- type: impl
- owns:
  - `app/frontend/src/components/**`
  - `app/frontend/src/hooks/useAuth.ts`
  - `app/frontend/src/styles/global.css`
  - `app/frontend/src/lib/**`
- depends_on: [Task_1]
- description: |
  Replace Next Link/router/navigation/image/head assumptions in shared code with TanStack Router and a local image abstraction while preserving search, auth, responsive shell, metadata, media-session navigation, and persistent player/PiP behavior. Dashboard component style conversion is included because styled-jsx lives inside those components.
- acceptance:
  - Shared code contains no Next imports or styled-jsx usage.
  - Persistent player distinguishes the active movie route from PiP routes without remounting unexpectedly.
  - Navigation destinations, image sizing/fallback, and responsive layout remain compatible.
  - Static rendering avoids unnecessary waterfalls or client bundle expansion under the Vercel React guidance.
- validation:
  - kind: command
    required: true
    owner: worker
    detail: "Run scoped Next/styled-jsx absence searches and Biome checks for owned files."
  - kind: command
    required: true
    owner: orchestrator
    detail: "After Wave 2 integration regenerates the shared route tree, run frontend lint, typecheck, and build."
  - kind: ui_probe
    required: false
    owner: worker
    detail: "Probe shared shell/navigation/player behavior locally when runnable."

### Task_3: Migrate public and authentication routes

- type: impl
- owns:
  - `app/frontend/src/pages/_app.tsx`
  - `app/frontend/src/pages/_document.tsx`
  - `app/frontend/src/pages/index.tsx`
  - `app/frontend/src/pages/history.tsx`
  - `app/frontend/src/pages/movies/**`
  - `app/frontend/src/pages/series/**`
  - `app/frontend/src/pages/users/**`
  - `app/frontend/src/pages/search/**`
  - `app/frontend/src/app/**`
  - `app/frontend/src/routes/_app.tsx`
  - `app/frontend/src/routes/_app.index.tsx`
  - `app/frontend/src/routes/_app.history.tsx`
  - `app/frontend/src/routes/_app.movies.$movie.tsx`
  - `app/frontend/src/routes/_app.series.$series.tsx`
  - `app/frontend/src/routes/_app.users.$user.tsx`
  - `app/frontend/src/routes/_app.search.$query.tsx`
  - `app/frontend/src/routes/login.tsx`
  - `app/frontend/src/routes/register.tsx`
- depends_on: [Task_1]
- description: |
  Convert public and auth pages to typed file routes, preserving the pathless application shell, dynamic params, login callback validation, route titles, loading/error behavior, and auth-page chrome exclusion.
- acceptance:
  - Public and auth URLs remain unchanged and appear in the generated route tree.
  - Login callback parsing is type-safe and remains sanitized.
  - Auth routes omit the global application chrome while public routes retain it.
  - Dynamic titles and loading/error states retain current behavior.
- validation:
  - kind: command
    required: true
    owner: worker
    detail: "Run route-source Next-import absence search and Biome checks for owned files; enumerate intended generated route paths."
  - kind: command
    required: true
    owner: orchestrator
    detail: "After Wave 2 integration regenerates the shared route tree, run frontend lint, typecheck, and build and inspect generated route paths."
  - kind: ui_probe
    required: false
    owner: worker
    detail: "Probe home, one dynamic public route, login, and register when runnable."

### Task_4: Migrate dashboard routes

- type: impl
- owns:
  - `app/frontend/src/pages/dashboard/**`
  - `app/frontend/src/routes/_app.dashboard.tsx`
  - `app/frontend/src/routes/_app.dashboard*`
- depends_on: [Task_1]
- description: |
  Convert every dashboard page to typed TanStack file routes, retaining URL paths, parameters, forms, list/edit flows, active navigation, account switching, and admin-only behavior. Shared Dashboard component style/API work remains owned by Task_2.
- acceptance:
  - All existing dashboard URLs and dynamic parameters appear in the generated route tree.
  - List, new, and edit pages retain their data/mutation behavior.
  - Route ownership does not duplicate shared shell or dashboard layout concerns.
- validation:
  - kind: command
    required: true
    owner: worker
    detail: "Run route-source Next-import absence search and Biome checks for owned files; enumerate intended generated dashboard paths."
  - kind: command
    required: true
    owner: orchestrator
    detail: "After Wave 2 integration regenerates the shared route tree, run frontend lint, typecheck, and build and inspect generated dashboard paths."
  - kind: ui_probe
    required: false
    owner: worker
    detail: "Probe dashboard index, list, new, and edit navigation when an authenticated fixture is available."

### Task_5: Remove Next and port production delivery

- type: impl
- owns:
  - `app/frontend/package.json`
  - `pnpm-lock.yaml`
  - `app/frontend/next.config.js`
  - `app/frontend/next-env.d.ts`
  - `app/frontend/src/pages/api/healthz.ts`
  - `app/frontend/Dockerfile`
  - `app/frontend/start.sh`
  - `app/frontend/docker/env-replacer.sh`
  - `app/frontend/docker/.env.placeholder`
  - `app/frontend/README.md`
  - `app/frontend/CLAUDE.md`
  - `app/frontend/components.json`
  - `.github/workflows/ci.yaml`
  - `.github/workflows/release.yaml`
- depends_on: [Task_2, Task_3, Task_4]
- description: |
  Remove Next/sharp and obsolete files after all consumers move, add the official Nitro Vite Node adapter, package and start standalone `.output`, retarget runtime placeholder replacement, make CI format validation non-mutating, align documented runtime expectations, and refresh stale frontend documentation.
- acceptance:
  - No active frontend source/config/runtime reference to Next.js, `.next`, styled-jsx, or the Next server remains.
  - The production container starts `.output/server/index.mjs` on port 3000 with no runtime `node_modules`.
  - Runtime placeholder replacement modifies the deployed client assets and `/api/healthz` returns the same JSON contract.
  - CI format validation is non-mutating and frontend documentation matches actual scripts/framework structure.
- validation:
  - kind: command
    required: true
    owner: worker
    detail: "Run frozen install, backend build, frontend lint/typecheck/build, broad absence searches, and production server health check."
  - kind: container
    required: true
    owner: orchestrator
    detail: "Build/run the frontend image, verify runtime environment substitution, and curl `/api/healthz`."

### Task_6: Independent migration review and browser acceptance

- type: review
- owns: []
- depends_on: [Task_10, Task_11, Task_12]
- description: |
  Independently review architecture/build parity and run the browser E2E/visual specification below.
- acceptance:
  - Reviewer status is APPROVED with no unresolved required finding.
  - Required screenshots exist under `.playwright-cli/` and console/network findings are recorded.
  - Route, environment, API, image, player, and deployment compatibility are explicitly assessed.
- validation:
  - kind: review
    required: true
    owner: reviewer
    detail: "Review all changed files against plan acceptance, architecture gates, and repository review rules."
  - kind: e2e
    required: true
    owner: reviewer
    detail: "Run the E2E specification with playwright-cli and verify each artifact exists."

### Task_7: Harden auth callback and route-owned title lifecycle

- type: impl
- owns:
  - `app/frontend/src/routes/login.tsx`
  - `app/frontend/src/routes/_app.movies.$movie.tsx`
- depends_on: [Task_5]
- description: |
  Route authenticated callbacks only through the validated local search value and restore route-owned document title state on exit.
- acceptance:
  - External, protocol-relative, and malformed callbacks cannot trigger cross-origin history calls or redirects.
  - A valid local callback remains functional for authenticated users.
  - Leaving a movie route restores the next route's title.
- validation:
  - kind: command
    required: true
    owner: worker
    detail: "Run scoped Biome and type checks where practical; report exact changed behavior."

### Task_8: Correct dashboard navigation, mobile layout, and lint hygiene

- type: impl
- owns:
  - `app/frontend/src/components/Dashboard/DashboardLayout.tsx`
  - `app/frontend/src/styles/global.css`
  - `app/frontend/src/routes/_app.dashboard.videos.index.tsx`
  - `app/frontend/src/components/ImageWithFallback/ImageWithFallback.tsx`
- depends_on: [Task_5]
- description: |
  Make dashboard active matching exact, provide usable mobile content width, and remove obsolete lint suppressions.
- acceptance:
  - Exactly one dashboard navigation entry is current on nested routes.
  - The 390px dashboard view has usable navigation and main content without the fixed 240px squeeze.
  - Frontend lint completes without the two known unused-suppression warnings.
- validation:
  - kind: command
    required: true
    owner: worker
    detail: "Run scoped Biome validation and inspect the responsive CSS behavior."

### Task_9: Complete deployment and generated-output surfaces

- type: impl
- owns:
  - `.gitignore`
  - `.dockerignore`
  - `k8s/base/frontend/deployment.yaml`
  - `app/frontend/src/env.d.ts`
  - `app/frontend/.env.example`
  - `app/frontend/docker/.env.placeholder`
  - `app/frontend/README.md`
  - `app/frontend/CLAUDE.md`
- depends_on: [Task_5]
- description: |
  Expose signup-code configuration consistently, ignore Nitro output at effective root contexts, and retire the unused allowed-image-hostname variable.
- acceptance:
  - Kubernetes supplies `VITE_REQUIRE_SIGNUP_CODE` consistently with documented frontend runtime configuration.
  - `.output` is ignored from both repository and root Docker build contexts.
  - `VITE_ALLOWED_IMAGE_HOSTNAME` has no active declaration, placeholder, deployment, or documentation reference.
- validation:
  - kind: command
    required: true
    owner: worker
    detail: "Run scoped retirement and ignore-surface searches plus format validation."

### Task_10: Remove nested player buttons

- type: impl
- owns:
  - `app/frontend/src/components/Player/DesktopPlayer/DesktopPlayer.tsx`
  - `app/frontend/src/components/Player/DesktopPlayer/Controller/DefaultController.tsx`
  - `app/frontend/src/atoms/Player.ts`
  - `app/frontend/src/components/Player/MobilePlayer/MobilePlayer.tsx`
  - `app/frontend/src/components/Player/DesktopPlayer/Controller/PiPController.tsx`
  - `app/frontend/src/components/Player/MobilePlayer/Controller/PiPController.tsx`
  - `app/frontend/src/components/Player/Shared/Setting/Setting.tsx`
  - `app/frontend/src/components/Player/Shared/Controller/AutoPlayButton/AutoPlayButton.tsx`
  - `app/frontend/src/components/Switch/Switch.tsx`
  - `app/frontend/src/components/Player/Shared/Setting/settingDefinitions.ts`
  - `app/frontend/src/components/Player/Shared/Setting/pages/GenericPage.tsx`
  - `app/frontend/src/components/Player/Player.tsx`
  - `app/frontend/src/components/Player/PipPlayer.tsx`
- depends_on: [Task_9]
- description: "Preserve player click/keyboard behavior without rendering button descendants inside button ancestors."
- acceptance:
  - Desktop player composed DOM has no `button > button` nesting.
  - Playback and controller interactions remain available.
- validation:
  - kind: command
    required: true
    owner: worker
    detail: "Run scoped Biome/type validation and inspect interactive semantics."

### Task_11: Remove nested MovieCard links

- type: impl
- owns:
  - `app/frontend/src/components/Movie/Movie.tsx`
- depends_on: [Task_9]
- description: "Preserve row-card movie, series, and user navigation without nesting anchors."
- acceptance:
  - Row MovieCard composed DOM has no `a > a` nesting.
  - Movie, series, and user destinations remain independently reachable.
- validation:
  - kind: command
    required: true
    owner: worker
    detail: "Run scoped Biome/type validation and inspect link regions."

### Task_12: Remove dashboard route component exports

- type: impl
- owns:
  - `app/frontend/src/routes/_app.dashboard*.tsx`
- depends_on: [Task_9]
- description: "Remove unnecessary default page-component exports so TanStack can code-split route modules without warnings."
- acceptance:
  - Dashboard route modules export `Route` only unless another export is required by runtime code.
  - Generated route inventory and dashboard behavior remain unchanged.
- validation:
  - kind: command
    required: true
    owner: worker
    detail: "Run scoped export search and Biome/type validation."

## Task Waves (explicit parallel dispatch sets)

- Wave 1 (parallel): [Task_1]
- Wave 2 (parallel): [Task_2, Task_3, Task_4]
- Wave 3 (parallel): [Task_5]
- Wave 4 (parallel): [Task_7, Task_8, Task_9]
- Wave 5 (parallel): [Task_6]
- Wave 6 (parallel): [Task_10, Task_11, Task_12]
- Wave 7 (parallel): [Task_6]

## E2E / Visual Validation Spec

- provider: `playwright-cli`
- artifact_root: `.playwright-cli`
- base_url: `http://127.0.0.1:3000`
- app_start_command: `pnpm -F @video-host/backend build && pnpm -F @video-host/frontend dev`
- readiness_check: `GET http://127.0.0.1:3000/api/healthz` returns HTTP 200 and `{"message":"OK"}`.
- flows:
  - Public shell: open `/`, verify Japanese document metadata, header/sidebar/content, navigation progress, theme persistence, and screenshot.
  - Authentication: open `/login` and `/register`, verify global chrome is absent, callback query handling is safe, and screenshot login.
  - Dynamic route: open one available movie/series/user route or use bounded API mocking, verify title, image fallback, loading/error behavior, and navigation.
  - Player continuity: start an available/mocked movie, navigate away, verify PiP/portal continuity and return navigation.
  - Dashboard: with available auth state or bounded API mocking, open dashboard index, list, new, and edit paths; verify active navigation and responsive layout.
- viewports: mobile 390x844 and desktop 1440x900.
- evidence_requirements: screenshots at `.playwright-cli/tanstack-home-desktop.png`, `.playwright-cli/tanstack-home-mobile.png`, `.playwright-cli/tanstack-login.png`, `.playwright-cli/tanstack-dynamic-route.png`, `.playwright-cli/tanstack-dashboard.png`; console errors; failed requests; unexpected redirects; explicit artifact existence check.
- known_flakiness: backend/media fixtures may be unavailable; use bounded request mocking for display-state evidence and separately label expected API/media failures.

## Rollback / Safety

- The migration is confined to the frontend package and delivery wiring; reverting the cohesive worktree diff restores the Next runtime without backend or data migration.
- Do not commit, rewrite history, force-push, or publish images as part of this task.

## Progress Log (append-only)

- 2026-08-31 20:45 Plan started: [Task_1]
  - Summary: Research completed; repository rules bootstrapped and refreshed; direct user execution instruction treated as plan approval.
  - Validation evidence: current architecture, CI, container, routes, and official TanStack APIs reviewed.
  - Notes: GitHub open-PR lookup is unavailable; no Git mutation is planned.

- 2026-08-31 21:15 Wave 1 completed: [Task_1]
  - Summary: TanStack Start/Vite SPA foundation, typed env, root document, generated route tree, and health server route landed.
  - Validation evidence: dependency install, backend build, frontend lint/typecheck/build, generated route inspection, and live HTTP 200 health response passed.
  - Notes: Required Worker evidence is complete; temporary `/` route will be replaced in Wave 2. Generated-file and SPA-mask lessons were promoted to repository rules.

- 2026-08-31 21:45 Wave 2 completed: [Task_2, Task_3, Task_4]
  - Summary: Shared components, public/auth routes, and all dashboard routes migrated; legacy route files removed; obvious invalid movie/login destinations corrected.
  - Validation evidence: Worker scoped Biome and broad absence checks passed; Orchestrator regenerated 22 route-tree full-path entries, frontend lint checked 179 files, typecheck passed via raw-proxy verification, and SPA build/prerender passed.
  - Notes: First integrated build exposed a missed `NEXT_PUBLIC_API_ENDPOINT` in `src/lib/client.ts`; the Task_2 follow-up centralized it on typed Vite env and the rerun passed. Build reports a pre-existing/high bundle-size warning for the app shell, carried to review.

- 2026-08-31 22:35 Wave 3 implementation completed: [Task_5]
  - Summary: Next/sharp removed; Nitro standalone `.output`, runtime VITE substitution, Docker/Kubernetes/CI, ignore files, and frontend documentation migrated.
  - Validation evidence: Frozen install, backend build, frontend lint/format/typecheck/build, standalone Node listener, exact health JSON, special-character runtime env replacement, and active retirement searches passed.
  - Notes: Orchestrator Docker image gate is pending because all local Docker contexts are stopped and Colima VZ disk attachment remains locked after non-destructive repair attempts; VM deletion/recreation was not attempted.

- 2026-08-31 23:05 Wave 4 remediation started: [Task_7, Task_8, Task_9]
  - Summary: Independent review returned NEEDS_REVISION with auth callback, title lifecycle, dashboard navigation/mobile, deployment surface, ignore hygiene, and lint findings.
  - Validation evidence: Reviewer reproduced a cross-origin `history.pushState` SecurityError and captured the required desktop/mobile screenshots; production Node health and player continuity passed.
  - Notes: Docker image build/run remains a required unresolved gate; no waiver has been granted.

- 2026-08-31 23:15 Wave 4 remediation completed: [Task_7, Task_8, Task_9]
  - Summary: Authenticated callbacks now use validated typed navigation; movie titles clean up on exit; dashboard active state/mobile width and lint warnings are corrected; Kubernetes, runtime env declarations, and root ignore surfaces are aligned.
  - Validation evidence: All Worker scoped checks passed; Orchestrator backend build, frontend lint (178 files, zero warnings), typecheck, Nitro production build/prerender, diff check, Kustomize render, and standalone production health HTTP 200 with exact JSON passed.
  - Notes: The ignored local `app/frontend/.env` still contains the retired image-host variable, but no tracked source or runtime consumer remains. Docker image build/run remains pending because the local daemon is unavailable; Wave 5 re-review proceeds with that blocker explicit.

- 2026-08-31 23:25 Wave 5 browser readiness follow-up started: [Task_6]
  - Summary: Re-review closed every code finding but could not connect to the required `127.0.0.1:3000` origin because Vite's default localhost bind was not reachable over IPv4 loopback in the validation environment.
  - Validation evidence: A same-process diagnostic returned health HTTP 200 through `localhost` and connection refused through `127.0.0.1`.
  - Notes: Integration now pins Vite to `127.0.0.1` and strict port 3000 before the final browser rerun; Docker remains independently blocked.

- 2026-08-31 23:35 Wave 6 console-clean remediation started: [Task_10, Task_11, Task_12]
  - Summary: Browser acceptance reached dynamic and dashboard flows and refreshed all artifacts, then found invalid nested player buttons, nested MovieCard anchors, and unnecessary dashboard route exports.
  - Validation evidence: React console diagnostics identified the exact component seams; all five required screenshots now exist.
  - Notes: Structured assertion output was truncated by warning volume, so the final targeted re-review must emit compact results first; Docker remains blocked.

- 2026-08-31 23:55 Wave 6 console-clean remediation completed: [Task_10, Task_11, Task_12]
  - Summary: Desktop/mobile/default/PiP/settings player compositions no longer nest buttons; row MovieCards use sibling overlay/detail links; unused dashboard page default exports are removed.
  - Validation evidence: All Worker scoped Biome and frontend typechecks passed; route inventory remains unchanged and all WrapperRefAtom consumers typecheck with `HTMLElement`.
  - Notes: Orchestrator integrated checks and a compact console-focused browser re-review are next; Docker remains blocked.

- 2026-09-01 01:00 Wave 7 browser acceptance completed: [Task_6]
  - Summary: Independent recovery review approved the browser/code scope after closing callback boundary, settings semantics, interactive nesting, dashboard responsive/active state, route export, and durable player target cleanup findings.
  - Validation evidence: `.playwright-cli/tanstack-acceptance.json` parses with `browserEvidenceVerdict: APPROVED`; callback 4-case matrix, title restoration, desktop/mobile dashboard, same-node visible PiP, image fallback, zero failed requests/unexpected HTTP errors/redirects, and all five screenshots passed.
  - Notes: No blocking browser/code finding remains. Overall Task 6 is still blocked only by the required Docker image build/run gate without waiver.

- 2026-09-01 01:05 Docker gate rechecked: [Task_5, Task_6]
  - Summary: Selected context remains Colima; both sandboxed and escalated daemon checks failed.
  - Validation evidence: Escalated `rtk docker info` reported `Cannot connect to the Docker daemon at unix://$HOME/.colima/default/docker.sock`.
  - Notes: Container build/start, in-container health, and runtime substitution cannot run until the daemon is repaired, or the user grants an explicit time-bounded waiver.

- 2026-09-01 01:45 Docker gate resumed after environment recovery: [Task_5, Task_6]
  - Summary: Colima became reachable; the frontend image built successfully and the standalone container returned exact health JSON with no runtime `node_modules`.
  - Validation evidence: Special-character API and site-name values were present in client assets and all public placeholders were absent from `.output/public`.
  - Notes: Served root HTML still contained `_VITE_SITE_NAME_`, revealing that Nitro's server bundle also requires runtime substitution; the image gate remains open until rebuild/retest.

- 2026-09-01 01:50 Decision: Substitute public runtime values in Nitro server bundles.
  - Trigger / new insight: Container `GET /` was server-rendered from `.output/server` and retained the build placeholder although client assets were correct.
  - Plan delta (what changed): Task 5's replacer scans supported text files in both `.output/public` and `.output/server`, including `.mjs`; container acceptance now checks served HTML too.
  - Tradeoffs considered: Public `VITE_*` values are already embedded in client output, so replacing the equivalent server bundle literals aligns the two rendering paths without introducing secret handling.
  - User approval: covered by the requested runtime/container verification before PR creation.

- 2026-09-01 00:05 Wave 6 AutoPlayButton follow-up started: [Task_10]
  - Summary: Targeted browser validation closed player wrapper and MovieCard nesting but found one remaining outer native button around a Radix Switch in `AutoPlayButton`.
  - Validation evidence: React emitted the exact nested-button component stack; dashboard route-export warnings and nested-anchor errors were absent.
  - Notes: Task 10 expands to make the Radix Switch the sole AutoPlay interactive element; the next review is console-only.

- 2026-09-01 00:15 Wave 6 settings-switch follow-up started: [Task_10]
  - Summary: Console-only review confirmed AutoPlay and prior nesting fixes, then found the settings toggle row button wrapping a display-only shared `Switch` implemented as another Radix button.
  - Validation evidence: The shared Switch has only one consumer and no change handler; the enclosing GenericPage row owns all interaction.
  - Notes: Convert the shared settings Switch to an aria-hidden visual indicator so the enclosing row button remains the sole control; no public component contract changes.

- 2026-09-01 00:25 Decision: Make settings toggles consume explicit next values.
  - Trigger / new insight: The browser correctly targeted the window-fullscreen row, but its display state did not change; setting callbacks ignored the `onChange(nextValue)` contract and toggled captured/current state instead.
  - Plan delta (what changed): Task 10 also owns setting definitions and GenericPage; toggle callbacks set the provided boolean and row buttons expose `aria-pressed`.
  - Tradeoffs considered: Explicit next-state assignment is idempotent and matches the existing SettingItem contract, while implicit inversion is sensitive to duplicate/stale event delivery and is harder to assert accessibly.
  - User approval: covered by preserving settings behavior during player DOM remediation.

- 2026-09-01 00:40 Decision: Revalidate login callback at the navigation side-effect boundary.
  - Trigger / new insight: Independent evidence recovered exact authenticated outcomes showing external and malformed callback values reached `navigate` as same-origin invalid paths despite route-level `validateSearch`.
  - Plan delta (what changed): Task 7 re-sanitizes the component search value immediately before authenticated navigation; the four-case final pathname matrix is rerun.
  - Tradeoffs considered: Revalidation is intentionally redundant for a security-sensitive redirect boundary and preserves valid local callbacks without weakening route typing.
  - User approval: covered by the migration's existing callback-safety acceptance criterion.

- 2026-09-01 00:50 Decision: Make durable player target cleanup ownership-aware.
  - Trigger / new insight: Evidence showed the persistent video node remained connected but the PiP target was empty; the movie target cleanup could clear a newer PiP registration.
  - Plan delta (what changed): Task 10 also owns the movie and PiP target registrars; cleanup compares target identity before clearing `DurablePlayerAtom`.
  - Tradeoffs considered: Owner comparison preserves the single-slot atom and current portal architecture while preventing stale unmount ordering from revoking the current destination.
  - User approval: covered by the migration's persistent player/PiP compatibility requirement.

- 2026-08-31 23:45 Decision: Widen the shared player wrapper reference to `HTMLElement`.
  - Trigger / new insight: Removing the desktop outer button changes its wrapper to a div, while `WrapperRefAtom` still encoded `HTMLButtonElement` and forced an unsafe cast.
  - Plan delta (what changed): Task 10 ownership expands to `src/atoms/Player.ts`; the atom type becomes `HTMLElement | null` for both mobile button and desktop div consumers.
  - Tradeoffs considered: All consumers use only shared element sizing, observation, and fullscreen APIs; retaining a button-specific type would misstate the invariant and conceal future incompatibility behind a cast.
  - User approval: covered by the player DOM remediation required to complete the migration.
  - ADR warrant: no; this is a local, reversible type correction whose rationale is cheaply re-derived from the consumers and normal type review.

- 2026-08-31 23:50 Decision: Apply the interactive-nesting invariant across every player composition.
  - Trigger / new insight: The desktop fix exposed the same layout-only outer button pattern in mobile player, both PiP controllers, and the settings viewport; a third seam-specific follow-up tripped the long-horizon value audit.
  - Plan delta (what changed): Task 10 owns all remaining player outer-button compositions and removes button ancestry around descendant controls in one pass.
  - Tradeoffs considered: Value audit: console-clean EARNS-ITS-PLACE because React emits real DOM errors; layout-only controller/settings buttons are DELETE because child controls already own interaction; full-surface playback remains but is simplified into a sibling native playback control rather than an interactive ancestor.
  - User approval: covered by completing browser-safe player compatibility in the requested migration.

- 2026-09-01 02:05 Migration closeout completed: [Task_1, Task_2, Task_3, Task_4, Task_5, Task_6, Task_7, Task_8, Task_9, Task_10, Task_11, Task_12]
  - Summary: The TanStack Start/Nitro migration, browser acceptance, production container gate, repository rule refresh, and independent delta review are complete with no unresolved blocker.
  - Validation evidence: Backend build; frontend lint, format check, typecheck, and build; Docker image build/start; exact `/api/healthz` response; special-character runtime substitution across client and server output; served-HTML placeholder absence; standalone image packaging; Kustomize rendering; shell syntax; retirement searches; ignore checks; and `git diff --check` passed.
  - Review evidence: Browser/code review and the Docker runtime delta review both returned `APPROVED`; five required screenshots and the parse-valid acceptance JSON remain as ignored local evidence under `.playwright-cli/`.
  - Improvement loop: The missed SSR placeholder was traced to public-only artifact validation; the replacer, documentation, lesson, common rule, worker check mapping, and served-HTML acceptance boundary were updated and revalidated.
  - Long-horizon audit: Interactive player behavior EARNS-ITS-PLACE; layout-only button ancestry was DELETE; surviving playback/control composition is the simplified sibling-control design verified by browser acceptance.
  - Notes: The only residual warning is Vite's non-blocking client chunk-size warning.

## Decision Log (append-only; re-plans and major discoveries)

- 2026-08-31 20:45 Decision: Preserve current client rendering semantics with TanStack Start SPA mode.
  - Trigger / new insight: Existing pages have no SSR loaders and depend on localStorage, media, and browser-only state.
  - Plan delta (what changed): SPA mode is explicit; server routing remains enabled for health checks.
  - Tradeoffs considered: Default SSR could improve initial HTML but expands hydration/auth/player risk beyond a framework-only migration.
  - User approval: yes, via the direct migration instruction; observable behavior preservation is the governing assumption.

- 2026-08-31 21:05 Decision: Add a temporary root index route during foundation work.
  - Trigger / new insight: TanStack Start SPA shell prerender requires the configured mask path `/` to resolve before the public route migration lands.
  - Plan delta (what changed): Task_1 owns a minimal `src/routes/index.tsx`; Task_3 replaces it with the final pathless-layout index route.
  - Tradeoffs considered: Deferring build validation until Task_3 would leave the foundation gate unverifiable and serialize otherwise independent work.
  - User approval: covered by the framework migration instruction; no public contract changes.

- 2026-08-31 21:10 Decision: Exclude the generated route tree from Biome.
  - Trigger / new insight: TanStack's generator output conflicts with Biome 2.4.9 formatting at the terminal newline despite generated-file suppressions.
  - Plan delta (what changed): Task_1 also owns `app/frontend/.biomeignore` and excludes only `src/routeTree.gen.ts`.
  - Tradeoffs considered: Reformatting generated output would be unstable and regenerated on every route change.
  - User approval: covered by the migration instruction; this is generated-file hygiene only.

- 2026-08-31 21:15 Decision: Configure the generated-file exclusion in Biome 2's active configuration.
  - Trigger / new insight: Biome 2.4.9 ignores the legacy `.biomeignore`; a direct lint rerun still inspected the generated route tree.
  - Plan delta (what changed): Task_1 owns `app/frontend/biome.json`, adds the narrow negated include there, and removes its ineffective `.biomeignore` edit.
  - Tradeoffs considered: Keeping an ineffective ignore entry would mislead future maintainers and fail the actual lint gate.
  - User approval: covered by the migration instruction; the remediation is limited and reversible.

- 2026-08-31 21:20 Decision: Centralize Wave 2 route-tree regeneration and integrated checks.
  - Trigger / new insight: Parallel route Workers would race on the shared generated `routeTree.gen.ts`, which none of them owns.
  - Plan delta (what changed): Workers own scoped absence/Biome checks; the Orchestrator owns route-tree regeneration plus integrated lint/typecheck/build after all three reports.
  - Tradeoffs considered: Serializing route tasks would avoid the shared generator but substantially lengthen the migration without improving evidence.
  - User approval: covered by the migration instruction; validation strength is preserved.

- 2026-08-31 21:30 Decision: Keep the frontend Biome config as a nested config and declare `root: false`.
  - Trigger / new insight: Biome 2 rejected the existing frontend config as a second root once the generated-file exclusion caused Wave 2 to exercise it directly.
  - Plan delta (what changed): Integration adds the required nested-config marker and reruns Biome; the route-tree exclusion stays in the frontend scope.
  - Tradeoffs considered: Value audit verdict is EARNS-ITS-PLACE because the nested config owns frontend-only Tailwind parsing and media-caption policy; merging it into the repository root would broaden those exceptions.
  - User approval: covered by the migration instruction; no runtime behavior changes.

- 2026-08-31 21:50 Decision: Package the verified current TanStack Start `dist` server output.
  - Trigger / new insight: The installed current Start/Vite toolchain produces `dist/server/server.js` and `dist/client`, not the older Nitro `.output` shape suggested during initial research.
  - Plan delta (what changed): Task_5 must start and package the verified `dist` artifact and retarget runtime substitution to its client assets.
  - Tradeoffs considered: Forcing an obsolete Nitro layout would add an unnecessary adapter and diverge from the actual supported build output.
  - User approval: covered by the migration instruction; external port and health contracts remain unchanged.

- 2026-08-31 22:05 Decision: Use the official Nitro Vite adapter for Node/Docker deployment.
  - Trigger / new insight: `dist/server/server.js` is only a universal Fetch export and exits without listening; current TanStack hosting guidance requires `nitro/vite` to produce the executable standalone `.output/server/index.mjs`.
  - Plan delta (what changed): Add `nitro`, add `nitro()` after `tanstackStart()` in `vite.config.ts`, package `.output`, retarget runtime substitution to `.output/public`, and expand Task_5 ownership to root package cleanup and remaining Next-only artifacts.
  - Tradeoffs considered: Nitro is the official standalone path but its current latest release is beta; a custom Node launcher avoids beta labeling but creates a repository-owned deployment adapter and extra maintenance.
  - User approval: yes, explicitly approved on 2026-08-31.

- 2026-08-31 22:25 Decision: Migrate active ignore and Kubernetes environment surfaces.
  - Trigger / new insight: Repo-wide retirement search found `.next`/`next-env.d.ts` entries in tracked ignore files and four `NEXT_PUBLIC_*` variables in the frontend Kubernetes deployment.
  - Plan delta (what changed): Task_5 ownership expands to the root/frontend ignore files and `k8s/base/frontend/deployment.yaml`; Kubernetes variables change to the canonical `VITE_*` names.
  - Tradeoffs considered: Leaving deployment variables unchanged would build successfully but silently break runtime frontend configuration.
  - User approval: covered by the approved full frontend/runtime migration; no secret values or external contracts change.

- 2026-08-31 22:30 Decision: Repair the stopped Colima validation environment without deleting VM data.
  - Trigger / new insight: Docker validation is required, but Colima reports stopped while two orphaned profile-specific `limactl usernet` processes retain stale runtime state and prevent VZ disk attachment.
  - Plan delta (what changed): Terminate only the stopped profile's orphaned usernet/daemon processes, restart the existing profile, and retry the Docker gate; do not delete or recreate the VM.
  - Tradeoffs considered: Value audit verdict for the Docker gate is EARNS-ITS-PLACE because container packaging changed; the orphan processes are DELETE because the profile is stopped and they have no live VM consumer.
  - User approval: covered by the approved Docker validation and scoped Colima start/stop approvals.

- 2026-08-31 23:05 Decision: Add a focused remediation wave before repeating independent acceptance.
  - Trigger / new insight: The first independent review found required behavioral and delivery-surface defects despite successful lint, typecheck, build, and production Node health checks.
  - Plan delta (what changed): Tasks 7-9 split auth/title, dashboard/responsive, and delivery-surface ownership; Task 6 now depends on their integration and includes the strengthened regression matrix.
  - Tradeoffs considered: Keeping fixes in one shared task would increase ownership conflicts and obscure which evidence closes each finding.
  - User approval: covered by the requested migration and explicit approval to continue with the Nitro delivery path.

- 2026-08-31 23:10 Decision: Extend Task 9 to the Kubernetes config source and production overlay.
  - Trigger / new insight: The deployment reads frontend environment values from `frontend-config`, so changing only the Deployment would leave the signup-code key undefined and the retired image-host key active in generated configuration.
  - Plan delta (what changed): Task 9 also owns the base config sample and production kustomization generator entries.
  - Tradeoffs considered: Omitting the config producers would satisfy source compilation but break deployment-surface parity.
  - User approval: covered by the existing runtime environment migration scope.

- 2026-09-01 02:05 Decision: No separate ADR is warranted for migration implementation choices.
  - Trigger / new insight: Closeout requires a warrant sweep of the plan's architecture decisions.
  - Plan delta (what changed): Record the audit result without creating a decision-record directory or ADR.
  - Tradeoffs considered: SPA mode and Nitro's executable Node adapter are visible in current configuration and cheaply re-derivable from the browser-only state/media constraints and standalone container contract; normal review can detect an incompatible change, so the costly, loseable-reasoning threshold is not met.
  - User approval: no separate approval required because no durable ADR artifact or convention is being introduced.

## Notes

- Risks: runtime environment injection, generated route inventory, client-only hydration, player continuity, styled-jsx removal, native-image sizing, and Node output/container parity.
- Edge cases: typed routing may expose two existing invalid internal destinations; fixes must be limited to intended existing routes and recorded by the owning Worker.
