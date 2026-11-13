# Acme web app

- TypeScript strict mode; no `any`.
- Run `pnpm test` before every commit.
- API handlers live in `src/api/`; keep them thin and move logic to `src/services/`.
- Use the existing `fetchWithRetry` helper for outbound HTTP.

@docs/architecture.md
