# Contributing

## Development setup

Read the root [README](README.md), then the relevant service README. Use the Node.js and pnpm versions documented there. Keep pull requests focused, describe user-visible and operational impact, and include the checks run and any checks that require external services.

## Code changes

- Follow existing TypeScript, Biome, and Prisma conventions.
- Add or update tests for behavior changes and run the relevant service checks.
- Do not commit credentials, local `.env` files, database dumps, or production data.
- Update configuration examples and operator documentation when changing environment variables, deployment behavior, or migrations.
- Treat authentication, media visibility, upload ownership, and callback/VOD secrets as security boundaries.

## Pull requests

Use the pull request template. Explain the problem, summarize the implementation, list validation evidence, and call out migration or deployment steps. CI runs backend, frontend, and worker checks. Production database, identity provider, and ingress checks must be reported separately when they are relevant; mocked tests do not establish those integrations.

## Releases

Releases are managed through the repository's GitHub Actions release workflow. Follow its version selection and review the produced artifacts before deployment. Do not manually change package versions or publish tags outside the workflow.
