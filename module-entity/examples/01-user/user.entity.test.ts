import { UuidRule, ValidationException } from "@poupig/shared";
import { User, UserState } from "../../../src/index";

const PASSWORD_HASH =
  "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

const validProps: UserState = {
  name: "João da Silva",
  email: "joao@silva.com",
  password: PASSWORD_HASH,
};

function getErrorMessages(props: UserState): string[] {
  const user = new User(props);

  try {
    user.validate();
  } catch (error) {
    return (error as ValidationException).errors.map((item) => item.message);
  }

  return [];
}

describe("User", () => {
  test("should create a valid user with base entity attributes", () => {
    const user = new User(validProps);

    expect(user.name).toBe(validProps.name);
    expect(user.email).toBe(validProps.email);
    expect(user.password).toBe(validProps.password);
    expect(new UuidRule().validate(user.id)).toBeNull();
    expect(user.createdAt).toBeInstanceOf(Date);
    expect(user.updatedAt.getTime()).toBe(user.createdAt.getTime());
    expect(user.deletedAt).toBeNull();
    expect(() => user.validate()).not.toThrow();
  });

  test("should not validate the user in the constructor", () => {
    expect(
      () => new User({ name: "", email: "email-invalido", password: "" }),
    ).not.toThrow();
  });

  test("should keep the provided timestamps", () => {
    const createdAt = new Date("2024-01-01T10:00:00.000Z");
    const updatedAt = new Date("2024-01-02T10:00:00.000Z");
    const deletedAt = new Date("2024-01-03T10:00:00.000Z");
    const user = new User({ ...validProps, createdAt, updatedAt, deletedAt });

    expect(user.createdAt.getTime()).toBe(createdAt.getTime());
    expect(user.updatedAt.getTime()).toBe(updatedAt.getTime());
    expect(user.deletedAt?.getTime()).toBe(deletedAt.getTime());
  });

  test("should update updatedAt when cloning", () => {
    const updatedAt = new Date("2024-01-02T10:00:00.000Z");
    const user = new User({ ...validProps, updatedAt });

    const clonedUser = user.clone({ name: "Maria Souza" });

    expect(clonedUser).toBeInstanceOf(User);
    expect(clonedUser.id).toBe(user.id);
    expect(clonedUser.name).toBe("Maria Souza");
    expect(clonedUser.updatedAt.getTime()).toBeGreaterThan(updatedAt.getTime());
  });

  test("should validate the clone data when validate is called", () => {
    const user = new User(validProps);

    const clonedUser = user.clone({ email: "email-invalido" });

    expect(() => clonedUser.validate()).toThrow(ValidationException);
  });

  test.each([
    "Ana Lu",
    "José Souza",
    "Maria-Clara D'Ávila",
    "Jean-Luc O'Neil",
    "  João   da   Silva  ",
  ])(
    "should accept the name %s",
    (name) => {
      expect(getErrorMessages({ ...validProps, name })).toEqual([]);
    },
  );

  test("should require the name", () => {
    expect(getErrorMessages({ ...validProps, name: "" })).toEqual([
      "user.name.required",
    ]);
  });

  test("should validate the name minimum length", () => {
    expect(getErrorMessages({ ...validProps, name: "Jo" })).toEqual([
      "user.name.min.length",
      "user.name.person.name",
    ]);
  });

  test("should validate the name maximum length", () => {
    const longName = `${"A".repeat(40)} ${"B".repeat(40)}`;

    expect(getErrorMessages({ ...validProps, name: longName })).toEqual([
      "user.name.max.length",
    ]);
    expect(getErrorMessages({ ...validProps, name: longName.slice(1) })).toEqual(
      [],
    );
  });

  test.each([
    "João Silva123",
    "João@Silva",
    "João_Silva",
    "João Silva-",
    "João.Silva",
    "João\nSilva",
    "Joãozinho",
  ])("should reject the name %s", (name) => {
    expect(getErrorMessages({ ...validProps, name })).toEqual([
      "user.name.person.name",
    ]);
  });

  test.each(["", "email-invalido", "joao@", "joao@silva", "joao silva@x.com"])(
    "should reject the email '%s'",
    (email) => {
      const messages = getErrorMessages({ ...validProps, email });

      expect(messages).toEqual([
        email === "" ? "user.email.required" : "user.email.invalid.email",
      ]);
    },
  );

  test.each([
    ["plain text", "Senha@123"],
    ["cost below range", PASSWORD_HASH.replace("$10$", "$03$")],
    ["cost above range", PASSWORD_HASH.replace("$10$", "$32$")],
    ["59 characters", PASSWORD_HASH.slice(0, -1)],
    ["61 characters", `${PASSWORD_HASH}a`],
    ["invalid characters", `${PASSWORD_HASH.slice(0, -1)}!`],
    ["wrong prefix", PASSWORD_HASH.replace("$2b$10$", "$1$10$")],
  ])("should reject the password hash with %s", (_, password) => {
    expect(getErrorMessages({ ...validProps, password })).toEqual([
      "user.password.bcrypt.hash",
    ]);
  });

  test("should accept an empty password", () => {
    expect(getErrorMessages({ ...validProps, password: "" })).toEqual([]);
  });
});
