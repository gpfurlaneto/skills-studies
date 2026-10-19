---
name: backend-prisma-sync-module
description: 'Synchronize a domain module with the backend Prisma. Use when the request involves analyzing entities in `modules/<module>/src`, creating or updating `apps/backend/prisma/models/<module>.model.prisma`, generating an incremental migration named after the module, applying the migration, and keeping the Prisma schema aligned with the entities that extend `Entity`.'
---

# Backend Sync Module Prisma

## Goal

Exclusively synchronize the Prisma persistence structure of a monorepo module based on the entities declared in `modules/<module>`.
This skill receives a module, analyzes classes that extend `Entity<TState>`, generates or updates the corresponding Prisma file at `apps/backend/prisma/models/<module>.model.prisma`, creates an incremental migration named after the module, runs the migration, and keeps the database aligned with the current state of the module.
This skill must only proceed with execution when the target module has been explicitly provided by the user or by the immediate context of the task.

Do not create DTOs, Prisma adapters, repositories, seeds, controllers, or use cases, unless the request explicitly asks for that outside of this skill.
The skill instructions must remain in English. Generated files and code must follow the language, conventions, and style already adopted in the project.

## When to use

- When the request is to synchronize a module's entities with Prisma.
- When entities are created or changed in `modules/<module>` and this needs to become schema and migration.
- When it is necessary to review whether a module's Prisma schema has become outdated relative to the domain.
- When incremental migrations focused on a single module need to be created.

## Reading scope

- Read the provided module in `modules/<module>`.
- Look for entities in `**/*.entity.ts` files.
- Prioritize `class Xxx extends Entity<...>` classes.
- Read the `State` associated with each entity to discover the fields persisted by the domain.
- Consider the fields inherited from `EntityState` in `packages/shared/src/model/entity.ts`:
  - `id?: string`
  - `createdAt?: Date`
  - `updatedAt?: Date`
  - `deletedAt?: Date | null`

## Mandatory lock

- Before any reading, schema editing, or migration execution, check whether a target module has been clearly provided.
- Valid inputs are:
  - module name, such as `auth`
  - module path inside `modules/`
  - unambiguous context pointing to a single module already mentioned in the current task
- If the module has not been clearly provided, stop execution immediately.
- In that situation, the skill must ask the user which module they want to synchronize with the backend Prisma.
- Without this information, it must not infer a module, must not edit files, and must not run Prisma commands.

## Workflow

1. Resolve the target module.
   - First check whether the module was provided explicitly or unambiguously.
   - If the module has not been provided, stop immediately and ask the user for the name of the module they want to synchronize.
   - Accept the module name, a path inside `modules/`, or equivalent context.
   - Normalize to the actual folder name and to the Prisma file name `<module>.model.prisma`.
2. Map the persistable domain.
   - Read all entities of the module.
   - List the fields declared in each entity's `State`.
   - Also include the fields inherited from `EntityState`.
   - Identify relations only when they are clear in the module's code.
3. Update the module's Prisma schema.
   - Create or edit only `apps/backend/prisma/models/<module>.model.prisma`.
   - Keep one Prisma model per persistable domain entity.
   - Preserve the modular organization of Prisma: each module lives in its own file.
   - Keep the Prisma model name consistent with the domain entity, but map the physical database table to `snake_case`, lowercase, and preferably plural.
   - Whenever necessary, use `@@map("<table_name>")` to enforce this pattern in the database. Example: entity `User` -> model `User` with `@@map("users")`.
   - Remove `apps/backend/prisma/models/bootstrap.model.prisma` when the first real domain model enters the project and it is no longer needed.
4. Generate an incremental migration.
   - If this is the module's first synchronization, use a migration named after the module in kebab-case.
   - If the module already exists in Prisma and there are differences, create a new migration with `<module>-<short-suffix>`.
   - The suffix must describe the change in a short and objective way, for example: `auth-add-user-table`, `auth-add-user-deleted-at`, `transactions-rename-status`.
5. Apply and validate.
   - Make sure the database is available before the migration.
   - Run `npm --workspace apps/backend run prisma:migrate:dev -- --name <migration-name>`.
   - Run `npm --workspace apps/backend run prisma:generate`.
   - Review the generated SQL when there is a risk of a destructive change.
6. Report the result.
   - Report the analyzed entities, the changed Prisma file, the name of the created migration, and any assumptions made.
   - If there is no difference between the module and the schema, state explicitly that the module was already synchronized.

## Mapping rules

- Assume that each persistable entity must reflect the fields of its `State`.
- Always consider the base fields inherited from `EntityState`.
- For database table names, adopt `snake_case`, lowercase, and preferably plural as the default.
- When the entity/model name is singular or in PascalCase, preserve the idiomatic Prisma model name and map the table with `@@map`. Examples:
  - `User` -> `@@map("users")`
  - `UserProfile` -> `@@map("user_profiles")`
- Map primitive types conservatively:
  - `string` -> `String`
  - `boolean` -> `Boolean`
  - `Date` -> `DateTime`
  - `number` -> choose `Int`, `BigInt`, or `Decimal` only when the context makes it clear
- In case of ambiguity about numeric type, cardinality, nullability, enum, or relation, state the doubt explicitly before consolidating a destructive schema.
- Use `@map` and `@@map` only when there is a real need for compatibility with existing naming or with an already created database.
- Avoid inferring structures that do not appear in the module. If the relation is not clear in the domain, do not invent it.

## Guardrails

- Do not proceed without an explicitly provided target module.
- Do not change other Prisma modules without a direct need from the global schema.
- Do not touch seeds or persistence adapters as part of this skill's default flow.
- Do not overwrite old migrations.
- When detecting a field rename, column removal, type change, or nullability change, treat it as a risky change and carefully review the generated SQL.
- If the module has no entity that extends `Entity`, report that there is not enough basis for automatic synchronization.

## Base commands

- Start the database, when necessary:
  - `npm --workspace apps/backend run db:start`
- Generate/apply the module migration:
  - `npm --workspace apps/backend run prisma:migrate:dev -- --name <migration-name>`
- Update the Prisma client:
  - `npm --workspace apps/backend run prisma:generate`

## References

- See `references/module-prisma-sync.md` for the operational checklist and common pitfalls.
