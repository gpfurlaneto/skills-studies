import { NotFoundError } from "@poupig/shared";
import {
  FindTransactionById,
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
  const useCase = new FindTransactionById(transactionRepository);

  return { useCase, transactionRepository };
}

describe("FindTransactionById", () => {
  test("should return the transaction", async () => {
    const transaction = makeTransaction();
    const { useCase } = makeSut(new FakeTransactionRepository([transaction]));

    await expect(useCase.execute({ id: transaction.id })).resolves.toEqual({
      id: transaction.id,
      description: transaction.description,
      amount: transaction.amount,
      type: transaction.type,
      occurredAt: transaction.occurredAt,
      installments: transaction.installments,
      accountId: transaction.accountId,
      tags: transaction.tags,
      notes: transaction.notes,
      paidAt: transaction.paidAt,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
    });
  });

  test("should throw NotFoundError when the transaction does not exist", async () => {
    const { useCase } = makeSut(
      new FakeTransactionRepository([makeTransaction()]),
    );

    const promise = useCase.execute({ id: "missing-id" });

    await expect(promise).rejects.toBeInstanceOf(NotFoundError);
    await expect(promise).rejects.toThrow("transaction.not.found");
  });

  test("should propagate repository errors", async () => {
    class FailingTransactionRepository extends FakeTransactionRepository {
      override async findById(): Promise<never> {
        throw new Error("repository error");
      }
    }

    const { useCase } = makeSut(new FailingTransactionRepository());

    await expect(useCase.execute({ id: "any-id" })).rejects.toThrow(
      "repository error",
    );
  });
});
