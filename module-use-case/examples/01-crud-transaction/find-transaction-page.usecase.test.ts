import { ValidationException } from "@poupig/shared";
import {
  FindTransactionPage,
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
  const useCase = new FindTransactionPage(transactionRepository);

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

describe("FindTransactionPage", () => {
  test("should return the requested page", async () => {
    const items = [makeTransaction(), makeTransaction(), makeTransaction()];
    const { useCase } = makeSut(new FakeTransactionRepository(items));
    const transaction = items[2]!;

    await expect(useCase.execute({ page: 2, pageSize: 2 })).resolves.toEqual({
      items: [
        {
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
        },
      ],
      page: 2,
      pageSize: 2,
      totalItems: 3,
      totalPages: 2,
    });
  });

  test("should return an empty page when there is nothing to list", async () => {
    const { useCase } = makeSut();

    await expect(useCase.execute({ page: 1, pageSize: 10 })).resolves.toEqual({
      items: [],
      page: 1,
      pageSize: 10,
      totalItems: 0,
      totalPages: 0,
    });
  });

  test.each([
    [{ page: 0, pageSize: 10 }, ["page.min.value"]],
    [{ page: 1.5, pageSize: 10 }, ["page.integer"]],
    [{ page: 1, pageSize: 0 }, ["pageSize.min.value"]],
    [{ page: 1, pageSize: 2.5 }, ["pageSize.integer"]],
  ])(
    "should reject the invalid page request %o before querying",
    async (request, expected) => {
      class SpyTransactionRepository extends FakeTransactionRepository {
        findPageCalls = 0;

        override async findPage(
          ...args: Parameters<FakeTransactionRepository["findPage"]>
        ) {
          this.findPageCalls++;
          return super.findPage(...args);
        }
      }

      const transactionRepository = new SpyTransactionRepository();
      const { useCase } = makeSut(transactionRepository);

      await expect(getErrorMessages(useCase.execute(request))).resolves.toEqual(
        expected,
      );
      expect(transactionRepository.findPageCalls).toBe(0);
    },
  );

  test("should propagate repository errors", async () => {
    class FailingTransactionRepository extends FakeTransactionRepository {
      override async findPage(): Promise<never> {
        throw new Error("repository error");
      }
    }

    const { useCase } = makeSut(new FailingTransactionRepository());

    await expect(useCase.execute({ page: 1, pageSize: 10 })).rejects.toThrow(
      "repository error",
    );
  });
});
