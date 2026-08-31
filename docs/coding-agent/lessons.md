# Coding Agent Lessons

## 2026-08-31: Package maturity policy affects dependency selection

- Deviation: The first TanStack/Vite install selected releases rejected by the workspace minimum-release-age policy.
- Root cause: Caret ranges resolved to packages newer than the configured maturity window.
- Prevention: Check package maturity policy and select the newest mature compatible release before installation.

## 2026-08-31: SPA prerender may require localhost binding

- Deviation: The first SPA build compiled bundles but could not prerender while local listener creation was sandboxed.
- Root cause: TanStack Start SPA prerender starts a local server to fetch the shell mask path.
- Prevention: Allow a scoped localhost binding when required to validate TanStack Start SPA production builds.

## 2026-08-31: RTK built-in command collisions

- Deviation: `rtk env` and `rtk test` selected RTK handlers instead of the intended Unix commands during validation.
- Root cause: The Unix command names collide with RTK built-ins.
- Prevention: Use `rtk proxy` when exact Unix `env`, `test`, or pipeline semantics are required; when filtered pnpm commands report inconsistent exit status, run package checks from that package's working directory.

## 2026-08-31: Colima VZ disk lock blocked container validation

- Deviation: Colima remained stopped but failed repeated starts because macOS VZ reported its disk in use; Docker Desktop/default contexts were also unavailable.
- Root cause: The VZ disk attachment state persisted after scoped Colima stop and orphan usernet cleanup.
- Prevention: Treat VM deletion/recreation as destructive; preserve Node/runtime evidence and rerun the Docker gate after the user repairs or recreates the local container runtime.

## 2026-08-31: Migration review exposed missing adversarial and responsive coverage

- Tags: validation, authentication, routing, responsive-ui, delivery
- Symptom: Independent review found an external login callback crash, a stale movie title after navigation, duplicate dashboard active states, an unusable 390px dashboard layout, and incomplete deployment/ignore environment surfaces after the initial migration checks passed.
- Root cause: The implementation packets emphasized happy-path route parity and source-level retirement checks but did not require an adversarial callback matrix, post-navigation cleanup assertions, exact active-link semantics, narrow-viewport content measurements, or effective root build-context checks.
- Fix: Add a focused remediation wave and rerun browser acceptance for malicious/local callbacks, title restoration, exact dashboard navigation state, and mobile layout; align Kubernetes variables, root ignore files, and runtime environment declarations.
- Prevention: Reviewer packets for frontend migrations must exercise hostile redirect inputs, state cleanup after route exit, exactly-one-active navigation semantics, usable mobile content width, and root-context generated-output hygiene before approval.

## 2026-08-31: Kubernetes environment ownership omitted configuration producers

- Tags: planning, delegation, kubernetes, environment
- Symptom: The initial deployment-surface remediation task owned the consuming Deployment but not the base ConfigMap sample or production Kustomize generator that supply its keys.
- Root cause: Ownership was derived from the runtime consumer without tracing each environment value back through its configuration producers.
- Fix: Expand the same task to the base config and production overlay, then validate the rendered Kustomize output.
- Prevention: Assign Kubernetes environment-key changes across the consumer, base configuration source, and every active overlay generator as one ownership unit.

## 2026-08-31: Browser readiness host must match the Vite bind address

- Tags: validation, browser, vite, environment
- Symptom: Post-remediation E2E repeatedly failed readiness at `127.0.0.1:3000` even though Vite reported a successful `localhost:3000` start.
- Root cause: In this environment Vite's default localhost listener accepted `localhost` but not IPv4 loopback, while the E2E contract uses `127.0.0.1`.
- Fix: Bind the Vite dev server explicitly to `127.0.0.1` with strict port 3000 and rerun readiness in the same bounded process as the browser.
- Prevention: Browser specs and dev-server configuration must use the same explicit loopback host and strict port; verify both with an in-process readiness request before launching Playwright.

## 2026-08-31: Browser diagnostics must surface invalid interactive nesting

- Tags: review, accessibility, react, validation
- Symptom: The final browser run exposed `button` inside `button` in the desktop player and `a` inside `a` in row movie cards, producing React DOM/hydration console errors.
- Root cause: Component-level migration checks preserved visual behavior but did not audit the composed DOM tree across wrappers and child controls.
- Fix: Restructure clickable containers so each nested control/link has a non-interactive ancestor and repeat console-clean browser acceptance.
- Prevention: UI migration review must inspect composed interactive-element nesting and treat React `validateDOMNesting` console output as a blocking browser finding.

## 2026-08-31: Keep E2E assertions separate from verbose dev warnings

- Tags: validation, evidence, playwright, tooling
- Symptom: A completed browser run refreshed artifacts, but structured callback and layout results were displaced by high-volume development warnings.
- Root cause: Framework warnings and compact assertion evidence shared one bounded output stream without deduplication.
- Fix: Repeat targeted assertions after removing the warning sources and return compact results separately from console summaries.
- Prevention: Browser evidence runners should aggregate/deduplicate console warnings and emit assertion results in a separate compact section before verbose diagnostics.

## 2026-09-01: Sanitize redirect input at the navigation boundary

- Tags: authentication, routing, validation, security
- Symptom: Authenticated external, protocol-relative, and malformed callbacks were converted into same-origin invalid paths even though the route declared `validateSearch` sanitization.
- Root cause: The component-level search value retained raw callback input in the observed TanStack routing path, and navigation trusted the earlier validation boundary.
- Fix: Reapply `getSafeCallback` immediately before choosing the authenticated navigation target and verify the four-case browser matrix.
- Prevention: Security-sensitive redirect values must be validated at both parsing and side-effect boundaries; typed search declarations alone are not proof that raw values cannot reach navigation.

## 2026-09-01: Shared target cleanup must be ownership-aware

- Tags: state, lifecycle, player, routing
- Symptom: The persistent video node stayed connected after leaving a movie, but the PiP target remained empty and the node stayed inside the hidden fallback.
- Root cause: Multiple route lifecycles write one `DurablePlayerAtom`; an older target's cleanup unconditionally cleared a newer target during transition ordering.
- Fix: Cleanup clears the atom only when the current target identity still matches the target owned by that effect.
- Prevention: Effects sharing a mutable destination/registration slot must use compare-by-owner cleanup so stale unmounts cannot revoke a newer registration.

## 2026-09-01: Runtime public configuration must cover server-rendered output

- Tags: validation, docker, runtime-environment, ssr
- Symptom: The built container replaced Vite placeholders in client assets, but `GET /` still returned `_VITE_SITE_NAME_` from Nitro's server-rendered shell.
- Root cause: The runtime replacer scanned `.output/public` only, while the server bundle also embedded public Vite placeholders used to render HTML.
- Fix: Replace supported text artifacts in both `.output/public` and `.output/server`, including `.mjs`, before starting Nitro.
- Prevention: Container validation must assert exact runtime values and placeholder absence in both deployed assets and an actual server-rendered HTML response.
