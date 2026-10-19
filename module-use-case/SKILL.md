---
name: module-use-case
description: Cria casos de uso padronizados para agregados dos módulos de negócio, com contratos de entrada e saída consistentes, implementação inicial simples, testes unitários completos e estrutura pronta para evolução pelo time.
---

# module-use-case

Creates (or updates) **one use case of an aggregate** inside an existing business module in `modules/<module>`, together with its **unit test at 100% coverage**, written over the module's in-memory fakes.

Scope:

- Only the use case file (`src/<aggregate>/usecase/<name>.usecase.ts`), its exports, its test (`test/<aggregate>/usecase/<name>.usecase.test.ts`) and, only when a dependency has no fake yet, a simple fake in `test/mock/`.
- Domain contract and basic orchestration only. Never a controller, Prisma model or repository, NestJS provider, HTTP adapter or anything in `apps/`.
- Never business rules the user did not ask for. Keep the first version small; the team refines it later.

## Contents of this skill

Everything the skill needs is inside this folder:

```
module-use-case/
├── SKILL.md
├── agents/openai.yaml
├── scripts/
│   ├── lib.mjs                  # names, module/target/entity/dependency/fake resolution, exports
│   ├── scaffold-usecase.mjs     # validates inputs, writes use case + test + exports (+ missing fake skeletons)
│   └── verify-usecase.mjs       # static checks, tsc, 100% coverage of the use case, full module suite
├── assets/templates/
│   ├── usecase/                 # contracts + one body per crud operation + custom
│   ├── test/                    # shared helpers + one spec per crud operation + custom
│   └── fake/                    # skeleton of a new fake
├── references/
│   ├── conventions.md           # names, contracts, crud flows, custom flows, update mode
│   └── testing-guide.md         # what to test, fakes reuse/creation, coverage
└── examples/                    # few-shots (README.md explains each one)
    ├── 01-crud-transaction/
    └── 02-custom-pay-transaction/
```

## Inputs

Required. **If any of items 1 to 5 is missing or vague, stop and ask for exactly what is missing. Do not guess.**

1. **Module**: folder name in `modules/` (e.g. `auth`), or an unambiguous path inside it.
2. **Aggregate**: its name (`user`, `transaction`) **or** the explicit path of the use case file (`modules/auth/src/user/usecase/change-password.usecase.ts`).
3. **Use case name**: e.g. `register-user`, `RegisterUser`, `find transaction page`. A trailing `UseCase` is removed (`RegisterUserUseCase` → `RegisterUser`).
4. **Scenario**:
   - `crud`: create, update, delete, find by id or find page of the aggregate entity;
   - `custom`: any other use case.
5. **Output**: whether the use case returns data (`yes`, with a `<Name>Out` contract) or not (`no`, `void`). `find-by-id` and `find-page` always return data.

Optional:

6. **Dependencies**: repositories, providers or other contracts (interface names, e.g. `UserRepository`, `CryptoProvider`). `crud` always uses `<Entity>Repository`.
7. **Input fields** (`name: type`).
8. **Output fields** (`name: type`), when there is an output.
9. **Explicit behaviour rules** for the first implementation (e.g. "a paid transaction cannot be paid again").
10. **Entity**, when the aggregate `model/` folder does not declare exactly one entity.

For `custom`, the user must also say **what the use case does** in at least one sentence. Without it there is nothing to orchestrate: ask.

Example questions when something is missing:

> "In which module and aggregate should the use case go (e.g. `auth` / `user`), what is its name, is it `crud` (create, update, delete, find by id, find page) or `custom`, and does it return data?"

> "For the `custom` use case `ChangePassword`, what should it do, which dependencies does it use (e.g. `UserRepository`, `CryptoProvider`) and which fields does it receive?"

## Destination (deterministic)

| | Convention mode (`--aggregate` + `--name`) | Explicit mode (`--path`) |
|---|---|---|
| Use case | `modules/<module>/src/<aggregate>/usecase/<name>.usecase.ts` | the given file; must be `modules/<module>/src/**/usecase/<kebab>.usecase.ts` |
| Use case index | `usecase/index.ts` + `export * from "./<name>.usecase";` | same, next to the file |
| Export chain | `<aggregate>/index.ts` → … → `src/index.ts` get `export * from "./<child>";` when missing | same |
| Test | `modules/<module>/test/<aggregate>/usecase/<name>.usecase.test.ts` | same folders as the file, mirrored under `test/` |
| New fake (only if missing) | `test/mock/fake-<base>.<kind>.ts` / `Fake<Interface>`, or `test/mock/<base>.<kind>.mock.ts` / `<Interface>Mock` when the module already uses `*.mock.ts` (e.g. `auth`) | same |

Names: file in kebab-case with the `.usecase.ts` suffix; class in PascalCase **without** a `UseCase` suffix (`register-user.usecase.ts` → `RegisterUser`); input `<Name>In`; output `<Name>Out` (only when there is an output); the class `implements UseCase<<Name>In, <Name>Out | void>` from the shared package.

## Workflow

Run every command from the monorepo root.

### 1. Read the references (mandatory)

Live project files, the source of truth:

1. `modules/auth/src/user/usecase/register-user.usecase.ts`
2. `modules/auth/src/user/usecase/index.ts`
3. `modules/auth/test/user/usecase/register-user.usecase.test.ts`
4. `modules/auth/test/mock/fake-user.repository.ts`: today the module names it `user.repository.mock.ts` (`UserRepositoryMock`). Read whichever exists.
5. `modules/auth/test/mock/fake-crypto.provider.ts`: today `crypto.provider.mock.ts` (`CryptoProviderMock`). Read whichever exists.
6. `modules/auth/test/mock/index.ts`
7. `packages/shared/src/usecase/use-case.ts`
8. `packages/shared/src/usecase/index.ts`

Then the target module: `src/index.ts`, the aggregate folder (`model/`, `provider/`, `usecase/`), the entity file, the dependency interfaces and `test/mock/`. Then `references/conventions.md`, `references/testing-guide.md` and `examples/README.md`.

`register-user.usecase.ts` predates the naming rule and still uses `RegisterUserInput`. Copy its **shape** (constructor injection, validation, entity, repository), but new contracts always use `In` / `Out`. Do not rename existing contracts unless the user asks. If a live file differs from an example in this skill, **follow the live file**.

### 2. Decide the shape before writing

- `crud`: pick the operation (`create`, `update`, `delete`, `find-by-id`, `find-page`). It is inferred from conventional names (`create-<entity>`, `update-<entity>`, `delete-<entity>`, `find-<entity>-by-id`, `find-<entity>-page`); for any other name pass `--operation`. The flows are fixed (`references/conventions.md`, section 2).
- `custom`: list the dependencies, input and output fields and the steps the user described. Map every step to a dependency call or an entity method. If a step needs a dependency that does not exist yet (no interface in `src/`), stop and ask; suggest creating it first (e.g. with `module-repository` for a repository).
- Check `references/conventions.md`, section 3, for what is allowed in a custom flow and for the placeholders to use where the description has gaps.

### 3. Scaffold

```bash
node .claude/skills/module-use-case/scripts/scaffold-usecase.mjs \
  --module <module> (--aggregate <name> --name <use case> | --path <file>) \
  --type <crud|custom> --output <yes|no> \
  [--operation <create|update|delete|find-by-id|find-page>] [--entity <Name>] \
  [--dep <Interface>]... [--in-field "name: type"]... [--out-field "name: type"]... \
  [--dry-run]
```

Run it with `--dry-run` first and check the summary: contracts, dependencies, which fakes are **reused** and which would be **created**.

Defaults: `crud` input fields come from `<Entity>State` (`create`; `update` adds `id`), `delete` / `find-by-id` receive `{ id }`, `find-page` receives `PageRequest<Filter>` with the filter type read from the repository. `crud` output is `{ id }` for create/update/delete and the entity data (id, state fields, `createdAt`, `updatedAt`) for find-by-id/find-page. `--in-field` / `--out-field` replace these defaults. Types used in fields that the entity or dependency files export are imported automatically.

The script refuses to continue, and writes nothing, when: the module, the aggregate folder, the entity, or a dependency interface does not exist; the explicit path is outside `src/`, not in a `usecase` folder or not `<kebab>.usecase.ts`; the `crud` operation cannot be inferred; `find-by-id` / `find-page` are asked with `--output no`; `--out-field` is used with `--output no`. Relay these errors to the user instead of working around them.

What it writes:

| Situation | Use case | Test |
|---|---|---|
| file missing | created | created |
| file is the untouched `module-aggregate` placeholder (`... is not implemented yet.`) | replaced | created if missing |
| hand-written file exists (**update mode**) | not touched; edit by hand | created from the template if missing, never overwritten |

It only appends missing exports, never reorders or removes lines, reuses every fake it finds (`export class X implements <Interface>` anywhere in `test/`, preferring `test/mock/`), creates a fake skeleton only for a dependency without one, and formats new files with the monorepo Prettier.

### 4. Resolve the markers

The generated files contain `TODO(module-use-case)` markers only where the script cannot decide safely:

- **use case** (`custom` only): the body of `execute()`, and the input/output fields when none were given. Implement exactly the flow the user described (`references/conventions.md`, section 3). Where the description has gaps, keep the contract minimal and use a plain `// TODO:` comment as a placeholder instead of inventing behaviour;
- **test**: valid sample values (`validState`, `validInput`) that pass the entity `validate()`, the invalid override and its **exact** error codes, and, for `custom`, every test case (`references/testing-guide.md`);
- **new fake**: its method bodies (`references/testing-guide.md`, section 3).

**Update mode** (the use case is hand-written): edit it by hand with the same pattern. Keep existing names and behaviour unless the user asked to change them, apply only the requested change, and extend the existing test so the changed code is covered again.

### 5. Verify

```bash
node .claude/skills/module-use-case/scripts/verify-usecase.mjs \
  --module <module> (--aggregate <name> --name <use case> | --path <file>)
```

It checks: no `TODO(module-use-case)` left (use case, test, `test/mock`); `export class <Name>` without a `UseCase` suffix; `export interface <Name>In`; `implements UseCase<<Name>In, <Name>Out | void>` with `<Name>Out` declared when used; no backend/HTTP/Prisma imports; the export chain up to `src/index.ts`; no mock framework in the test or the fakes; `tsc --noEmit` on the module; **100% coverage (statements, branches, functions, lines) of the use case file by its own test**; the full module suite. If coverage is below 100%, read the uncovered lines in the report and add the missing tests; then run it again until it passes. Never lower the threshold, delete tests or add `istanbul ignore`.

### 6. Report

Tell the user:

- module, aggregate, entity, scenario (and crud operation), contracts (`<Name>In`, `<Name>Out` or `void`) and dependencies;
- created and updated files (use case, indexes, test, fakes, `test/mock/index.ts`);
- which fakes were reused and which were created;
- decisions you made (inferred operation or entity, default fields, how gaps were handled) and the placeholders left for the team;
- the verification result (coverage line of the use case and the module suite).

## Rules

- File `<kebab>.usecase.ts` in a `usecase/` folder; class `<PascalName>`, never ending with `UseCase`; `<Name>In` always; `<Name>Out` only when there is an output, `void` otherwise.
- Implement the shared `UseCase<In, Out>` contract with a single `async execute(input)`. Dependencies are interfaces injected through the constructor as `private readonly <camelInterface>`.
- Simple and readable: validate input that is not covered by the entity (shared `Validator` and rules), build or load the entity, call `validate()`, call the dependencies, map the output. No base classes, decorators, events, transactions, caching, logging or generic helpers.
- Domain errors come from the shared package (`NotFoundError` for a missing entity, `ValidationException` from `Validator`/`validate()`, `ValidationError` / `DomainError` for an explicit rule). Codes follow the entity pattern: `<entityCamel>.<reason>`, e.g. `transaction.not.found`.
- Never import from `apps/`, NestJS, Prisma, HTTP libraries, controllers or modules.
- Never invent business rules, fields or dependencies the user did not describe.
- Tests are mandatory: real in-memory fakes, no `jest.fn` / `jest.mock` / `jest.spyOn` / mock libraries, 100% coverage of the use case.
- Reuse existing fakes; create one only when a dependency has none, and export it from `test/mock/index.ts`.
- Formatting follows the project: double quotes, semicolons, 2-space indent, trailing commas, named imports in alphabetical order.
- Every generated file, comment and identifier is in English.
