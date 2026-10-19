import { PersonNameRule } from "../../../src/index";

describe("PersonNameRule", () => {
  test("should accept full names with accents, apostrophes, hyphens and extra spaces", () => {
    const rule = new PersonNameRule();

    expect(rule.validate("John Silva")).toBeNull();
    expect(rule.validate("  Mary   Clara  Souza ")).toBeNull();
    expect(rule.validate("José D'Ávila")).toBeNull();
    expect(rule.validate("Maria-Clara Souza")).toBeNull();
    expect(rule.validate("John\tSilva")).toBeNull();
  });

  test("should reject single names and invalid characters", () => {
    const rule = new PersonNameRule();

    expect(rule.validate("John")).toBe("person.name");
    expect(rule.validate("Jo@o Silva")).toBe("person.name");
    expect(rule.validate("John 123 Silva")).toBe("person.name");
    expect(rule.validate("John_Silva")).toBe("person.name");
    expect(rule.validate("John- Silva")).toBe("person.name");
    expect(rule.validate("John\nSilva")).toBe("person.name");
  });

  test("should reject non-string values and ignore empty", () => {
    const rule = new PersonNameRule();

    expect(rule.validate(123)).toBe("person.name");
    expect(rule.validate("")).toBeNull();
    expect(rule.validate(null)).toBeNull();
  });
});
