---
name: module-repository
description: Cria contratos de repositório padronizados para agregados dos módulos de negócio, reaproveitando interfaces compartilhadas de persistência e gerando também uma implementação em memória para apoiar testes dos casos de uso.
---

# module-repository

Creates the **repository contract of one aggregate** inside an existing business module in `modules/<module>`, plus a **simple in-memory fake** of that contract for the use case tests. The contract reuses the shared persistence interfaces of `packages/shared/src/db` instead of redeclaring them.

Scope:

- Only the domain contract (`src/<aggregate>/provider/<aggregate>.repository.ts`), its exports, the in-memory fake (`test/mock/...`), its export and its unit test.
- Never real persistence: no Prisma model or repository, no migration, no NestJS provider, controller or backend code. Those are the job of `backend-prisma-sync-module` and `backend-prisma-repository`.
- Never business rules. The contract describes what the use cases need; it does not decide them.
- Never assume a repository is CRUD. The shape comes from what the user asks for.

## Contents of this skill

Everything the skill needs is inside this folder:

```
module-repository/
├── SKILL.md
├── agents/openai.yaml
├── scripts/
│   ├── lib.mjs                    # names, module/target/entity/fake resolution, export chain
│   ├── scaffold-repository.mjs    # validates inputs, writes interface + fake + test + exports
│   └── verify-repository.mjs      # static checks, tsc, 100% fake coverage, full module suite
├── assets/templates/              # placeholders: {{pascal}} {{camel}} {{plural}} {{code}} {{fakeClass}} ...
│   ├── repository/                # <Entity>Filter, Create/Update<Entity>Data, module-aggregate placeholder
│   ├── fake/                      # class skeleton, one fragment per shared method, custom stub, findPage helpers
│   └── test/                      # spec skeleton, one case fragment per method
├── references/
│   ├── shared-contracts.md        # shared contracts, generic order, intent -> contract mapping
│   └── custom-methods.md          # signatures, ambiguity questions, fake bodies, tests
└── examples/                      # few-shots (README.md explains each one)
    ├── 01-crud-transaction/
    ├── 02-custom-budget/
    └── 03-module-mock-convention/
```

## Inputs

Required. **If the module, the aggregate or the repository type is missing or vague, stop and ask for exactly what is missing. Do not guess.**

1. **Module**: folder name in `modules/` (e.g. `reports`), or an unambiguous path inside it.
2. **Aggregate**: its name (`transaction`, `OrderItem`) **or** the explicit path of the repository file (`modules/reports/src/billing/invoice/provider/invoice.repository.ts`).
3. **Type**:
   - `crud`: the complete repository (`CrudRepository`), optionally with extra custom methods;
   - `custom`: only the operations the user lists.
4. **Entity** handled by the repository (e.g. `Transaction`). When the user does not name it and the aggregate `model/` folder declares exactly one entity class, use it and say so in the report; otherwise ask.

Required when the type is `custom`:

5. **The list of methods.** For each one, the shared operation it matches (`create`, `update`, `delete`, `findById`, `findPage`) or its signature/intent.
6. **Enough detail to avoid ambiguity** in parameters and return types. Follow `references/custom-methods.md` section 1 and ask before inventing a signature.

Optional:

7. **Input types** of `create` / `update`: the entity itself (default, the project pattern) or separate `data` types. See `references/shared-contracts.md`.

Example questions when something is missing:

> "Which module and aggregate should receive the repository (e.g. `reports` / `transaction`), and should it be `crud` (create, update, delete, findById, findPage) or `custom` (only the methods you list)?"

> "For the `custom` repository of `Budget`, which methods do you need? For each one, tell me what it receives and returns, or which of `create`, `update`, `delete`, `findById`, `findPage` it is."

## Destination (deterministic)

| | Convention mode (`--aggregate`) | Explicit mode (`--path`) |
|---|---|---|
| Interface | `modules/<module>/src/<aggregate>/provider/<aggregate>.repository.ts` | the given file; must be `modules/<module>/src/**/provider/<kebab>.repository.ts` |
| Provider index | `provider/index.ts` + `export * from "./<aggregate>.repository";` | same, next to the file |
| Export chain | `<aggregate>/index.ts` → … → `src/index.ts` get `export * from "./<child>";` when missing | same |
| Fake | `modules/<module>/test/mock/fake-<aggregate>.repository.ts`, class `Fake<Entity>Repository` | same |
| Fake test | `…/fake-<aggregate>.repository.test.ts` | same |
| Fake export | `test/mock/index.ts` + `export * from "./fake-<aggregate>.repository";` | same |

`<aggregate>` is always kebab-case. The interface is always `export interface <Entity>Repository`.

**Module convention wins.** When `test/mock/` already holds `*.repository.mock.ts` files and no `fake-*.repository.ts` (e.g. `modules/auth`), the fake is `test/mock/<aggregate>.repository.mock.ts` with class `<Entity>RepositoryMock`. Any other convention can be followed with `--fake-path <file>`.

## Workflow

Run every command from the monorepo root.

### 1. Read the references (mandatory)

Live project files, the source of truth:

- `packages/shared/src/db/create.repository.ts`, `update.repository.ts`, `delete.repository.ts`, `find-by-id.repository.ts`, `find-page.repository.ts`, `crud.repository.ts`, `page-data.ts`, `index.ts`
- `modules/auth/src/user/provider/user.repository.ts` and `modules/auth/src/user/model/user.entity.ts`
- The in-memory fake already used in tests: `modules/auth/test/mock/user.repository.mock.ts` (and its test). If the project later adds `modules/auth/test/mock/fake-user.repository.ts`, read that one too.
- The target module: `src/index.ts`, the aggregate folder, the entity file and `test/mock/` if present.

Then read `references/shared-contracts.md`, `references/custom-methods.md` and `examples/README.md`. If a live file differs from a snapshot in this skill, **follow the live file**; if a shared generic changed in a way that breaks a template, stop and tell the user which template must change.

### 2. Decide the shape before writing

- `crud` → `CrudRepository<Entity, CreateInput, UpdateInput, <Entity>Filter>`; extra methods only if the user asked for them.
- `custom` → map every requested method to a shared operation when it matches (`references/shared-contracts.md`, mapping table) and pass those with `--compose`; every other method becomes a `--method` signature. If all five shared operations are requested, the script uses `CrudRepository`.
- Suggest a shared contract when the user's description is equivalent to one, but ask if the semantics differ.
- Ask about any ambiguity listed in `references/custom-methods.md` before scaffolding.

### 3. Scaffold

```bash
node .claude/skills/module-repository/scripts/scaffold-repository.mjs \
  --module <module> (--aggregate <name> | --path <file>) \
  --type <crud|custom> [--entity <Name>] \
  [--compose create,update,delete,findById,findPage] \
  [--method "<name>(<params>): Promise<T>"]... \
  [--create-input entity|data] [--update-input entity|data] \
  [--fake-path <file>] [--no-test] [--dry-run]
```

Run it with `--dry-run` first and check the summary and the planned files.

The script refuses to continue, and writes nothing, when: the module does not exist (it lists the available ones); the aggregate folder does not exist (it suggests `module-aggregate` or `--path`); the explicit path is outside `src/`, not in a `provider` folder or not `<kebab>.repository.ts`; the entity class or `<Entity>State` is not found, or cannot be inferred; the module has no single `<scope>/shared` dependency; a `custom` repository has no method; a `--method` redeclares a shared operation, repeats a name or does not return a `Promise`; `<Entity>Repository` (or a generated auxiliary type) is already declared elsewhere in the module; the repository or the fake already exists with different, hand-written content. Relay these errors to the user instead of working around them.

What it writes:

| Situation | Interface | Fake / test |
|---|---|---|
| file missing | created | created |
| interface is the untouched `module-aggregate` placeholder | replaced | created if missing |
| file identical to what would be generated | left as is | left as is (existing test is never touched) |
| hand-written file already exists (**update mode**) | refused; edit by hand | refused; edit by hand |

It appends missing exports only, never reorders or removes existing lines. Types used by `--method` signatures that the entity file exports are imported automatically.

### 4. Resolve the markers

The generated files contain `TODO(module-repository)` markers only where the script cannot decide safely:

- each custom method body in the fake, and a test for it (`references/custom-methods.md`, sections 2 and 3);
- a sample value in `make<Entity>State` for state fields whose type cannot be sampled (aliases, objects);
- auxiliary types referenced by custom signatures and not exported by the entity file: declare them in the repository file above the interface.

The plain `TODO:` comments inside `<Entity>Filter`, `Create<Entity>Data` and `Update<Entity>Data` are intentional placeholders. Leave them unless the user gave the fields.

**Update mode** (the repository is already hand-written): edit it by hand with the same pattern. Compose the shared contracts for new shared operations, add custom signatures, never remove or rename existing methods unless asked, then add the matching code to the existing fake and its test.

### 5. Verify

```bash
node .claude/skills/module-repository/scripts/verify-repository.mjs \
  --module <module> (--aggregate <name> | --path <file>) [--entity <Name>] [--fake-path <file>]
```

It checks: no `TODO(module-repository)` left; `export interface <Entity>Repository` without shared methods redeclared by hand; the fake `implements <Entity>Repository` and uses no mock framework; the export chain up to `src/index.ts` and `test/mock/index.ts`; `tsc --noEmit` on the module; **100% coverage** of the fake by its test; the full module suite. Fix the cause of any failure and run it again until it passes. Do not lower the threshold or delete tests.

### 6. Report

Tell the user:

- module, aggregate, entity, type, composed shared contracts and custom methods;
- created and updated files (interface, indexes, fake, test, mock index);
- decisions you made (inferred entity, mock naming convention, auxiliary types, how each custom method behaves in the fake);
- the placeholders left for them (`<Entity>Filter` fields, `Create/Update<Entity>Data` fields);
- that the fake is ready to be used by use case tests (`new Fake<Entity>Repository([...])` and its `items` getter), and that the real implementation is out of scope (`backend-prisma-repository`).

## Rules

- Reuse the shared contracts (`CrudRepository`, `CreateRepository`, `UpdateRepository`, `DeleteRepository`, `FindByIdRepository`, `FindPageRepository`, `PageRequest`, `PageResult`). Never redeclare their methods or types.
- The interface holds signatures only. No classes, no default implementations, no decorators in `src/`.
- The fake is a plain concrete class over a `Map`, deterministic and dependency-free (only the shared package and the module `src/index`). Never `jest.fn`, `jest.mock`, `jest.spyOn` or a mock library.
- Never create files outside the destinations listed above. Never touch `apps/`, Prisma or migrations.
- Never overwrite a hand-written repository or fake; never remove or reorder existing exports.
- Never invent business rules, fields or filters the user did not describe.
- Formatting follows the project: double quotes, semicolons, 2-space indent, trailing commas in multi-line lists, named imports in alphabetical order.
- Every generated file, comment and identifier is in English.
