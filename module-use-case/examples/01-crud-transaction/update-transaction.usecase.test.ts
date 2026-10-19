import { NotFoundError, ValidationException } from "@poupig/shared";
import {
  Transaction,
  TransactionState,
  UpdateTransaction,
  UpdateTransactionIn,
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
  const useCase = new UpdateTransaction(transactionRepository);

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

const validInput: Omit<UpdateTransactionIn, "id"> = {
  description: "Monthly rent",
  amount: 1200,
  type: "expense",
  occurredAt: new Date("2024-04-01T09:00:00.000Z"),
  installments: 2,
  accountId: "6f1c2a9e-8b4d-4c3a-9f2e-1d5b7a8c9e0f",
  tags: ["housing"],
  notes: "April rent",
};

describe("UpdateTransaction", () => {
  test("should update and persist the transaction", async () => {
    const existing = makeTransaction();
    const { useCase, transactionRepository } = makeSut(
      new FakeTransactionRepository([existing]),
    );

    const output = await useCase.execute({ id: existing.id, ...validInput });

    const transaction = (await transactionRepository.findById(existing.id))!;

    expect(transaction).toBeInstanceOf(Transaction);
    expect(transaction).not.toBe(existing);
    expect(transaction).toMatchObject({ id: existing.id, ...validInput });
    expect(transaction.createdAt).toEqual(existing.createdAt);
    expect(output).toEqual({
      id: transaction.id,
    });
  });

  test("should throw NotFoundError when the transaction does not exist", async () => {
    const { useCase, transactionRepository } = makeSut();

    const promise = useCase.execute({ id: "missing-id", ...validInput });

    await expect(promise).rejects.toBeInstanceOf(NotFoundError);
    await expect(promise).rejects.toThrow("transaction.not.found");
    expect(transactionRepository.items).toHaveLength(0);
  });

  test("should not persist an invalid transaction", async () => {
    const existing = makeTransaction();
    const { useCase, transactionRepository } = makeSut(
      new FakeTransactionRepository([existing]),
    );

    const messages = await getErrorMessages(
      useCase.execute({
        id: existing.id,
        ...validInput,
        amount: -10,
        tags: ["Not A Slug"],
      }),
    );

    expect(messages).toEqual([
      "transaction.amount.positive",
      "transaction.tags.slug",
    ]);
    await expect(transactionRepository.findById(existing.id)).resolves.toBe(
      existing,
    );
  });

  test("should propagate repository errors", async () => {
    class FailingTransactionRepository extends FakeTransactionRepository {
      override async update(): Promise<never> {
        throw new Error("repository error");
      }
    }

    const existing = makeTransaction();
    const { useCase } = makeSut(new FailingTransactionRepository([existing]));

    await expect(
      useCase.execute({ id: existing.id, ...validInput }),
    ).rejects.toThrow("repository error");
  });
});
