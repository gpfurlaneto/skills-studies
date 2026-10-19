# Examples (few-shots)

Structural references only. Every file here was produced by `scripts/scaffold-repository.mjs` and passed `scripts/verify-repository.mjs` (except `03`, which is a snapshot of the real `auth` module). Do not copy domain content from them: copy the **shape**.

| Folder | Command | What it shows |
|---|---|---|
| `01-crud-transaction/` | `--module reports --aggregate transaction --type crud` | Full `CrudRepository` with entity inputs (the project default), the `Fake<Entity>Repository` in `test/mock/fake-<aggregate>.repository.ts` and its generated test. Nothing to fill by hand. |
| `02-custom-budget/` | `--module reports --path modules/reports/src/budget/provider/budget.repository.ts --type custom --compose create,update,findPage --create-input data --update-input data --method "findByCategory(category: BudgetCategory): Promise<Budget[]>"` | Granular shared contracts + one custom method, `Create<Entity>Data` / `Update<Entity>Data` placeholders, a type from the entity file imported automatically, and the three markers resolved by hand: the `category` sample value, the `findByCategory` fake body and its test. `budget.entity.ts` is a minimal stand-in entity used only to run the example. |
| `03-module-mock-convention/` | (real files of `modules/auth`) | A module that already names its fakes `<aggregate>.repository.mock.ts` / `<Entity>RepositoryMock`. In such a module the script follows that convention instead of `fake-<aggregate>.repository.ts`. |

## How the `02` markers were resolved

```ts
// fake: filter over the in-memory items, no extra state, no side effects
async findByCategory(category: BudgetCategory): Promise<Budget[]> {
  return this.items.filter((budget) => budget.category === category);
}
```

```ts
// test: one case that proves the filter keeps matches and drops the rest
test("should find the budgets by category", async () => {
  const food = makeBudget({ category: "food" });
  const repository = new FakeBudgetRepository([food, makeBudget({ category: "rent" })]);

  await expect(repository.findByCategory("food")).resolves.toEqual([food]);
});
```
