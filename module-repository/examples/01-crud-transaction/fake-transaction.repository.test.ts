import { NotFoundError } from "@poupig/shared";
import { Transaction, TransactionState } from "../../src/index";
import { FakeTransactionRepository } from "./fake-transaction.repository";

function makeTransactionState(data: Partial<TransactionState> = {}): TransactionState {
  return {
    description: "sample description",
    ...data,
  };
}

function makeTransaction(data: Partial<TransactionState> = {}): Transaction {
  return new Transaction(makeTransactionState(data));
}

describe("FakeTransactionRepository", () => {
  test("should start with the provided transactions", () => {
    const transaction = makeTransaction();

    expect(new FakeTransactionRepository([transaction]).items).toEqual([transaction]);
    expect(new FakeTransactionRepository().items).toEqual([]);
  });

  test("should create the transaction", async () => {
    const repository = new FakeTransactionRepository();
    const transaction = makeTransaction();

    await expect(repository.create(transaction)).resolves.toBe(transaction);
    expect(repository.items).toEqual([transaction]);
  });

  test("should not create the transaction with a duplicated id", async () => {
    const transaction = makeTransaction();
    const repository = new FakeTransactionRepository([transaction]);

    await expect(repository.create(transaction)).rejects.toThrow(
      "transaction.already.exists",
    );
  });

  test("should update an existing transaction", async () => {
    const transaction = makeTransaction();
    const repository = new FakeTransactionRepository([transaction]);
    const updatedTransaction = transaction.clone({
      updatedAt: new Date("2024-01-02T10:00:00.000Z"),
    });

    await expect(repository.update(updatedTransaction)).resolves.toBe(updatedTransaction);
    expect(repository.items).toEqual([updatedTransaction]);
  });

  test("should not update a missing transaction", async () => {
    await expect(
      new FakeTransactionRepository().update(makeTransaction()),
    ).rejects.toThrow(NotFoundError);
  });

  test("should delete an existing transaction", async () => {
    const transaction = makeTransaction();
    const repository = new FakeTransactionRepository([transaction]);

    await repository.delete(transaction.id);

    expect(repository.items).toEqual([]);
    await expect(repository.delete(transaction.id)).rejects.toThrow(NotFoundError);
  });

  test("should find the transaction by id", async () => {
    const transaction = makeTransaction();
    const repository = new FakeTransactionRepository([transaction]);

    await expect(repository.findById(transaction.id)).resolves.toBe(transaction);
    await expect(repository.findById("missing")).resolves.toBeNull();
  });

  test("should paginate the transactions", async () => {
    const transactions = [makeTransaction(), makeTransaction(), makeTransaction()];
    const repository = new FakeTransactionRepository(transactions);

    await expect(repository.findPage({ page: 2, pageSize: 2 })).resolves.toEqual({
      items: [transactions[2]],
      page: 2,
      pageSize: 2,
      totalItems: 3,
      totalPages: 2,
    });
  });

  test("should sort the transactions by multiple fields", async () => {
    const date = new Date("2024-01-01T10:00:00.000Z");
    const newest = makeTransaction({ createdAt: new Date("2024-01-02T10:00:00.000Z") });
    const updatedFirst = makeTransaction({ createdAt: date, updatedAt: date });
    const updatedLast = makeTransaction({
      createdAt: date,
      updatedAt: new Date("2024-01-03T10:00:00.000Z"),
    });
    const repository = new FakeTransactionRepository([updatedLast, newest, updatedFirst]);

    const page = await repository.findPage({
      page: 1,
      pageSize: 10,
      sort: [
        { field: "createdAt", direction: "desc" },
        { field: "updatedAt", direction: "asc" },
      ],
    });

    expect(page.items).toEqual([newest, updatedFirst, updatedLast]);
  });

  test("should sort empty values first in ascending order", async () => {
    const deletedTransaction = makeTransaction({
      deletedAt: new Date("2024-01-01T10:00:00.000Z"),
    });
    const activeTransaction = makeTransaction();
    const repository = new FakeTransactionRepository([deletedTransaction, activeTransaction]);

    const page = await repository.findPage({
      page: 1,
      pageSize: 10,
      sort: [{ field: "deletedAt", direction: "asc" }],
    });

    expect(page.items).toEqual([activeTransaction, deletedTransaction]);
  });
});
