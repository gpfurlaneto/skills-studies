# Examples (few-shots)

Structural references only. Every file here was produced by `scripts/scaffold-usecase.mjs` in a throwaway module, had its markers resolved by hand and passed `scripts/verify-usecase.mjs` (100% coverage of each use case). The entity is the `Transaction` of the `module-entity` examples and the repository/fake are the `TransactionRepository` / `FakeTransactionRepository` of the `module-repository` examples. Copy the **shape**, not the domain.

| Folder | Command | What it shows |
|---|---|---|
| `01-crud-transaction/` | `--module reports --aggregate transaction --type crud --name <op>` with `--output no` for create/delete and `--output yes` for update/find-by-id/find-page | The five fixed crud flows, their `In` / `Out` contracts, the `index.ts` exports and their tests. Resolved by hand: `validState`, `validInput`, the invalid override and its exact error codes. |
| `02-custom-pay-transaction/` | `--module reports --aggregate transaction --type custom --name pay-transaction --output yes --dep TransactionRepository --dep ClockProvider --in-field "id: string" --out-field "id: string" --out-field "paidAt: Date"` | A custom flow from a user description ("pay a transaction with the current date; it cannot be paid twice"), a reused repository fake, a **new** fake for `ClockProvider` (no fake existed) and tests for every branch. `clock.provider.ts` is the stand-in interface used to run it. |

The real `modules/auth` use case (`register-user.usecase.ts`) is the third reference: several dependencies, input validation with shared rules before hashing, and reused `*.mock.ts` fakes. It predates the `In` naming rule (`RegisterUserInput`).

## How the `02` markers were resolved

User description: "Pay a transaction: set `paidAt` to the current date. A transaction that is already paid cannot be paid again."

```ts
async execute(input: PayTransactionIn): Promise<PayTransactionOut> {
  const current = await this.transactionRepository.findById(input.id);

  if (!current) {
    throw new NotFoundError("transaction.not.found");
  }

  if (current.paidAt) {
    throw new ValidationError("transaction.already.paid"); // the rule the user stated
  }

  const paidAt = this.clockProvider.now();
  const transaction = current.clone({ paidAt });

  transaction.validate();

  await this.transactionRepository.update(transaction);

  return { id: transaction.id, paidAt };
}
```

Tests: happy path (output + stored change), not found, already paid (nothing persisted), invalid entity after the change, propagated repository error. Five tests, one per flow, 100% of the file.
