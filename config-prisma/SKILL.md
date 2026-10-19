---
name: config-prisma
description: "Initialize and standardize the Prisma infrastructure in the Generic NestJS backend with a domain-modular schema (`apps/backend/prisma/models/*.model.prisma`), a technical seed entrypoint at `apps/backend/prisma/seed/main.ts` (no module seeds), `prisma.config.ts` configuration, a backend Docker Compose compatible with the `DATABASE_URL` from `.env` and with names derived from the project identity, and creation/adjustment of a simple `DbModule` + `PrismaService` following the project's current pattern. Use when the request involves initial Prisma setup, onboarding modules with their own Prisma file, or rebootstrapping the database infrastructure in the backend."
---

# Config Prisma

## Overview

Run a deterministic setup of the Prisma infrastructure in `apps/backend`, with a neutral seed entrypoint (no module tasks), a database module in Nest, and Postgres initialization via Docker Compose aligned with `.env`.
The generated database contract must stay compatible with the project's current version: a simple `PrismaService`, without `TransactionManager` or `runInTransaction`, and Docker infrastructure derived from the project identity to avoid collisions between repositories.

## Workflow

1. Confirm that the workspace contains `apps/backend/package.json`.
2. Run the skill script:
   - `node .agents/skills/config-prisma/scripts/init-prisma-backend.js --dry-run`
   - `node .agents/skills/config-prisma/scripts/init-prisma-backend.js --apply --install`
3. Add per-module Prisma files (repeatable):
   - `node .agents/skills/config-prisma/scripts/init-prisma-backend.js --apply --module auth --module product`
4. Start the database with the backend Docker Compose:
   - `npm --workspace apps/backend run db:start`
5. Validate Prisma:
   - `npm --workspace apps/backend run prisma:generate`

## What the script guarantees

- Prisma dependencies in `apps/backend/package.json` (`prisma`, `@prisma/client`, `@prisma/adapter-pg`, `tsx`), preserving the existing version when the backend is already configured (no forced upgrade by default).
- Database/Prisma npm scripts (`db:start`, `db:stop`, `db:logs`, `prisma:generate`, `prisma:migrate:*`, `prisma:seed`, `prisma:studio`).
- Removal of the legacy `prisma:cid` script when present.
- `apps/backend/prisma.config.ts` with `seed: 'npx tsx prisma/seed/main.ts'`.
- `apps/backend/prisma/schema.prisma` with `generator client { provider = "prisma-client-js" }` following the current pattern.
- Initial `apps/backend/prisma/seed/main.ts` (no module implementations) using `PrismaClient` from `@prisma/client` with `PrismaPg`.
- Auto-correction only for legacy seed templates (`generated/client`, `generated/prisma`, `cid`), without overwriting modern seeds already structured with module tasks.
- Does not create or modify module-specific `prisma/seed/tasks/*`.
- Temporary `apps/backend/prisma/models/bootstrap.model.prisma` only when no domain `*.model.prisma` exists yet.
- Prisma module files following the `<module-name>.model.prisma` pattern.
- `apps/backend/docker-compose.yml` aligned with the `DATABASE_URL` loaded from `apps/backend/.env` (fallback to `.env.example`) and with `name`, `container_name`, volume, and connection defaults derived from the current project.
- Creation/adjustment of `apps/backend/src/db/db.module.ts` and `apps/backend/src/db/prisma.service.ts`.
- Simple `PrismaService` following the current Nest pattern, with no dependency on `TransactionManager`.
- Inclusion of `DbModule` in `apps/backend/src/app.module.ts` when missing.

## Notes

- The script is idempotent: it can be run multiple times without duplicating structure.
- The script installs using the actual workspace name read from `apps/backend/package.json` (fallback: `apps/backend`).
- When `.env` does not yet define `DB_PORT`, `DB_USER`, and `DB_NAME`, the script derives stable defaults from the project/package name to generate a Docker instance unique to each repository.
- After creating real models, remove `prisma/models/bootstrap.model.prisma` (if it exists) and generate a new migration.
- In already-evolved backends, the script avoids regressing `seed/main.ts` to the neutral template when the file already follows the modern pattern with registered tasks.
- See `references/prisma-init-checklist.md` for the operational checklist.

## Risk Logging Guardrails

- Record execution facts in `.log/skills.log` with a marker at the start of the line.
- Minimum expected markers: `[CMD]`, `[FILE_CREATE]`, `[FILE_UPDATE]`, `[FILE_DELETE]`, `[DIR_CREATE]`, `[RISK]`, `[FAIL]`, `[AI]`.
- Always record `[RISK]` when there is an overwrite, deletion, rename/move, or forced fallback on files/folders.
- Every unexpected failure must produce a `[FAIL]` with a short factual description of the event.
- Terminal operations and file changes must use the skill's shared utilities when they exist; when the project does not have that folder, the script must work with a local fallback without blocking execution.

## Global Standards

- Prioritize compatibility with the actual structure of the current monorepo and avoid mandatory references to auxiliary files that do not exist in the project.
