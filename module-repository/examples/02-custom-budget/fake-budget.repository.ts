import { NotFoundError, PageRequest, PageResult } from "@poupig/shared";
import {
  Budget,
  BudgetCategory,
  BudgetFilter,
  BudgetRepository,
  CreateBudgetData,
  UpdateBudgetData,
} from "../../src/index";

export class FakeBudgetRepository implements BudgetRepository {
  private readonly budgets = new Map<string, Budget>();

  constructor(budgets: Budget[] = []) {
    budgets.forEach((budget) => this.budgets.set(budget.id, budget));
  }

  get items(): Budget[] {
    return [...this.budgets.values()];
  }

  async create(data: CreateBudgetData): Promise<Budget> {
    const budget = new Budget(data);

    if (this.budgets.has(budget.id)) {
      throw new Error(`budget.already.exists: ${budget.id}`);
    }

    this.budgets.set(budget.id, budget);
    return budget;
  }

  async update(data: UpdateBudgetData): Promise<Budget> {
    const current = this.budgets.get(data.id);

    if (!current) {
      throw new NotFoundError(`budget.not.found: ${data.id}`);
    }

    const budget = current.clone(data);
    this.budgets.set(budget.id, budget);
    return budget;
  }

  async findPage({
    page,
    pageSize,
    sort = [],
  }: PageRequest<BudgetFilter>): Promise<PageResult<Budget>> {
    // The filter is ignored until BudgetFilter declares fields.
    const items = this.items.sort((first, second) => {
      for (const { field, direction } of sort) {
        const result = compareValues(
          getFieldValue(first, field),
          getFieldValue(second, field),
        );

        if (result !== 0) {
          return direction === "asc" ? result : -result;
        }
      }

      return 0;
    });
    const start = (page - 1) * pageSize;

    return {
      items: items.slice(start, start + pageSize),
      page,
      pageSize,
      totalItems: items.length,
      totalPages: Math.ceil(items.length / pageSize),
    };
  }

  async findByCategory(category: BudgetCategory): Promise<Budget[]> {
    return this.items.filter((budget) => budget.category === category);
  }
}

function getFieldValue(budget: Budget, field: string): unknown {
  return (budget as unknown as Record<string, unknown>)[field];
}

function compareValues(first: unknown, second: unknown): number {
  const firstValue = toComparable(first);
  const secondValue = toComparable(second);

  if (typeof firstValue === "number" && typeof secondValue === "number") {
    return firstValue - secondValue;
  }

  return String(firstValue).localeCompare(String(secondValue));
}

function toComparable(value: unknown): unknown {
  return value instanceof Date ? value.getTime() : (value ?? "");
}
