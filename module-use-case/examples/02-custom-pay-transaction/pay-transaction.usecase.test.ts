import { NotFoundError, ValidationError } from "@poupig/shared";
import {
  PayTransaction,
  Transaction,
  TransactionState,
} from "../../../src/index";
import { FakeClockProvider, FakeTransactionRepository } from "../../mock";

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

function makeSut(
  transactionRepository = new FakeTransactionRepository(),
  clockProvider = new FakeClockProvider(),
) {
  const useCase = new PayTransaction(transactionRepository, clockProvider);

  return { useCase, transactionRepository, clockProvider };
}

describe("PayTransaction", () => {
  test("should mark the transaction as paid with the current date", async () => {
    const existing = makeTransaction();
    const { useCase, transactionRepository, clockProvider } = makeSut(
      new FakeTransactionRepository([existing]),
    );
    const paidAt = new Date("2024-03-15T08:30:00.000Z");
    clockProvider.set(paidAt);

    await expect(useCase.execute({ id: existing.id })).resolves.toEqual({
      id: existing.id,
      paidAt,
    });

    const transaction = (await transactionRepository.findById(existing.id))!;

    expect(transaction).not.toBe(existing);
    expect(transaction.paidAt).toEqual(paidAt);
    expect(transaction.description).toBe(existing.description);
  });

  test("should throw NotFoundError when the transaction does not exist", async () => {
    const { useCase } = makeSut();

    const promise = useCase.execute({ id: "missing-id" });

    await expect(promise).rejects.toBeInstanceOf(NotFoundError);
    await expect(promise).rejects.toThrow("transaction.not.found");
  });

  test("should not pay a transaction twice", async () => {
    const existing = makeTransaction({
      paidAt: new Date("2024-03-11T10:00:00.000Z"),
    });
    const { useCase, transactionRepository } = makeSut(
      new FakeTransactionRepository([existing]),
    );

    const promise = useCase.execute({ id: existing.id });

    await expect(promise).rejects.toBeInstanceOf(ValidationError);
    await expect(promise).rejects.toThrow("transaction.already.paid");
    await expect(transactionRepository.findById(existing.id)).resolves.toBe(
      existing,
    );
  });

  test("should not persist a transaction that becomes invalid", async () => {
    const existing = makeTransaction();
    const { useCase, transactionRepository } = makeSut(
      new FakeTransactionRepository([existing]),
      new FakeClockProvider(new Date("invalid")),
    );

    await expect(useCase.execute({ id: existing.id })).rejects.toThrow(
      "Validation failed",
    );
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

    await expect(useCase.execute({ id: existing.id })).rejects.toThrow(
      "repository error",
    );
  });
});
