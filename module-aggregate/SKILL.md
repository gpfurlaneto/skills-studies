---
name: module-aggregate
description: Cria a estrutura padronizada de um agregado dentro de um módulo de negócio, organizando pastas, arquivos-base e nomenclaturas de model, provider e usecase para acelerar a evolução consistente do projeto.
---

# module-aggregate

Creates the **base structure of one aggregate** inside an existing business module in `modules/<module>`. The output is folders, files, names and exports with minimal placeholders, so a developer can continue the implementation by hand.

Scope:

- This skill is about **structure**, not about the domain. It never invents attributes, validations, business rules or use case flows.
- It is not opinionated about DDD. It only reproduces the folder layout already used in the project (`modules/auth/src/user`).
- It never creates controllers, backend adapters, Prisma implementations, migrations, tests or any other infrastructure.

## Contents of this skill

Everything the skill needs is inside this folder. It does not depend on any template or script outside it.

```
module-aggregate/
├── SKILL.md
├── agents/openai.yaml
├── scripts/
│   └── scaffold-aggregate.mjs        # validation, name normalization, rendering, src/index.ts update
└── assets/templates/                 # placeholders: {{kebab}} {{pascal}} {{camel}} {{code}} {{sharedPackage}}
    ├── index.ts.tpl                  # -> <aggregate>/index.ts
    ├── model/
    │   ├── index.ts.tpl              # -> model/index.ts
    │   └── entity.ts.tpl             # -> model/<aggregate>.entity.ts
    ├── provider/
    │   ├── index.ts.tpl              # -> provider/index.ts
    │   └── repository.ts.tpl         # -> provider/<aggregate>.repository.ts
    └── usecase/
        ├── crud/                     # index + create/update/delete/find-by-id/find-page
        └── example/                  # index + a single example use case
```

## Inputs

Required. **If any of these is missing, ask the user for it and stop. Do not guess.**

1. **Module**: folder name of an existing module in `modules/`, e.g. `auth`.
2. **Aggregate name**, in any casing: `order-item`, `OrderItem`, `order_item`, `order item`.

Optional, but recommended:

3. **Use case scenario**:
   - `crud`: standard CRUD use case skeletons.
   - `example`: a single example use case that only shows the structure.

   If the request does not say which one, ask one objective question before going on, for example:
   > "Which initial use case structure do you want for `<aggregate>`: `crud` (create, update, delete, find by id, find page) or `example` (a single example use case)?"

## Generated structure

With `<aggregate>` normalized to kebab-case (`OrderItem` -> `order-item`, class `OrderItem`):

```
modules/<module>/src/
├── index.ts                                   # + export * from "./<aggregate>";  (existing exports kept)
└── <aggregate>/
    ├── index.ts                               # re-exports model, provider, usecase
    ├── model/
    │   ├── index.ts
    │   └── <aggregate>.entity.ts              # <Aggregate>State extends EntityState + <Aggregate> extends Entity
    ├── provider/
    │   ├── index.ts
    │   └── <aggregate>.repository.ts          # <Aggregate>Filter + <Aggregate>Repository extends CrudRepository
    └── usecase/
        ├── index.ts
        └── ...                                # depends on the scenario
```

Use cases for `crud` (class names follow the project style: action + aggregate, no `UseCase` suffix):

| File | Class | Input | Output |
|---|---|---|---|
| `create-<aggregate>.usecase.ts` | `Create<Aggregate>` | `Create<Aggregate>Input` (empty, TODO) | `void` |
| `update-<aggregate>.usecase.ts` | `Update<Aggregate>` | `Update<Aggregate>Input` (`id` + TODO) | `void` |
| `delete-<aggregate>.usecase.ts` | `Delete<Aggregate>` | `Delete<Aggregate>Input` (`id`) | `void` |
| `find-<aggregate>-by-id.usecase.ts` | `Find<Aggregate>ById` | `Find<Aggregate>ByIdInput` (`id`) | `<Aggregate>` |
| `find-<aggregate>-page.usecase.ts` | `Find<Aggregate>Page` | `PageRequest<<Aggregate>Filter>` | `PageResult<<Aggregate>>` |

Use case for `example`: `example-<aggregate>.usecase.ts` with class `Example<Aggregate>`, meant to be renamed to the real action or deleted.

Every use case implements `UseCase<IN, OUT>` from the shared package, receives `<Aggregate>Repository` in the constructor and its `execute()` only throws `"<Class> is not implemented yet."`, so an unfinished use case fails loudly instead of silently doing nothing.

## Workflow

Run every command from the monorepo root.

### 1. Check the live project

Read these files, which are the source of truth for the pattern:

- `modules/<module>/src/index.ts` and `modules/<module>/package.json`
- An existing aggregate, if any (e.g. `modules/auth/src/user/**`)
- `packages/shared/src/model/entity.ts`, `packages/shared/src/db/crud.repository.ts`, `packages/shared/src/db/page-data.ts`, `packages/shared/src/usecase/use-case.ts`

If a shared contract changed in a way that makes a template no longer compile (renamed class, new required generic, different export), stop and tell the user which template in `assets/templates/` must be updated. Do not hand-write a different structure.

### 2. Preview

```bash
node .agents/skills/module-aggregate/scripts/scaffold-aggregate.mjs \
  --module <module> --aggregate <name> --usecases <crud|example> --dry-run
```

The script refuses to continue and changes nothing when:

- `modules/<module>` does not exist (it lists the available modules), or has no `package.json` / `src/index.ts`;
- the aggregate name cannot be normalized to kebab-case, or is a reserved name (`index`, `model`, `provider`, `usecase`, ...);
- `modules/<module>/src/<aggregate>` already exists (it never overwrites);
- the module `package.json` does not have exactly one `<scope>/shared` dependency (used for the imports, e.g. `@poupig/shared`).

Relay any of these errors to the user instead of working around them.

### 3. Generate

Run the same command without `--dry-run`. The script:

1. renders every template from `assets/templates/` into `modules/<module>/src/<aggregate>/`;
2. inserts `export * from "./<aggregate>";` into `modules/<module>/src/index.ts` right after the last existing `export ... from` line (or at the top if there is none), keeping every other line untouched. If the export already exists, the file is left as is.

Same inputs always produce the same files.

### 4. Verify

```bash
npx tsc --noEmit -p modules/<module>/tsconfig.json
```

It must pass. If it fails because of the generated files, fix the **template** cause and tell the user; do not add domain content to make it compile.

### 5. Report

Tell the user:

- the module, normalized aggregate name and scenario;
- the list of created files and the `src/index.ts` change;
- the `TODO` points left for them: attributes in `<Aggregate>State`, getters and `validate()` in the entity, fields in `<Aggregate>Filter`, inputs and `execute()` of each use case;
- that infrastructure (Prisma model/repository, controller, tests) is out of scope and can be done next with the matching skills (e.g. `backend-prisma-sync-module`, `backend-prisma-repository`).

## Rules

- Never edit generated files to add attributes, validations or flows that the user did not ask for. The placeholders are intentional.
- Never create files outside `modules/<module>/src/<aggregate>/`, except the single export line in `modules/<module>/src/index.ts`.
- Never remove or reorder existing exports in `modules/<module>/src/index.ts`.
- Never overwrite an existing aggregate folder.
- Keep every generated file, comment and identifier in English.
