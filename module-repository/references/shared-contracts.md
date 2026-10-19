# Shared persistence contracts

Snapshot of `packages/shared/src/db/*` used to design this skill. **The live files win**: always read them first, and if a generic changed, stop and tell the user which template in `assets/templates/` must be updated.

```ts
interface CreateRepository<TCreateData, TEntity> { create(data: TCreateData): Promise<TEntity>; }
interface UpdateRepository<TUpdateData, TEntity = TUpdateData> { update(data: TUpdateData): Promise<TEntity>; }
interface DeleteRepository<TId = string> { delete(id: TId): Promise<void>; }
interface FindByIdRepository<TEntity, TId = string> { findById(id: TId): Promise<TEntity | null>; }
interface FindPageRepository<TEntity, TFilter = unknown, TSortField extends string = string> {
  findPage(request: PageRequest<TFilter, TSortField>): Promise<PageResult<TEntity>>;
}

interface CrudRepository<
  TEntity,
  TCreateData,
  TUpdateData extends { id: TId },
  TFilter = unknown,
  TSortField extends string = string,
  TId = string,
> extends CreateRepository<TCreateData, TEntity>, UpdateRepository<TUpdateData, TEntity>,
    DeleteRepository<TId>, FindByIdRepository<TEntity, TId>, FindPageRepository<TEntity, TFilter, TSortField> {}

// page-data.ts
type SortDirection = "asc" | "desc";
interface PageSort<TSortField extends string = string> { field: TSortField; direction: SortDirection; }
interface PageRequest<TFilter = unknown, TSortField extends string = string> {
  page: number; pageSize: number; filter?: TFilter; sort?: PageSort<TSortField>[];
}
interface PageResult<TEntity> { items: TEntity[]; page: number; pageSize: number; totalItems: number; totalPages: number; }
```

Watch the generic order: `CreateRepository<TCreateData, TEntity>` and `UpdateRepository<TUpdateData, TEntity>` take the **input first**, while `CrudRepository`, `FindByIdRepository` and `FindPageRepository` take the **entity first**.

## Mapping a user request to contracts

| The user describes… | Use | Do not |
|---|---|---|
| save / insert / persist a new item and get it back | `--compose create` | declare `save(...)` / `insert(...)` |
| change / edit an existing item by its id | `--compose update` | declare `edit(...)` |
| remove by id | `--compose delete` | declare `remove(id)` |
| get one by id, `null` when missing | `--compose findById` | declare `getById(id)` |
| list with page, page size, filter and sort | `--compose findPage` | declare `list(page, size)` |
| all five of the above | `--type crud` (`CrudRepository`) | compose the five granular contracts |

If the user's wording matches a row but the signature differs (e.g. "remove returns the removed item", "find by id throws when missing"), **ask** whether the shared contract is acceptable before inventing a custom method with a shared-like name. The verify script rejects interfaces that redeclare `create`, `update`, `delete`, `findById` or `findPage` by hand.

## Type arguments chosen by the script

| Argument | Default (`entity`) | `--create-input data` / `--update-input data` |
|---|---|---|
| entity | `<Entity>` | `<Entity>` |
| create input | `<Entity>` (project pattern, see `modules/auth`) | `Create<Entity>Data extends <Entity>State` placeholder |
| update input | `<Entity>` (has `id: string`, satisfies `{ id: TId }`) | `Update<Entity>Data extends Partial<<Entity>State> { id: string }` placeholder |
| filter | `<Entity>Filter` placeholder (empty, `TODO:` comment) | same |
| sort field / id | shared defaults (`string`) | same |

Use the defaults unless the user asks for separate input types. The `data` placeholders are intentionally wide (the whole state) so the fake can build the entity with `new <Entity>(data)` and `current.clone(data)`. Narrowing them is the user's decision; if they narrow them, adjust the fake and its test accordingly.

The plain `TODO:` comments in `<Entity>Filter`, `Create<Entity>Data` and `Update<Entity>Data` are intentional placeholders that stay (same convention as `module-aggregate`). Only `TODO(module-repository)` markers must be resolved before verifying.
