# Prisma Init Checklist (Generic Backend)

## Goal

Standardize the Prisma bootstrap in the NestJS backend with:

- modular schema in `apps/backend/prisma/models/*.model.prisma`
- technical seed entrypoint in `apps/backend/prisma/seed/main.ts` (no module seeds)
- Nest database module in `apps/backend/src/db/*` with a simple `PrismaService` following the project's current pattern
- backend Docker Compose compatible with `DATABASE_URL` and with unique names derived from the project identity

## Prerequisites

- Workspace with `apps/backend/package.json`
- `DATABASE_URL` defined in `apps/backend/.env` (or in `.env.example`)
- Node.js/NPM installed
- Docker/Docker Compose installed

## Step by step

1. Run the simulation.
2. Apply the bootstrap.
3. Install dependencies.
4. Start Postgres with Docker Compose.
5. Generate the Prisma client.

```bash
node .agents/skills/config-prisma/scripts/init-prisma-backend.js --dry-run
node .agents/skills/config-prisma/scripts/init-prisma-backend.js --apply --install
npm --workspace apps/backend run db:start
npm --workspace apps/backend run prisma:generate
```

## Prisma module scaffolding

```bash
node .agents/skills/config-prisma/scripts/init-prisma-backend.js --apply --module auth --module stock --module billing
```

## Critical files

- `apps/backend/package.json`
- `apps/backend/.env`
- `apps/backend/.env.example`
- `apps/backend/docker-compose.yml`
- `apps/backend/prisma.config.ts`
- `apps/backend/prisma/schema.prisma`
- `apps/backend/prisma/seed/main.ts`
- `apps/backend/src/db/db.module.ts`
- `apps/backend/src/db/prisma.service.ts`
- `apps/backend/src/app.module.ts`

## Scope rule for this skill

- Do not include per-module data seeds (`prisma/seed/tasks/*`) at this stage.
- The seed bootstrap must remain neutral until the specific modules are applied.
- `prisma/models/bootstrap.model.prisma` must exist only when there are no domain `*.model.prisma` files yet.
- Do not overwrite an already modern `prisma/seed/main.ts` (with `@prisma/client`/`PrismaPg` and module tasks); only fix legacy templates.
- When `DB_PORT`, `DB_USER`, and `DB_NAME` are missing, the skill must derive stable defaults from the project name to avoid conflicts between Docker instances of different repositories.

## Flags

- `--apply`: applies changes to disk
- `--dry-run`: simulates changes
- `--install`: runs `npm install --workspace <backend-workspace>` using the name in `apps/backend/package.json` (fallback `apps/backend`)
- `--start-db`: runs `docker compose up -d postgres` in `apps/backend`
- `--module <name>`: creates a Prisma file per module
- `--prisma-version <semver>`: forces the Prisma version; without this flag, the skill preserves the Prisma version already present in the backend (fallback `7.4.2`)

## Post-bootstrap

- Add real models in `prisma/models/*.model.prisma`
- Generate migrations (`prisma migrate dev`)
- Implement per-module seeds and register them in `prisma/seed/main.ts`
- Update `*.prisma.ts` adapters to map domain/DTO
- Remove `prisma/models/bootstrap.model.prisma` after the real models are in place and generate a replacement migration
- When rebootstrapping old projects, the script automatically fixes a legacy `prisma/seed/main.ts` when it detects imports from `generated/client`, `generated/prisma`, or `cid`.
- Prioritize compatibility with the actual structure of the current monorepo and avoid depending on missing auxiliary files.
