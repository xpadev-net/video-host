---
rule_schema_version: 2
suite_id: "rules-20260831-tanstack-start"
rule_file: "worker"
last_updated: "2026-09-01"
---

# Worker Repository Rules

## Repo-Specific Worker Notes

- Build `@video-host/backend` before validating frontend types or builds.
- Do not overwrite concurrent changes under `docs/coding-agent/**`; those files are Orchestrator-owned.
- Framework-migration absence checks must cover runtime imports, framework-specific public environment prefixes, and global environment access patterns across the owned surface.
- Prefer function declarations for TanStack file-route components so route definitions remain lint-clean when declared first.
- If RTK-filtered pnpm output and exit status disagree, rerun the package script from the package working directory before classifying the validation result.
- Resolve scoped validation file arguments relative to the command working directory and confirm the tool reports a nonzero file count.

## Repo CI / Checks Mapping

| Change Type | Required Checks | Notes |
|---|---|---|
| Frontend TS/TSX/CSS | frontend lint, typecheck, build | Build backend declarations first. |
| Frontend dependencies/config | frozen install, backend build, frontend typecheck and build | Confirm generated route-tree handling. |
| Routes/navigation/player | frontend checks plus browser probe | Verify dynamic params, auth callback, and player continuity. |
| Docker/env/start | image build, container start, runtime env replacement, health request | Confirm port 3000 and `/api/healthz`. |
| CI/release | workflow review plus representative local commands | CI format checks must not mutate files. |

## Mechanical Gate Candidates

- Add a browser regression covering authenticated login callbacks for external, protocol-relative, malformed, and valid local values.
- Add a root-context check that generated `.output` content is ignored by both Git and Docker inputs.
- Keep the browser base URL and Vite `server.host`/`strictPort` aligned; readiness must target that exact origin.
- For Nitro container env changes, check runtime values and placeholder absence in `.output/public`, `.output/server`, and the served root HTML.
