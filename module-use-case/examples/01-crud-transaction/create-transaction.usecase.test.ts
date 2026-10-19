import { ValidationException } from "@poupig/shared";
import {
  CreateTransaction,
  CreateTransactionIn,
  Transaction,
} from "../../../src/index";
import { FakeTransactionRepository } from "../../mock";

function makeSut(transactionRepository = new FakeTransactionRepository()) {
  const useCase = new CreateTransaction(transactionRepository);

  return { useCase, transactionRepository };
}

async function getErrorMessages(promise: Promise<unknown>): Promise<string[]> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ValidationException) {
      return error.errors.map((item) => item.message);
    }

    throw error;
  }

  return [];
}

const validInput: CreateTransactionIn = {
  description: "Grocery shopping",
  amount: 150.75,
  type: "expense",
  occurredAt: new Date("2024-03-10T12:00:00.000Z"),
  installments: 1,
  accountId: "6f1c2a9e-8b4d-4c3a-9f2e-1d5b7a8c9e0f",
  tags: ["food", "home"],
};

describe("CreateTransaction", () => {
  test("should create and persist the transaction", async () => {
    const { useCase, transactionRepository } = makeSut();

    await expect(useCase.execute(validInput)).resolves.toBeUndefined();

    expect(transactionRepository.items).toHaveLength(1);

    const transaction = transactionRepository.items[0]!;

    expect(transaction).toBeInstanceOf(Transaction);
    expect(transaction).toMatchObject(validInput);
  });

  test("should not persist an invalid transaction", async () => {
    const { useCase, transactionRepository } = makeSut();

    const messages = await getErrorMessages(
      useCase.execute({
        ...validInput,
        amount: -10,
        tags: ["Not A Slug"],
      }),
    );

    expect(messages).toEqual([
      "transaction.amount.positive",
      "transaction.tags.slug",
    ]);
    expect(transactionRepository.items).toHaveLength(0);
  });

  test("should propagate repository errors", async () => {
    class FailingTransactionRepository extends FakeTransactionRepository {
      override async create(): Promise<never> {
        throw new Error("repository error");
      }
    }

    const { useCase } = makeSut(new FailingTransactionRepository());

    await expect(useCase.execute(validInput)).rejects.toThrow(
      "repository error",
    );
  });
});
