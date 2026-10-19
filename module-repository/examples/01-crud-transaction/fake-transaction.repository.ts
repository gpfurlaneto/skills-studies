import { NotFoundError, PageRequest, PageResult } from "@poupig/shared";
import { Transaction, TransactionFilter, TransactionRepository } from "../../src/index";

export class FakeTransactionRepository implements TransactionRepository {
  private readonly transactions = new Map<string, Transaction>();

  constructor(transactions: Transaction[] = []) {
    transactions.forEach((transaction) => this.transactions.set(transaction.id, transaction));
  }

  get items(): Transaction[] {
    return [...this.transactions.values()];
  }

  async create(transaction: Transaction): Promise<Transaction> {
    if (this.transactions.has(transaction.id)) {
      throw new Error(`transaction.already.exists: ${transaction.id}`);
    }

    this.transactions.set(transaction.id, transaction);
    return transaction;
  }

  async update(transaction: Transaction): Promise<Transaction> {
    if (!this.transactions.has(transaction.id)) {
      throw new NotFoundError(`transaction.not.found: ${transaction.id}`);
    }

    this.transactions.set(transaction.id, transaction);
    return transaction;
  }

  async delete(id: string): Promise<void> {
    if (!this.transactions.delete(id)) {
      throw new NotFoundError(`transaction.not.found: ${id}`);
    }
  }

  async findById(id: string): Promise<Transaction | null> {
    return this.transactions.get(id) ?? null;
  }

  async findPage({
    page,
    pageSize,
    sort = [],
  }: PageRequest<TransactionFilter>): Promise<PageResult<Transaction>> {
    // The filter is ignored until TransactionFilter declares fields.
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
}

function getFieldValue(transaction: Transaction, field: string): unknown {
  return (transaction as unknown as Record<string, unknown>)[field];
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
