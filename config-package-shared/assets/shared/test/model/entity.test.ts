import {
  EmailRule,
  Entity,
  EntityState,
  MinLengthRule,
  RequiredRule,
  UuidRule,
  ValidationException,
  Validator,
} from "../../src/index";

interface UserState extends EntityState {
  name: string;
  email: string;
  password: string;
}

class User extends Entity<UserState> {
  constructor(props: UserState) {
    super(props);
  }

  get name(): string {
    return this.props.name;
  }

  get email(): string {
    return this.props.email;
  }

  get password(): string {
    return this.props.password;
  }

  validate(): void {
    Validator.validate([
      {
        code: "name",
        value: this.name,
        rules: [new RequiredRule(), new MinLengthRule(3)],
      },
      {
        code: "email",
        value: this.email,
        rules: [new RequiredRule(), new EmailRule()],
      },
      {
        code: "password",
        value: this.password,
        rules: [new RequiredRule(), new MinLengthRule(8)],
      },
    ]);
  }
}

describe("Entity", () => {
  test("should generate a UUID v4 id when it is not provided", () => {
    const entity = new User({
      name: "John Doe",
      email: "john@doe.com",
      password: "12345678",
    });

    expect(entity.id).toEqual(expect.any(String));
    expect(new UuidRule().validate(entity.id)).toBeNull();
    expect(entity.createdAt).toBeInstanceOf(Date);
    expect(entity.updatedAt).toBeInstanceOf(Date);
    expect(entity.updatedAt.getTime()).toBe(entity.createdAt.getTime());
    expect(entity.deletedAt).toBeNull();
  });

  test("should keep the provided id when it is valid", () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    const entity = new User({
      id,
      name: "John Doe",
      email: "john@doe.com",
      password: "12345678",
    });

    expect(entity.id).toBe(id);
  });

  test("should compare equality using only the id", () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    const firstEntity = new User({
      id,
      name: "John Doe",
      email: "john@doe.com",
      password: "12345678",
    });
    const secondEntity = new User({
      id,
      name: "Jane Doe",
      email: "jane@doe.com",
      password: "abcdefgh",
    });
    const thirdEntity = new User({
      id: "7c56d0e1-8d9a-4f7d-bdb5-6fd1b31db7f1",
      name: "Jake Doe",
      email: "jake@doe.com",
      password: "87654321",
    });

    expect(firstEntity.equals(secondEntity)).toBe(true);
    expect(firstEntity.equals(thirdEntity)).toBe(false);
    expect(firstEntity.equals(null)).toBe(false);
  });

  test("should clone the entity merging the current state with new attributes", () => {
    const createdAt = new Date("2024-01-01T10:00:00.000Z");
    const updatedAt = new Date("2024-01-02T10:00:00.000Z");
    const deletedAt = new Date("2024-01-03T10:00:00.000Z");
    const entity = new User({
      id: "550e8400-e29b-41d4-a716-446655440000",
      name: "John Doe",
      email: "john@doe.com",
      password: "12345678",
      createdAt,
      updatedAt,
      deletedAt,
    });

    const clonedEntity = entity.clone({
      name: "Jane Doe",
      email: "jane@doe.com",
    });

    expect(clonedEntity).toBeInstanceOf(User);
    expect(clonedEntity).not.toBe(entity);
    expect(clonedEntity.id).toBe(entity.id);
    expect(clonedEntity.name).toBe("Jane Doe");
    expect(clonedEntity.email).toBe("jane@doe.com");
    expect(clonedEntity.password).toBe("12345678");
    expect(clonedEntity.createdAt.getTime()).toBe(createdAt.getTime());
    expect(clonedEntity.updatedAt.getTime()).toBeGreaterThan(updatedAt.getTime());
    expect(clonedEntity.deletedAt?.getTime()).toBe(deletedAt.getTime());
  });

  test("should keep id and createdAt unchanged when cloning", () => {
    const createdAt = new Date("2024-01-01T10:00:00.000Z");
    const entity = new User({
      id: "550e8400-e29b-41d4-a716-446655440000",
      name: "John Doe",
      email: "john@doe.com",
      password: "12345678",
      createdAt,
    });

    const clonedEntity = entity.clone({
      id: "7c56d0e1-8d9a-4f7d-bdb5-6fd1b31db7f1",
      createdAt: new Date("2025-01-01T10:00:00.000Z"),
    });

    expect(clonedEntity.id).toBe(entity.id);
    expect(clonedEntity.createdAt.getTime()).toBe(createdAt.getTime());
  });

  test("should use the updatedAt provided when cloning", () => {
    const updatedAt = new Date("2025-01-01T10:00:00.000Z");
    const entity = new User({
      name: "John Doe",
      email: "john@doe.com",
      password: "12345678",
    });

    const clonedEntity = entity.clone({ updatedAt });

    expect(clonedEntity.updatedAt.getTime()).toBe(updatedAt.getTime());
  });

  test("should allow setting deletedAt through clone", () => {
    const deletedAt = new Date("2025-01-01T10:00:00.000Z");
    const entity = new User({
      name: "John Doe",
      email: "john@doe.com",
      password: "12345678",
    });

    const clonedEntity = entity.clone({ deletedAt });

    expect(entity.deletedAt).toBeNull();
    expect(clonedEntity.deletedAt?.getTime()).toBe(deletedAt.getTime());
  });

  test("should validate the provided id in the base entity", () => {
    expect(
      () =>
        new User({
          id: "id-invalido",
          name: "John Doe",
          email: "john@doe.com",
          password: "12345678",
        }),
    ).toThrow(ValidationException);

    try {
      new User({
        id: "id-invalido",
        name: "John Doe",
        email: "john@doe.com",
        password: "12345678",
      });
    } catch (error) {
      expect(
        (error as ValidationException).errors.map((item) => item.message),
      ).toEqual(["id.uuid"]);
    }
  });

  test("should not execute the validation of the concrete entity in the constructor", () => {
    expect(
      () =>
        new User({
          name: "",
          email: "email-invalido",
          password: "123",
        }),
    ).not.toThrow();
  });

  test("should execute the validation of the concrete entity when validate is called", () => {
    const entity = new User({
      name: "",
      email: "email-invalido",
      password: "123",
    });

    expect(() => entity.validate()).toThrow(ValidationException);

    try {
      entity.validate();
    } catch (error) {
      expect(
        (error as ValidationException).errors.map((item) => item.message),
      ).toEqual([
        "name.required",
        "email.invalid.email",
        "password.min.length",
      ]);
    }
  });

  test("should validate the timestamps provided in the base entity", () => {
    expect(
      () =>
        new User({
          name: "John Doe",
          email: "john@doe.com",
          password: "12345678",
          createdAt: new Date("data-invalida"),
          updatedAt: new Date("data-invalida"),
          deletedAt: new Date("data-invalida"),
        }),
    ).toThrow(ValidationException);

    try {
      new User({
        name: "John Doe",
        email: "john@doe.com",
        password: "12345678",
        createdAt: new Date("data-invalida"),
        updatedAt: new Date("data-invalida"),
        deletedAt: new Date("data-invalida"),
      });
    } catch (error) {
      expect(
        (error as ValidationException).errors.map((item) => item.message),
      ).toEqual([
        "createdAt.invalid.date",
        "updatedAt.invalid.date",
        "deletedAt.invalid.date",
      ]);
    }
  });
});
