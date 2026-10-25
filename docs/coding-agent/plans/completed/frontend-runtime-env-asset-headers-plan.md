# Plan: Repair runtime frontend env asset responses

- status: complete
- generated: 2026-10-14
- last_updated: 2026-10-14
- work_type: code

## Goal
- Make the runtime-replaced frontend env JavaScript asset return a complete, cache-valid HTTP response.

## Definition of Done
- Runtime replacement updates Nitro's generated public-asset size and ETag metadata to match the post-replacement files.
- The deployed env asset is returned completely; Content-Length equals the received body size, and client and SSR configuration still reflect runtime values without unresolved placeholders.
- Frontend container remains healthy and `GET /api/healthz` returns 200.
- Independent review approves the implementation and required runtime evidence.

## Planner-added requirements
- Add a regression assertion for served asset body length and ETag. Needed because the existing runtime-env test validates config values and SSR HTML but misses the truncated static response that caused this incident.

## Scope / Non-goals
- Scope: `app/frontend/docker/env-replacer.sh`, its existing runtime-env test, and this plan.
- Non-goals: changing frontend env variable names or values, auth/API behavior, cache policy for unrelated assets, Kubernetes configuration, or Cloudflare routes.

## Design
- Chosen: after placeholder replacement, recompute size and ETag metadata for the modified public files in the generated Nitro server manifest. Structure: the current static-asset contract remains intact and the startup script owns the related metadata update. Evolution: limited to the existing runtime substitution path, while acknowledging its generated-manifest coupling. Verification: exercise the production Nitro server and assert complete body, length, ETag, runtime exports, and SSR output. Operation: one bounded file/metadata scan at container startup. Human: keeps the existing env module and import graph, with manifest handling documented in the entrypoint. Safety: only public built assets are read or rewritten; no secrets are printed or added to browser configuration.
- Alternative: replace the static env module with a new runtime-config endpoint consumed asynchronously by the frontend. Structure: moves config ownership to an explicit server route and changes client initialization. Evolution: avoids editing generated metadata but expands app wiring and future maintenance surface. Verification: needs endpoint, bootstrap, and client-flow coverage. Operation: adds a request and runtime dependency for configuration. Human: clearer boundary, but introduces another contract. Safety: still public configuration and requires explicit cache controls.
- Why chosen: it fixes the demonstrated metadata mismatch while preserving the current import and runtime configuration contract with the smallest production change.

## Compatibility stance
- surface: existing public `/assets/env-*.js` response and exported frontend configuration.
- stance: preserve
- justification: the deployed page imports this asset directly; its URL and exports remain unchanged, while response metadata is corrected.

## Context (workspace)
- Related files/areas: `app/frontend/docker/env-replacer.sh`; `app/frontend/tests/placeholder-runtime.test.mjs`; generated `.output/server/index.mjs` and `.output/public/assets/`.
- Existing patterns or references: `app/frontend/CLAUDE.md` documents placeholder-backed public runtime configuration; `docs/coding-agent/rules/common.md` requires serving runtime values and preserving shell-sensitive substitution.
- Incident evidence: the live asset advertises 253 bytes but sends 199 after startup substitution; Nitro's generated server manifest retains the build-time size and ETag.

## Open Questions
- None.

## Assumptions
- A1: Nitro serves static response length and ETag from the generated server asset manifest — source: live Pod response and `.output/server/index.mjs`.
- A2: Updating metadata for each modified public asset preserves the existing Nitro static serving path — to validate in Task_1.

## Tasks

### Task_1: Repair runtime asset metadata and regression coverage
- type: impl
- owns:
  - `app/frontend/docker/env-replacer.sh`
  - `app/frontend/tests/placeholder-runtime.test.mjs`
- depends_on: []
- description: |
  Keep Nitro's generated size and ETag metadata synchronized with public files after runtime environment substitution. Extend the existing production-runtime test to cover the served env asset response.
- acceptance:
  - Runtime config exports and rendered HTML still contain the configured public values and no placeholders.
  - A GET of the env asset returns the complete body, matching Content-Length and ETag.
  - Shell-sensitive environment values remain safely substituted.
- validation:
  - kind: command
    required: true
    owner: worker
    detail: "Build the backend declarations, then build frontend output with all four VITE_* vars set to their `_VITE_*_` placeholder strings (matching `app/frontend/docker/.env.placeholder`) and run `pnpm -F @video-host/frontend test:runtime-env`. Do not overwrite a user `.env` file."
  - kind: command
    required: true
    owner: worker
    detail: "Build/start the frontend container and confirm `/api/healthz` plus the env asset response."
  - kind: review
    required: true
    owner: reviewer
    detail: "Review the scoped implementation and runtime evidence against this plan."

### Task_2: Browser verify the production-served env asset
- type: review
- owns: []
- depends_on: [Task_1]
- description: |
  Run the bounded E2E flow below against the production frontend container and capture required artifacts.
- acceptance:
  - Browser receives the runtime env asset completely with matching Content-Length and ETag.
  - Signed-out page renders with the runtime site name and no unresolved VITE placeholders.
  - Required screenshot and console/network evidence exist under `.playwright-cli/`.
- validation:
  - kind: e2e
    required: true
    owner: reviewer
    detail: "Run the production-served asset and signed-out page flow using playwright-cli."

## Task Waves (explicit parallel dispatch sets)
- Wave 1 (parallel): [Task_1]
- Wave 2 (parallel): [Task_2]

## E2E / Visual Validation Spec (required)
- provider: "playwright-cli"
- artifact_root: ".playwright-cli"
- base_url: `http://127.0.0.1:3000`
- app_start_command: "Start the production frontend container built with runtime env values; do not expose secret variables to the browser."
- readiness_check: "GET /api/healthz returns 200."
- flows:
  - "Load `/`, confirm the signed-out page and runtime site name render."
  - "Read the `env-*.js` request response; assert status 200, complete body, Content-Length equals received bytes, and ETag is present and matches the response."
  - "Confirm no `_VITE_*_` placeholders remain in rendered HTML or the env asset."
- viewports: [1440x900]
- evidence_requirements: "Save a screenshot of `/`, plus console errors and failed network requests, under `.playwright-cli/`."
- known_flakiness: "None known; local container only."

## Rollback / Safety
- Revert the entrypoint and regression assertion together; rebuild the previous frontend image if a release was produced. Runtime values remain public configuration and are never written to logs.

## Progress Log (append-only)
- 2026-10-14: Plan revised after review; no implementation changes made.
  - Summary: Added reviewer-owned browser evidence and made the placeholder build setup explicit without overwriting a user `.env` file.
  - Validation evidence: Live Pod served 199 bytes with Content-Length 253; source manifest records the original size and ETag.
  - Notes: Awaiting second plan review and user approval.
- 2026-10-14: Wave 1 Task_1 implementation completed; independent review and browser evidence pending.
  - Files changed: `app/frontend/docker/env-replacer.sh`; `app/frontend/tests/placeholder-runtime.test.mjs`.
  - Worker report: `done`; ownership matched Task_1; no blockers or questions.
  - Validation evidence: Backend declarations build passed; placeholder-backed frontend build passed without overwriting `.env`; runtime-env suite passed all 4 scenarios. Local container returned `/api/healthz` 200 and env asset 200 with Content-Length 222 matching the 222-byte body and matching ETag.
  - Notes: Initial special-character regression exposed backslash loss and failed; Worker corrected the JavaScript string escaping and reran the suite successfully. Reviewer-owned code review and browser validation remain required.
- 2026-10-14: Wave 2 Task_2 browser validation and independent review completed; plan acceptance criteria satisfied.
  - Reviewer result: `APPROVED`; final diff scoped to Task_1 files; no unresolved code findings.
  - Browser evidence: Production frontend container `/api/healthz` returned 200; signed-out page showed the runtime title/login button; env asset returned 200 with Content-Length 200 matching its 200-byte response body, matching body-derived ETag, and no unresolved placeholders. Isolated browser run reported zero console errors. Missing auth/movies backend calls were mocked for the isolated pass; the unmocked 502s are recorded and no backend integration claim is made.
  - Artifacts: `.playwright-cli/task2-runtime-env-desktop-20261014.png` (1440x900 PNG), `.playwright-cli/task2-console-notes-20261014.txt`, `.playwright-cli/task2-network-notes-20261014.md`, and `.playwright-cli/console-2026-10-14T08-17-03-495Z.log`; paths exist and the screenshot is readable.
  - Notes: An initial review attempt lacked the CLI and Docker daemon; Orchestrator used the ephemeral `@playwright/cli` package and restarted the existing Colima VM. Reviewer stopped the container/session and restored Colima to its stopped state. No credentials were exposed.

## Decision Log (append-only)
- 2026-10-14 Decision: Repair the static asset metadata after runtime replacement.
  - Trigger / new insight: The frontend source already has a production-runtime test, but it does not request the client env asset over HTTP; the live response closes before its declared Content-Length.
  - Plan delta (what changed): Add a served-asset integrity assertion and regenerate the relevant Nitro metadata at startup.
  - Tradeoffs considered: Updating existing manifest metadata is narrow but coupled to Nitro output; a runtime-config endpoint is more explicit but changes client bootstrap and adds a new request contract.
  - User approval: Pending.
  - Record proposed: none.
- 2026-10-14 Decision: Proceed with the reviewed implementation plan.
  - Trigger / new insight: User approved the Reviewer-approved plan after the content-length mismatch and proposed runtime metadata repair were presented.
  - Plan delta (what changed): Plan status moved to `in_progress`; Task_1 and Task_2 are authorized.
  - Tradeoffs considered: None beyond the alternatives already recorded above.
  - User approval: yes.
  - Record proposed: none.
