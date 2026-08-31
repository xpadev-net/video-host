---
rule_schema_version: 2
suite_id: "rules-20260831-tanstack-start"
rule_file: "reviewer"
last_updated: "2026-08-31"
---

# Reviewer Repository Rules

## Repo-Specific Reviewer Notes

- Verify route inventory, dynamic parameter parity, auth callback handling, hydration/client-only state, and persistent-player navigation behavior.
- Verify built-artifact runtime environment injection rather than source-level placeholder presence alone.

## Review Risk Hotspots

Suggested durable review categories:
- public_api_compatibility
- public_surface_completeness
- diagnostic_fidelity
- build_config_parity
- strict_ci_hygiene
- entrypoint_intent
- admission_before_side_effect
- collection_semantics
- runtime_model_compatibility
- abstraction_value_searchability
- canonical_policy_path
- authority_vs_derived_data
- failure_mode_completeness
- semantic_consistency
- validation_boundary_correctness
- risk_based_test_coverage

## Required Reviewer-Owned Evidence

| Trigger | Evidence Required | Source |
|---|---|---|
| Routes, navigation, layout, or media UI changed | Desktop and mobile browser flow with screenshots, console errors, and failed-request notes | Task E2E spec |
| Frontend build/runtime changed | Production start and `/api/healthz` evidence plus output-entrypoint review | Docker/package scripts |

## Review Heuristics

- Confirm no stale Next imports, `.next` paths, styled-jsx transforms, or Next-only runtime assumptions remain after migration.
- Confirm image replacements preserve sizing, object-fit, lazy loading, and fallback behavior.
- Confirm CI uses a non-mutating format check and matches the supported Node runtime.

## Recurring Misses And Prevention

Durable patterns learned from prior review misses, phrased as reusable prevention rules.

- For authentication callbacks, test an external absolute URL, protocol-relative URL, malformed value, and valid local path with both authenticated and unauthenticated state.
- For redirects, verify the exact final pathname/origin; source-level sanitizer presence is insufficient evidence that the side-effect boundary receives sanitized data.
- For route-owned document state, verify the value while mounted and after navigating away.
- For navigation layouts, assert exactly one `aria-current` item and measure usable main-content width at the required mobile viewport.
- For production output changes, verify generated artifacts are ignored from the repository root and from the effective Docker build context.
- Treat invalid nested interactive elements and React `validateDOMNesting` console messages as blocking UI findings.
- For persistent portals, verify both node identity and destination ownership/visibility after route-transition cleanup; connected DOM alone is insufficient.
- Require compact assertion results to be emitted before deduplicated verbose console/network diagnostics.

## Mechanical Gate Candidates

Repo-local checks that could eventually move into:
- `worker.md` check mapping
- repository CI
- repository hooks
- repository scripts
- repository validators

If the proposed check belongs in bundled harness validators or plugin package validation, stage it as a harness migration candidate in `docs/coding-agent/skill-candidates.md` instead.
