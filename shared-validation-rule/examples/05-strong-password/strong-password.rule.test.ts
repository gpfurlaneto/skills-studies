import { StrongPasswordRule } from "../../../src/index";

describe("StrongPasswordRule", () => {
  test("should accept passwords with upper, lower, number and special char", () => {
    const rule = new StrongPasswordRule();

    expect(rule.validate("Abcdef1!")).toBeNull();
    expect(rule.validate(["Abcdef1!", "Xyz@1234"])).toBeNull();
  });

  test("should reject passwords missing any required character group", () => {
    const rule = new StrongPasswordRule();

    expect(rule.validate("abcdef1!")).toBe("strong.password");
    expect(rule.validate("ABCDEF1!")).toBe("strong.password");
    expect(rule.validate("Abcdefg!")).toBe("strong.password");
    expect(rule.validate("Abcdefg1")).toBe("strong.password");
    expect(rule.validate(["Abcdef1!", "weak"])).toBe("strong.password");
  });

  test("should respect the default and custom minimum length boundaries", () => {
    const defaultRule = new StrongPasswordRule();
    const customRule = new StrongPasswordRule(12);

    expect(defaultRule.minLength).toBe(8);
    expect(defaultRule.validate("Abcde1!")).toBe("strong.password");
    expect(customRule.validate("Abcdefgh1!x")).toBe("strong.password");
    expect(customRule.validate("Abcdefgh1!xy")).toBeNull();
  });

  test("should reject non-string values and ignore empty", () => {
    const rule = new StrongPasswordRule();

    expect(rule.validate(12345678)).toBe("strong.password");
    expect(rule.validate("")).toBeNull();
    expect(rule.validate(null)).toBeNull();
    expect(rule.validate(undefined)).toBeNull();
  });
});
