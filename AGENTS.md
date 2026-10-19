# Repository guidance

Start with the root [README](README.md) for architecture, local setup, and deployment assumptions. Read the service README for work in `app/backend`, `app/frontend`, or `app/ffmpeg-worker`; the frontend also has `app/frontend/CLAUDE.md` with framework-specific guidance.

For coding-agent work, use `docs/coding-agent/rules/index.md` as the entry point to the common, worker, orchestrator, and reviewer rules, and consult `docs/coding-agent/lessons.md` for recorded project lessons. Follow `.agent/PLANS.md` when creating or maintaining an ExecPlan. The canonical skill files live under `.agent/skills`; `.claude/skills`, `.codex/skills`, and `.cursor/skills` point to that same directory.

Keep secrets out of source control. Use the checked-in `.env.example` files only as local-development templates; replace their sample values and follow the deployment guide before configuring production.
