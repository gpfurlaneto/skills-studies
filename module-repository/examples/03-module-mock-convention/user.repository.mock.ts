import { NotFoundError, PageRequest, PageResult } from "@poupig/shared";
import { User, UserPageParams, UserRepository } from "../../src/index";

export class UserRepositoryMock implements UserRepository {
  private readonly users = new Map<string, User>();

  constructor(users: User[] = []) {
    users.forEach((user) => this.users.set(user.id, user));
  }

  get items(): User[] {
    return [...this.users.values()];
  }

  async create(user: User): Promise<User> {
    if (this.users.has(user.id)) {
      throw new Error(`user.already.exists: ${user.id}`);
    }

    this.users.set(user.id, user);
    return user;
  }

  async update(user: User): Promise<User> {
    if (!this.users.has(user.id)) {
      throw new NotFoundError(`user.not.found: ${user.id}`);
    }

    this.users.set(user.id, user);
    return user;
  }

  async delete(id: string): Promise<void> {
    if (!this.users.delete(id)) {
      throw new NotFoundError(`user.not.found: ${id}`);
    }
  }

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  async findPage({
    page,
    pageSize,
    sort = [],
  }: PageRequest<UserPageParams, string>): Promise<PageResult<User>> {
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

function getFieldValue(user: User, field: string): unknown {
  return (user as unknown as Record<string, unknown>)[field];
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
