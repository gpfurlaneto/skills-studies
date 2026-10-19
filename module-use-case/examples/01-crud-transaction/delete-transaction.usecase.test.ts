import { NotFoundError } from "@poupig/shared";
import {
  DeleteTransaction,
  Transaction,
  TransactionState,
} from "../../../src/index";
import { FakeTransactionRepository } from "../../mock";

const validState: TransactionState = {
  description: "Grocery shopping",
  amount: 150.75,
  type: "expense",
  occurredAt: new Date("2024-03-10T12:00:00.000Z"),
  installments: 1,
  accountId: "6f1c2a9e-8b4d-4c3a-9f2e-1d5b7a8c9e0f",
  tags: ["food", "home"],
};

function makeTransaction(
  overrides: Partial<TransactionState> = {},
): Transaction {
  return new Transaction({ ...validState, ...overrides });
}

function makeSut(transactionRepository = new FakeTransactionRepository()) {
  const useCase = new DeleteTransaction(transactionRepository);

  return { useCase, transactionRepository };
}

describe("DeleteTransaction", () => {
  test("should delete the transaction", async () => {
    const transaction = makeTransaction();
    const { useCase, transactionRepository } = makeSut(
      new FakeTransactionRepository([transaction]),
    );

    await expect(
      useCase.execute({ id: transaction.id }),
    ).resolves.toBeUndefined();

    await expect(
      transactionRepository.findById(transaction.id),
    ).resolves.toBeNull();
  });

  test("should throw NotFoundError when the transaction does not exist", async () => {
    const transaction = makeTransaction();
    const { useCase, transactionRepository } = makeSut(
      new FakeTransactionRepository([transaction]),
    );

    const promise = useCase.execute({ id: "missing-id" });

    await expect(promise).rejects.toBeInstanceOf(NotFoundError);
    await expect(promise).rejects.toThrow("transaction.not.found");
    expect(transactionRepository.items).toEqual([transaction]);
  });

  test("should propagate repository errors", async () => {
    class FailingTransactionRepository extends FakeTransactionRepository {
      override async delete(): Promise<never> {
        throw new Error("repository error");
      }
    }

    const transaction = makeTransaction();
    const { useCase } = makeSut(
      new FailingTransactionRepository([transaction]),
    );

    await expect(useCase.execute({ id: transaction.id })).rejects.toThrow(
      "repository error",
    );
  });
});
