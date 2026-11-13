# Architecture

The web app is a Next.js front end over a small set of services. Requests go
through `src/api/`, which validates input with zod and calls into `src/services/`.
Background jobs run in `src/jobs/` on a queue. Shared types live in `src/types/`.
