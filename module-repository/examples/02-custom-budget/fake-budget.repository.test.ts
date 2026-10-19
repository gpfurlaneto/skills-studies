import { NotFoundError } from "@poupig/shared";
import { Budget, BudgetState } from "../../src/index";
import { FakeBudgetRepository } from "./fake-budget.repository";

function makeBudgetState(data: Partial<BudgetState> = {}): BudgetState {
  return {
    amount: 1,
    kind: "fixed",
    category: "food",
    ...data,
  };
}

function makeBudget(data: Partial<BudgetState> = {}): Budget {
  return new Budget(makeBudgetState(data));
}

describe("FakeBudgetRepository", () => {
  test("should start with the provided budgets", () => {
    const budget = makeBudget();

    expect(new FakeBudgetRepository([budget]).items).toEqual([budget]);
    expect(new FakeBudgetRepository().items).toEqual([]);
  });

  test("should create the budget from its data", async () => {
    const repository = new FakeBudgetRepository();

    const budget = await repository.create(makeBudgetState());

    expect(budget).toBeInstanceOf(Budget);
    expect(repository.items).toEqual([budget]);
  });

  test("should not create the budget with a duplicated id", async () => {
    const budget = makeBudget();
    const repository = new FakeBudgetRepository([budget]);

    await expect(
      repository.create(makeBudgetState({ id: budget.id })),
    ).rejects.toThrow("budget.already.exists");
  });

  test("should update an existing budget from its data", async () => {
    const budget = makeBudget();
    const repository = new FakeBudgetRepository([budget]);
    const updatedAt = new Date("2024-01-02T10:00:00.000Z");

    const updatedBudget = await repository.update({ id: budget.id, updatedAt });

    expect(updatedBudget.id).toBe(budget.id);
    expect(updatedBudget.updatedAt).toEqual(updatedAt);
    expect(repository.items).toEqual([updatedBudget]);
  });

  test("should not update a missing budget", async () => {
    await expect(
      new FakeBudgetRepository().update({ id: makeBudget().id }),
    ).rejects.toThrow(NotFoundError);
  });

  test("should paginate the budgets", async () => {
    const budgets = [makeBudget(), makeBudget(), makeBudget()];
    const repository = new FakeBudgetRepository(budgets);

    await expect(repository.findPage({ page: 2, pageSize: 2 })).resolves.toEqual({
      items: [budgets[2]],
      page: 2,
      pageSize: 2,
      totalItems: 3,
      totalPages: 2,
    });
  });

  test("should sort the budgets by multiple fields", async () => {
    const date = new Date("2024-01-01T10:00:00.000Z");
    const newest = makeBudget({ createdAt: new Date("2024-01-02T10:00:00.000Z") });
    const updatedFirst = makeBudget({ createdAt: date, updatedAt: date });
    const updatedLast = makeBudget({
      createdAt: date,
      updatedAt: new Date("2024-01-03T10:00:00.000Z"),
    });
    const repository = new FakeBudgetRepository([updatedLast, newest, updatedFirst]);

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
    const deletedBudget = makeBudget({
      deletedAt: new Date("2024-01-01T10:00:00.000Z"),
    });
    const activeBudget = makeBudget();
    const repository = new FakeBudgetRepository([deletedBudget, activeBudget]);

    const page = await repository.findPage({
      page: 1,
      pageSize: 10,
      sort: [{ field: "deletedAt", direction: "asc" }],
    });

    expect(page.items).toEqual([activeBudget, deletedBudget]);
  });

  test("should find the budgets by category", async () => {
    const food = makeBudget({ category: "food" });
    const repository = new FakeBudgetRepository([food, makeBudget({ category: "rent" })]);

    await expect(repository.findByCategory("food")).resolves.toEqual([food]);
  });
});
