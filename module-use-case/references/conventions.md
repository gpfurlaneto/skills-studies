# Use case conventions

## 1. Names and contracts

| Item | Rule | Example |
|---|---|---|
| File | kebab-case + `.usecase.ts`, inside `usecase/` | `register-user.usecase.ts` |
| Class | PascalCase of the name, never ending with `UseCase` | `RegisterUser` |
| Input | `export interface <Name>In` (always, even if it only has `id`) | `RegisterUserIn` |
| Output | `export interface <Name>Out` when data is returned; otherwise `void` and no `Out` | `FindUserByIdOut` |
| Contract | `implements UseCase<<Name>In, <Name>Out \| void>` from `<scope>/shared` | `UseCase<RegisterUserIn, void>` |
| Dependencies | interfaces injected as `private readonly <camelInterface>` | `private readonly userRepository: UserRepository` |
| Error codes | `<entityCamel>.<reason>` | `transaction.not.found` |
| Export | `export * from "./<name>.usecase";` in `usecase/index.ts`, plus the chain to `src/index.ts` | |

Contracts are plain data: primitives, `Date`, arrays, literal unions exported by the entity file. Never return the entity instance from `Out`; map the fields. Never put classes, functions or the HTTP shape (status codes, headers) in a contract.

The shared contract (`packages/shared/src/usecase/use-case.ts`):

```ts
export interface UseCase<IN, OUT> {
  execute(input: IN): Promise<OUT>;
}
```

## 2. `crud` flows (fixed, produced by the templates)

| Operation | Input | Flow | Output |
|---|---|---|---|
| `create` | `<Entity>State` fields | `new Entity({ ...input })` → `validate()` → `repository.create` | `void`, or `{ id }` |
| `update` | `id` + state fields | `findById` → `NotFoundError` if null → `current.clone(data)` → `validate()` → `repository.update` | `void`, or `{ id }` |
| `delete` | `{ id }` | `findById` → `NotFoundError` if null → `repository.delete(id)` | `void`, or `{ id }` |
| `find-by-id` | `{ id }` | `findById` → `NotFoundError` if null → map | entity data |
| `find-page` | `PageRequest<Filter>` | validate `page` / `pageSize` (integer, ≥ 1) → `findPage` → map items | `PageResult<<Name>Item>` |

"Entity data" is `id`, every `<Entity>State` field and `createdAt` / `updatedAt`. Narrow it with `--out-field` when the user wants fewer fields.

Adjust by hand only what the user asked for (e.g. fewer updatable fields, partial update, an extra dependency). If the repository uses separate `Create<Entity>Data` / `Update<Entity>Data` types instead of the entity, pass those to `create` / `update` instead of the entity instance; `tsc` in the verify step points at the mismatch.

## 3. `custom` flows

Build the flow only from what the user described. Allowed building blocks, in this order:

1. Input validation that the entity does not already cover: one `Validator.validate([...])` call with shared rules and codes `<entityCamel>.<field>` (or `<field>` for non-entity input).
2. Load what is needed through the dependencies (`findById`, provider calls). A missing entity → `NotFoundError("<entityCamel>.not.found")`.
3. An explicit rule the user stated → `if (...) throw new ValidationError("<entityCamel>.<reason>")` (or `DomainError` / `UnauthorizedError` when the user describes that kind of failure).
4. Build (`new Entity(...)`) or change (`entity.clone({...})`) the entity, then `validate()`.
5. Persist / notify through the dependencies.
6. Return the mapped `Out` (or nothing).

Where the description has gaps:

- unknown input/output fields → minimal contract with what is certain, plus a plain `// TODO:` placeholder line;
- unknown step → do not implement it; leave a plain `// TODO: <what is missing>` comment at the place it belongs;
- unknown dependency → stop and ask (never invent an interface).

Never add: retries, transactions, events, caching, logging, generic base classes, mappers in separate files, options objects, feature flags.

## 4. Update mode

When the use case file is already hand-written:

- keep its names, dependencies and behaviour; apply only the requested change;
- old contracts named `<Name>Input` (e.g. `RegisterUserInput`) stay as they are unless the user asks to rename them; if they do, rename every usage (tests included);
- extend the existing test so the changed lines and branches are covered again; never rewrite unrelated tests.
