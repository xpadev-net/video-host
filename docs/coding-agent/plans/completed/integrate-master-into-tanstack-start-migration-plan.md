# Plan: Integrate master into the TanStack Start migration

- status: done
- generated: 2026-10-01
- last_updated: 2026-10-01
- work_type: code

## Goal

- Integrate `master` changes since merge base `afa2bec733a643b00e0c426c50dce6535e1a8ba7` into PR #54 without restoring Next.js or regressing the completed TanStack Start migration.

## Definition of Done

- Current `master` backend, ffmpeg-worker, Prisma, SSO, LIMITED visibility, upload-flow, multi-audio, and OpenTelemetry behavior is present on `codex/tanstack-start-migration`.
- SSO/password-auth, LIMITED viewer selection, resumable upload, and multi-audio UI behavior is available through TanStack file routes with the current public URLs.
- Active frontend source and delivery configuration contains no Next.js, styled-jsx, `.next`, or `NEXT_PUBLIC_*` dependency.
- `routeTree.gen.ts` contains the new auth routes, `pnpm-lock.yaml` is regenerated from the reconciled manifests, and a frozen install succeeds.
- Rendered Kubernetes configuration contains both existing Vite runtime keys and the new SSO/OpenTelemetry configuration producers and consumers.
- Required workspace, frontend, backend, worker, Kubernetes, container, and desktop/mobile browser validation passes, followed by independent review approval.

## Planner-added requirements

- Regenerate the lockfile from manifests instead of resolving dependency graph conflicts by hand. Needed because: hand-merging the Next and TanStack dependency graphs could silently restore Next or remove Nitro.
- Preserve navigation-boundary callback sanitization, ownership-aware player cleanup, and explicit next-value setting toggles. Needed because: repository lessons identify these as previously fixed migration regressions that overlap the incoming changes.
- Validate Kubernetes configuration from rendered Kustomize output and validate runtime placeholders in served HTML plus both Nitro output trees. Needed because: repository rules and lessons identify source-only checks as insufficient for these delivery contracts.

## Scope / Non-goals

- Scope: merge current `master`; reconcile conflicting manifests, player settings, TypeScript config, Kubernetes sources, and lockfile; port framework-specific auth/dashboard/upload changes into TanStack routes; adapt frontend metrics to the Nitro lifecycle; regenerate artifacts; validate the integrated application.
- Non-goals: redesign backend APIs, auth token storage, upload UX, player architecture, public URLs, or deployment contracts; restore Next.js solely to reuse incoming implementations; change the semantics of features already merged to `master` beyond framework adaptation.

## Design

- Chosen: merge `master` normally and port only framework-bound frontend code into the existing TanStack route/runtime structure. Structure: preserves one frontend runtime and one source of route state, while backend contracts remain authoritative. Evolution: future frontend work continues on the repository's stated TanStack direction in `docs/coding-agent/plans/completed/tanstack-start-frontend-migration-plan.md`, with Next removal remaining complete. Verification: incoming feature behavior can be compared against `master` and exercised through focused browser flows plus existing workspace gates. Operation: Nitro remains the sole frontend server, with metrics attached through a server-only Nitro-compatible seam and disabled cleanly when unconfigured. Human: route ownership stays predictable and the final dependency graph has no dual-framework ambiguity. Safety: existing auth callback sanitization and runtime public-configuration boundaries remain enforced.
- Alternative: restore or retain Next pages/instrumentation alongside TanStack routes and defer ports. Structure: duplicates routing/runtime ownership and configuration. Evolution: increases framework debt and makes later deletion broader. Verification: behavior would be split across two runtimes and container paths. Operation: two server assumptions compete for one deployed frontend. Human: route and instrumentation ownership becomes ambiguous. Safety: callback and environment handling would cross inconsistent boundaries.
- Why chosen: the normal merge preserves Git history and all newer `master` work, while the focused ports maintain the approved migration direction and minimize semantic divergence from both heads.

## Compatibility stance

- surface: backend Hono declarations and upload/auth/visibility contracts consumed by the frontend
- stance: migrate
- justification: locatable consumers are the frontend service/hooks and TanStack dashboard/auth routes in `app/frontend/src`; they are in scope and will be updated together.
- surface: public frontend URLs, auth token storage, player continuity, runtime environment keys, and Kubernetes delivery contract
- stance: preserve
- justification: locatable consumers are existing links/callbacks, localStorage auth logic, persistent player components, container startup substitution, and deployment manifests documented by the completed migration plan and `app/frontend/CLAUDE.md`.

## Context (workspace)

- Related files/areas: `app/backend/**`, `app/ffmpeg-worker/**`, `app/frontend/src/routes/**`, frontend auth/upload/player code, frontend manifests/runtime, Kubernetes config, `pnpm-lock.yaml`.
- Existing patterns or references: `app/frontend/CLAUDE.md`; `docs/coding-agent/rules/common.md`; `docs/coding-agent/rules/orchestrator.md`; `docs/coding-agent/lessons.md`; `docs/coding-agent/plans/completed/tanstack-start-frontend-migration-plan.md`.
- Design record consulted and deviations from its acceptance: the completed migration plan is the controlling direction; no deviation is planned.

## Open Questions (max 3)

- None blocking. The exact Nitro server hook for frontend metrics is selected during Task_5; if Nitro exposes no equivalent request-error lifecycle, the task must replan rather than reintroduce a Next-specific shim.

## Assumptions

- Current merge heads are migration `a8a6760bdfc9f055d9bcec994dc8df84f3e75bf7` and `master` `367b3976f6e2b076371cdf7222676f3a1e159b48` — source: local Git refs inspected 2026-10-01.
- The incoming backend and ffmpeg-worker changes merge without textual conflicts, but still require full semantic validation — source: `git merge-tree` research against the two heads.
- New auth routes belong outside the authenticated `_app` shell, matching the current login/register shell behavior — source: `app/frontend/src/routes/login.tsx` and `app/frontend/src/routes/register.tsx`.

## Tasks

### Task_1: Establish the normal merge and retire reintroduced Next entrypoints

- type: chore
- owns:
  - `app/frontend/src/app/**`
  - `app/frontend/src/pages/**`
  - `app/frontend/src/instrumentation.ts`
- depends_on: []
- description: |
  The Orchestrator starts a non-committing normal merge from `master`, resolves incoming modify/delete cases for retired Next pages in favor of their removal, and removes newly introduced Next-only auth and instrumentation entrypoints after preserving their behavior as source evidence for the port tasks.
- acceptance:
  - `MERGE_HEAD` points to the inspected `master` head and the integration remains a normal, uncommitted merge without rebase, history rewrite, or force push.
  - Retired Next app/page entrypoints and `instrumentation.ts` do not remain active in the integration tree.
  - All remaining conflicts are assigned to exactly one later task, and incoming behavior remains inspectable from `master` history.
- validation:
  - kind: command
    required: true
    owner: orchestrator
    detail: "Inspect merge status and unmerged paths; verify no unassigned conflict remains and source searches find no active Next entrypoint under the owned paths."

### Task_2: Integrate backend, worker, Prisma, and non-frontend deployment changes

- type: impl
- owns:
  - `app/backend/**`
  - `app/ffmpeg-worker/**`
  - `k8s/base/backend/**`
  - `k8s/base/ffmpeg-worker/**`
  - `k8s/base/config/backend-config.sample.yaml`
  - `k8s/base/config/backend-secrets.sample.yaml`
  - `k8s/base/config/ffmpeg-worker-config.sample.yaml`
- depends_on: [Task_1]
- description: |
  Preserve all incoming backend, worker, schema/migration, SSO, visibility, upload-state, queue, and metrics behavior and verify the generated API declarations used by the frontend.
- acceptance:
  - All incoming `master` changes in the owned paths remain present without framework-migration changes to backend behavior.
  - Prisma generation and backend declarations succeed and expose the incoming auth, visibility, movie-status, and upload contracts.
  - Worker queue/encoding/metrics behavior retains the incoming race and recovery fixes.
- validation:
  - kind: command
    required: true
    owner: worker
    detail: "Run backend prisma generation, lint, format check, typecheck, tests, and build; run ffmpeg-worker typecheck."
  - kind: review
    required: true
    owner: reviewer
    detail: "Verify incoming backend/worker commits were not semantically dropped during integration."

### Task_3: Port SSO and password-auth flows to TanStack routes

- type: impl
- owns:
  - `app/frontend/src/routes/login.tsx`
  - `app/frontend/src/routes/register.tsx`
  - `app/frontend/src/routes/auth.callback.tsx`
  - `app/frontend/src/routes/auth.link.tsx`
  - `app/frontend/src/routes/_app.dashboard.index.tsx`
  - `app/frontend/src/hooks/useAuth.ts`
  - `app/frontend/src/service/getAuthConfig.ts`
- depends_on: [Task_2]
- description: |
  Port the incoming password-auth configuration, SSO login/error/callback, and account-link behavior into TanStack routes while preserving the existing callback safety boundary and public URLs.
- acceptance:
  - Login and registration reflect loading, disabled password auth, SSO availability, and SSO errors without Next APIs.
  - `/auth/callback` handles token/error fragments safely and `/auth/link` performs one-time link confirmation.
  - Dashboard account linking and the hostile/local callback matrix preserve same-origin navigation safety.
- validation:
  - kind: command
    required: true
    owner: worker
    detail: "Run frontend lint and typecheck after backend declarations are built."
  - kind: e2e
    required: true
    owner: reviewer
    detail: "Exercise password-disabled registration, SSO login/error/callback/link, and hostile/protocol-relative/malformed/local callback cases."

### Task_4: Port LIMITED visibility and resumable upload behavior

- type: impl
- owns:
  - `app/frontend/src/components/UserPicker/**`
  - `app/frontend/src/hooks/useUpload.ts`
  - `app/frontend/src/routes/_app.dashboard.videos.index.tsx`
  - `app/frontend/src/routes/_app.dashboard.videos.new.tsx`
  - `app/frontend/src/routes/_app.dashboard.videos.$id.edit.tsx`
  - `app/frontend/src/routes/_app.dashboard.playlists.$id.edit.tsx`
  - `app/frontend/src/routes/_app.dashboard.series.$id.edit.tsx`
  - `app/frontend/src/utils/visibility2str.ts`
- depends_on: [Task_2]
- description: |
  Port the incoming two-stage upload state machine, resume/retry/cancel and leave-guard behavior, LIMITED movie viewer selection, and BasicVisibility restrictions for playlists and series into TanStack dashboard routes.
- acceptance:
  - Create, upload, edit, resume, retry, and cancel behavior matches the incoming backend contract and tolerates `UPLOADING` records.
  - LIMITED is available only for movies and persists the selected viewer set; playlist/series editors remain restricted to `BasicVisibility`.
  - Route navigation and leave guards do not use Next APIs and do not lose committed upload state.
- validation:
  - kind: command
    required: true
    owner: worker
    detail: "Run frontend lint, typecheck, and focused source searches for Next imports in owned paths."
  - kind: e2e
    required: true
    owner: reviewer
    detail: "Exercise create-upload-edit, resume/retry/cancel, leave guard, LIMITED viewer selection, and list/edit status rendering."

### Task_5: Integrate multi-audio player support without migration regressions

- type: impl
- owns:
  - `app/frontend/src/@types/Player.d.ts`
  - `app/frontend/src/atoms/Player.ts`
  - `app/frontend/src/components/Player/Shared/Video.tsx`
  - `app/frontend/src/components/Player/Shared/Setting/pages/GenericPage.tsx`
  - `app/frontend/src/components/Player/Shared/Setting/settingDefinitions.ts`
- depends_on: [Task_2]
- description: |
  Combine incoming HLS audio-track state and settings UI with the migration branch's generic wrapper typing, explicit toggle values, and persistent-player lifecycle fixes.
- acceptance:
  - Available audio tracks are discovered, selected, and restored through the existing settings UI.
  - Existing setting toggles remain idempotent and use the requested next value.
  - Persistent player/PiP continuity and ownership-aware target cleanup remain intact across route changes.
- validation:
  - kind: command
    required: true
    owner: worker
    detail: "Run frontend lint, typecheck, and build."
  - kind: e2e
    required: true
    owner: reviewer
    detail: "Exercise audio-track switching, settings toggles, same-node PiP, and route-to-route player persistence."

### Task_6: Adapt frontend OpenTelemetry and reconcile deployment configuration

- type: impl
- owns:
  - `app/frontend/package.json`
  - `app/frontend/src/lib/otel.ts`
  - `app/frontend/src/server/**`
  - `app/frontend/vite.config.ts`
  - `k8s/base/config/frontend-config.sample.yaml`
  - `k8s/base/frontend/deployment.yaml`
  - `k8s/overlays/prod/kustomization.yaml`
- depends_on: [Task_2]
- description: |
  Replace the incoming Next instrumentation seam with a server-only Nitro-compatible lifecycle, retain TanStack/Vite/Nitro dependencies, and reconcile frontend Vite keys with incoming SSO and OpenTelemetry configuration producers and consumers.
- acceptance:
  - Frontend metrics initialize only on the server through a supported Nitro/TanStack seam, remain disabled when unconfigured, and do not enter browser bundles.
  - The frontend manifest retains TanStack/Vite/Nitro, adds required OpenTelemetry packages, and does not restore Next or sharp.
  - Rendered production Kustomize output contains existing Vite runtime keys, frontend OpenTelemetry keys, and incoming backend SSO/password-auth/frontend-url keys.
- validation:
  - kind: command
    required: true
    owner: worker
    detail: "Run frontend build and `kubectl kustomize k8s/overlays/prod`; inspect client bundles for server-only OpenTelemetry leakage."
  - kind: manual
    required: true
    owner: reviewer
    detail: "Verify Nitro production startup and clean metrics-disabled behavior."

### Task_7: Regenerate integration artifacts and run full validation

- type: chore
- owns:
  - `app/frontend/tsconfig.json`
  - `app/frontend/src/routeTree.gen.ts`
  - `pnpm-lock.yaml`
- depends_on: [Task_3, Task_4, Task_5, Task_6]
- description: |
  Resolve configuration in favor of the TanStack compiler model, regenerate the route tree and dependency lockfile from authoritative sources, run repository-wide and delivery validation, then have the Orchestrator create the normal merge commit after the pre-commit gate passes.
- acceptance:
  - TypeScript remains on the current ES2022/Bundler configuration with no Next plugin or include paths.
  - The generated route tree includes `/auth/callback` and `/auth/link` and matches the full route inventory.
  - Frozen install passes and the frontend importer contains TanStack/Nitro plus OpenTelemetry with no Next/sharp dependency.
  - Retirement searches across active sources report zero hits for Next imports, styled-jsx, `.next`, and `NEXT_PUBLIC_*`.
  - The resulting merge commit has the prior migration head and inspected `master` head as parents, with no rewritten history or force push.
- validation:
  - kind: command
    required: true
    owner: orchestrator
    detail: "Run install and frozen install; backend, worker, frontend, and workspace lint/typecheck/test/build gates; Kustomize render; route inventory; retirement searches; `git diff --check`; the pre-commit gate; and merge-parent verification after the normal merge commit."
  - kind: manual
    required: true
    owner: orchestrator
    detail: "Build/start the frontend image; verify `/api/healthz`, runtime replacement in `.output/public` and `.output/server`, served HTML values, placeholder absence, and live process state."

### Task_8: Independent integration and browser review

- type: review
- owns: []
- depends_on: [Task_7]
- description: |
  Review the completed merge against both the incoming feature behavior and the completed migration invariants, and execute the E2E/visual specification below.
- acceptance:
  - Reviewer verdict is APPROVED with no unresolved required findings.
  - Required desktop/mobile screenshots and compact assertion evidence are captured under `.playwright-cli/`.
  - Console/network diagnostics contain no new application errors, invalid interactive nesting, or unexpected failed requests.
- validation:
  - kind: review
    required: true
    owner: reviewer
    detail: "Review the integrated diff for dropped master behavior, migration regressions, contracts, security boundaries, server/client dependency separation, and deployment completeness."
  - kind: e2e
    required: true
    owner: reviewer
    detail: "Run the E2E/visual spec using playwright-cli."

## Task Waves (explicit parallel dispatch sets)

- Wave 1 (parallel): [Task_1]
- Wave 2 (parallel): [Task_2]
- Wave 3 (parallel): [Task_3, Task_4, Task_5, Task_6]
- Wave 4 (parallel): [Task_7]
- Wave 5 (parallel): [Task_8]

## E2E / Visual Validation Spec

- provider: `playwright-cli`
- artifact_root: `.playwright-cli/`
- base_url: `http://127.0.0.1:3000`
- app_start_command: build backend declarations, then run the frontend dev server bound to `127.0.0.1` on strict port `3000`
- readiness_check: `GET http://127.0.0.1:3000/api/healthz` returns HTTP 200 with `{"message":"OK"}`
- flows: SSO/password-auth login and errors; safe callback/link handling; LIMITED viewer selection; create-upload-edit/resume/retry/cancel and leave guard; multi-audio switching; persistent player/PiP; existing route/title/image fallback smoke coverage
- viewports: desktop `1440x900`; mobile `390x844`
- evidence_requirements: screenshots for auth, upload/edit, LIMITED selection, and player settings at relevant viewports; compact assertions separate from deduplicated console/network notes
- known_flakiness: fixtures may not expose real OIDC, multipart upload, or multi-audio media; when unavailable, use deterministic local stubs at the network seam and record the exact substituted boundary

## Rollback / Safety

- Use a normal merge commit and cohesive follow-up commits; do not rewrite the open PR branch history or force-push.
- Before committing, inspect the staged diff and verify unrelated untracked `.playwright-cli/` and `app/frontend/.output/` artifacts are not included.
- If integration cannot preserve both incoming feature contracts and migration invariants, abort the uncommitted merge or revert the new merge commit rather than partially dropping either side.

## Progress Log (append-only)

- 2026-10-01 00:00 Plan drafted after comparing migration `a8a6760`, `master` `367b397`, and merge base `afa2bec`.
  - Summary: identified framework-bound ports, semantic auto-merge risks, three textual conflict areas, and required delivery validation.
  - Validation evidence: Researcher conflict inventory with file/symbol evidence; existing PR CI was green before current-master integration.
  - Notes: implementation awaits explicit plan approval.
- 2026-10-01 00:01 Draft review completed: [Task_1, Task_2, Task_3, Task_4, Task_5, Task_6, Task_7, Task_8]
  - Summary: added Orchestrator-owned merge/Next-retirement work and sequenced every frontend validation after backend declaration generation.
  - Validation evidence: first plan review found two major ownership/sequencing defects; both were corrected and the plan validator will be rerun.
  - Notes: revised draft requires reviewer re-approval before user approval.
- 2026-10-01 00:02 Draft re-review completed: [Task_1, Task_7]
  - Summary: separated uncommitted merge establishment from the later normal merge commit and added explicit second-parent verification.
  - Validation evidence: re-review confirmed the prior two defects were fixed and found one merge-lifecycle acceptance contradiction; the contradiction was corrected.
  - Notes: revised draft requires final reviewer approval before user approval.
- 2026-10-01 00:03 Final draft review completed: [Task_1, Task_7]
  - Summary: independent plan review approved the ownership, sequencing, validation, and merge lifecycle.
  - Validation evidence: balanced plan validator passed; Reviewer verdict APPROVED with no blocking findings.
  - Notes: implementation awaits explicit user approval.
- 2026-10-01 00:04 Plan approved and execution started: [Task_1]
  - Summary: user approved the reviewed plan; status changed to `in_progress`.
  - Validation evidence: explicit user response `すすめて`.
  - Notes: normal merge will remain uncommitted until integration validation passes.
- 2026-10-01 00:05 Wave 1 completed: [Task_1]
  - Summary: established the uncommitted normal merge at `MERGE_HEAD=367b3976f6e2b076371cdf7222676f3a1e159b48` and removed the three reintroduced Next-only entrypoints.
  - Validation evidence: merge status inspected; all remaining conflicts map to Tasks 3–7.
  - Notes: no history rewrite or force push occurred.
- 2026-10-01 00:06 Wave 2 completed: [Task_2]
  - Summary: backend, worker, Prisma, and owned deployment paths exactly match current `master`; no corrective edits were required.
  - Validation evidence: Prisma generation; backend lint/format/typecheck; 141 backend tests; backend build; ffmpeg-worker typecheck all passed.
  - Notes: dependencies were refreshed with `--lockfile=false --ignore-scripts`; final lockfile regeneration remains Task_7.
- 2026-10-01 00:07 Wave 3 completed: [Task_3, Task_4, Task_5, Task_6]
  - Summary: ported SSO/password-auth, LIMITED visibility, resumable upload, multi-audio player support, and Nitro-native frontend metrics; reconciled Kubernetes producers and consumers.
  - Validation evidence: each Worker reported `done`; frontend lint checked 184 files, typecheck passed, production build passed, Kustomize rendered, and client bundles contained no OpenTelemetry implementation.
  - Notes: Task_3's generated route tree edit was accepted as a minimal cross-owns change and integrated under Task_7 ownership; no blockers or design alerts remain.
- 2026-10-01 00:08 Wave 4 implementation and validation completed: [Task_7]
  - Summary: regenerated `pnpm-lock.yaml` and `routeTree.gen.ts`, resolved all merge conflicts, and staged the integrated normal merge.
  - Validation evidence: normal and frozen installs passed; backend lint/format/typecheck, 141 tests, and build passed; frontend lint/format/typecheck/build passed; workspace lint/typecheck/build passed; Kustomize and retirement searches passed; Docker image build and live container runtime substitution/health checks passed.
  - Notes: temporary validation container was removed; normal merge commit and parent verification remain before Reviewer dispatch.
- 2026-10-01 00:09 Wave 5 completed: [Task_8]
  - Summary: independent integration, production-runtime, desktop, and mobile review approved the completed normal merge with no findings.
  - Validation evidence: Reviewer `APPROVED`; six non-empty screenshots; auth callback matrix, SSO UI/linking, upload cancel/retry/resume, LIMITED viewer persistence, multi-audio selection, Nitro startup, and `/api/healthz` passed.
  - Notes: real OIDC, object storage, encoder, and production media were replaced by documented deterministic seams; no At Risk item remains.
- 2026-10-01 00:10 Plan completed: [Task_1, Task_2, Task_3, Task_4, Task_5, Task_6, Task_7, Task_8]
  - Summary: all tasks and required validation are complete; merge commit `7b71685114a7f9a7094a6c95e39f669f72f61125` has expected parents.
  - Validation evidence: Worker validations passed, Orchestrator full-sweep passed, Reviewer `APPROVED` with no findings.
  - Notes: plan moved to `docs/coding-agent/plans/completed/`; no ADR, rule, or skill update is required.

## Decision Log (append-only; re-plans and major discoveries)

- 2026-10-01 00:00 Decision: use a normal merge plus targeted TanStack ports.
  - Trigger / new insight: current `master` contains multiple user-facing features implemented against Next after the migration branch diverged.
  - Plan delta (what changed): reopened migration work as a separate integration plan rather than modifying the completed original plan.
  - Tradeoffs considered: dual-runtime compatibility was rejected because it restores migration debt and weakens runtime validation.
  - User approval: no; pending.
  - Record proposed: none; the existing migration plan already records the durable framework direction.
- 2026-10-01 00:01 Decision: make merge establishment and legacy Next retirement an explicit prerequisite task.
  - Trigger / new insight: plan review showed that modify/delete conflicts and newly added Next-only files had no owner, and parallel player validation could run before backend declarations existed.
  - Plan delta (what changed): inserted Task_1, shifted all prior task IDs, and serialized backend declaration generation before all frontend work.
  - Tradeoffs considered: keeping merge setup implicit was shorter but failed ownership integrity and made validation order nondeterministic.
  - User approval: no; pending.
  - Record proposed: none; execution-process correction only.
- 2026-10-01 00:02 Decision: defer the merge commit until integration validation passes.
  - Trigger / new insight: re-review identified that an uncommitted merge cannot yet record the `master` second parent.
  - Plan delta (what changed): Task_1 now verifies `MERGE_HEAD`; Task_7 owns the pre-commit gate, normal merge commit, and parent verification.
  - Tradeoffs considered: committing before implementation would record ancestry sooner but would create a knowingly conflicted/incomplete integration point.
  - User approval: no; pending.
  - Record proposed: none; Git execution detail only.
- 2026-10-01 00:04 Decision: execute the reviewed plan.
  - Trigger / new insight: explicit user approval received.
  - Plan delta (what changed): status moved from `draft` to `in_progress`; no scope or design changes.
  - Tradeoffs considered: none; this records approval only.
  - User approval: yes; user response `すすめて`.
  - Record proposed: none; existing migration direction remains controlling.
- 2026-10-01 00:10 Decision: close the integration plan as complete.
  - Trigger / new insight: all required validation and independent review passed with no unresolved finding.
  - Plan delta (what changed): status moved from `in_progress` to `done` and the plan is archived under `completed`.
  - Tradeoffs considered: none; completion criteria are fully satisfied.
  - User approval: yes; covered by the approved execution plan.
  - Record proposed: none; no new durable architectural decision beyond the existing TanStack migration direction.

## Notes

- Risks: Next-specific instrumentation has no copy-compatible TanStack equivalent; upload is a state-machine/API migration; lockfile regeneration can expose dependency maturity or peer conflicts; browser fixtures may require deterministic local stubs.
- Edge cases: `LIMITED` applies only to movies; stale player target cleanup must not clear a newer registration; callback input must be sanitized immediately before navigation; runtime replacement must cover Nitro server and public assets.
