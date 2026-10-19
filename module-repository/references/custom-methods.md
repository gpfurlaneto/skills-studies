# Custom methods

How to turn the user's description of a method into a signature, a fake implementation and a test.

## 1. Signature

Pass each method to the script as `--method "<name>(<params>): Promise<T>"`.

- **Name**: camelCase verb + subject, following the shared style: `findByEmail`, `findAllByOwner`, `existsByDocument`, `countByStatus`, `findLatest`. A single-item finder starts with `find`, a list finder with `findAll` or `find...s`, a boolean check with `exists`, a counter with `count`.
- **Async**: every method returns `Promise<...>`. The script refuses anything else.
- **Single item**: `Promise<<Entity> | null>`. Absence is `null`, never an exception (same as `findById`). Throwing belongs to the use case.
- **List**: `Promise<<Entity>[]>`, empty array when nothing matches.
- **Boolean / count**: `Promise<boolean>` / `Promise<number>`.
- **Command without result**: `Promise<void>`.
- **Parameters**: primitives or types of the entity (`<Entity>State["field"]`, unions exported by the entity file). Use one object parameter (`params: <Entity>By<X>Params`) only when there are more than two values.
- **Auxiliary types** (params objects, period, criteria) go in the repository file, right above `export interface <Entity>Repository`, named `<Entity><Purpose>` (e.g. `BudgetPeriod`, `TransactionSearchParams`). Types exported by the entity file are imported automatically; any other type must be declared by hand.

### Ask before writing when

- the return type is unclear (one item or a list? entity or a projection?);
- "find" could mean "throw when missing" or "return null";
- a value could be a single value or a range (date, amount);
- the description matches a shared operation but with a different contract (see `shared-contracts.md`);
- the method needs data the entity does not have (e.g. filter by a field not in `<Entity>State`).

Ask one objective question listing the concrete options, e.g.:

> "`findByPeriod` should return `Promise<Transaction[]>` filtered by `createdAt` between `start` and `end` (inclusive), or a page (`PageResult<Transaction>`)?"

Never invent business rules (status transitions, ownership checks, soft-delete semantics) that the user did not describe.

## 2. Fake implementation

The script writes one stub per custom method that throws `"<name> is not implemented yet."` under a `TODO(module-repository)` marker. Replace the whole body.

Rules:

- Work only over `this.<plural>` / `this.items`. No new fields unless the method stores something the map cannot hold.
- Be the simplest correct, deterministic behaviour: `filter`, `find`, `some`, `length`. No randomness, no `Date.now()` inside comparisons, no I/O, no timers.
- Mirror the contract exactly: `?? null` for single items, `[]` for empty lists.
- Writes keep the shared fake behaviour: unknown id → `NotFoundError("<code>.not.found: <id>")`, duplicated id → `Error("<code>.already.exists: <id>")`.
- Never use `jest.fn`, `jest.mock`, `jest.spyOn` or any mock library. The verify script rejects them.

| Intent | Body |
|---|---|
| `findByEmail(email): Promise<User \| null>` | `return this.items.find((user) => user.email === email) ?? null;` |
| `findAllByCategory(category): Promise<Budget[]>` | `return this.items.filter((budget) => budget.category === category);` |
| `existsByEmail(email): Promise<boolean>` | `return this.items.some((user) => user.email === email);` |
| `countByStatus(status): Promise<number>` | `return this.items.filter((order) => order.status === status).length;` |
| `findByPeriod(start, end): Promise<Transaction[]>` | `return this.items.filter(({ createdAt }) => createdAt >= start && createdAt <= end);` |

If the method filters by a field, the entity must expose a getter for it. If it does not, stop and tell the user (adding getters is the job of `module-entity`).

## 3. Test

The script writes a `TODO(module-repository)` marker per custom method inside the `describe`. Replace it with tests that:

- use only `make<Entity>(...)` / `make<Entity>State(...)` and the fake constructor to arrange state;
- prove both sides of each condition (a match and a non-match, found and `null`, `true` and `false`);
- reach **100% coverage of the fake file** (statements, branches, functions, lines). `verify-repository.mjs` enforces it.

Also resolve the `make<Entity>State` marker when a required state field has a type the script cannot sample (aliases, objects): set a simple valid-looking literal. The entity validates lazily, so the sample only has to satisfy the TypeScript type.
