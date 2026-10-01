---
rule_schema_version: 2
suite_id: "rules-20260831-tanstack-start"
rule_file: "orchestrator"
last_updated: "2026-08-31"
---

# Orchestrator Repository Rules

## Repo-Specific Orchestrator Policies

- Keep backend API/schema, auth storage format, public URLs, and deployment registry flow outside framework-only frontend migrations unless explicitly approved.
- Assign Reviewer-owned desktop and mobile browser evidence for route, layout, image, and persistent-player changes.
- Assign Kubernetes environment-key changes together with the consuming Deployment, base configuration source, and active overlay generators.

## Repo-Specific Integration / Git Policy

- Treat open-PR state as unknown when `gh` is unreachable and do not perform history-rewriting operations.
- Integrate generated frontend route-tree changes only after confirming they match the route inventory.
- Validate environment-key migrations against rendered Kustomize output, not source-file searches alone.

## Rule Suite Refresh Notes

- Refresh validation mappings when frontend package scripts, CI workflows, Docker runtime files, or frontend agent instructions change.
