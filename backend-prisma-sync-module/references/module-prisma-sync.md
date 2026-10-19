# Prisma Sync per Module

## Goal

Synchronize a single domain module with the backend Prisma layer, keeping the schema modular and the incremental migrations aligned with the module's entities.

## Main paths

- Domain modules:
  - `modules/<module>/src/**/*.entity.ts`
- Entity base:
  - `packages/shared/src/model/entity.ts`
- Root Prisma schema:
  - `apps/backend/prisma/schema.prisma`
- Prisma models per module:
  - `apps/backend/prisma/models/<module>.model.prisma`
- Migration SQL:
  - `apps/backend/prisma/migrations/*/migration.sql`
- Prisma commands:
  - `apps/backend/package.json`

## Operational checklist

### 1. Read the module

- [ ] Confirm that the module was explicitly provided by the user or by unambiguous context.
- [ ] If the module is not clear, stop execution and ask the user for the target module before continuing.
- [ ] Confirm the module name and path in `modules/<module>`.
- [ ] List the `*.entity.ts` entities.
- [ ] Identify the classes that extend `Entity<TState>`.
- [ ] Extract the fields from the `State` and those inherited from `EntityState`.

### 2. Update the Prisma schema

- [ ] Create or edit only `apps/backend/prisma/models/<module>.model.prisma`.
- [ ] Ensure one Prisma model per persistable entity.
- [ ] Include `id`, `createdAt`, `updatedAt`, and `deletedAt` when they are part of the shared base.
- [ ] Keep names and types consistent with the domain.
- [ ] Review relations, nullability, and indexes only when this is clear in the code.

### 3. Generate the migration

- [ ] If this is the module's first migration, use `<module>`.
- [ ] If this is an incremental adjustment, use `<module>-<short-suffix>`.
- [ ] Start the database if it is not available:
  - `npm --workspace apps/backend run db:start`
- [ ] Run the migration:
  - `npm --workspace apps/backend run prisma:migrate:dev -- --name <migration-name>`
- [ ] Run the client generation:
  - `npm --workspace apps/backend run prisma:generate`

### 4. Validate the result

- [ ] Review the generated SQL when there is a rename, drop, type change, or nullability change.
- [ ] Confirm that the module's Prisma file is consistent with the entities read.
- [ ] If the schema was already synchronized, record this explicitly instead of forcing changes.

## Recommended conventions

- Keep one Prisma file per module.
- Name migrations in kebab-case.
- Use short and descriptive suffixes for incremental migrations.
- Preserve the language and code style already adopted by the project.
- Avoid unnecessary `@map`/`@@map`.

## Common pitfalls

- Proceeding by inferring a module when the user has not yet said which module they want to synchronize.
- Ignoring fields inherited from `EntityState`.
- Creating a Prisma schema for classes that are not persistable entities.
- Inferring relations that do not clearly appear in the domain.
- Generating a migration with an overly generic name, such as `update` or `fix`.
- Changing files of other modules without need.
- Keeping `bootstrap.model.prisma` when the project already has enough real models to replace it.
