---
rule_schema_version: 2
suite_id: "rules-20260831-tanstack-start"
rule_file: "common"
last_updated: "2026-09-01"
---

# Common Repository Rules

## Repository Reference Documents

- `app/frontend/CLAUDE.md` documents the current frontend commands, structure, runtime output, and public environment contract.

## Repository-Specific Validation Commands

- Build backend declarations before frontend typecheck or build: `pnpm -F @video-host/backend build`.
- For frontend TypeScript or CSS changes, run `pnpm -F @video-host/frontend lint`, `pnpm -F @video-host/frontend typecheck`, and `pnpm -F @video-host/frontend build`.
- For workspace integration, run `pnpm lint`, `pnpm typecheck`, and `pnpm build`.
- For frontend container changes, build and start the image, then verify `GET /api/healthz` on port 3000.

## Repo Safety / Boundaries

- Do not rewrite history or force-push when the current branch has an open pull request.
- Use `gh` for GitHub resources and prefix shell commands with `rtk`.
- Preserve the typed Hono frontend/backend contract and do not change backend runtime behavior solely to simplify frontend work.
- Treat auth token storage, runtime public-environment replacement, and persistent-player continuity as compatibility-sensitive behavior.

## Repo Naming / Structure

- The frontend is `app/frontend`; it consumes generated backend declarations from `app/backend` through the workspace dependency.
- Public frontend runtime values are represented by placeholder-backed environment variables and substituted in the built container artifact.
- A TanStack Start SPA configuration must include a route matching its shell mask path so prerender validation can complete.
- Configure generated-file exclusions in `biome.json` when using Biome 2; do not rely on legacy `.biomeignore` behavior.
- TanStack Start Node containers must use the configured production adapter's executable entrypoint; verify the process remains alive rather than inferring from bundle creation.
- Runtime public-environment replacement must target only deployed text assets and must preserve shell/sed-significant characters in values.
- Nitro runtime substitution must cover both public assets and server-rendered bundles; verify a served HTML response contains runtime values and no public placeholders.
