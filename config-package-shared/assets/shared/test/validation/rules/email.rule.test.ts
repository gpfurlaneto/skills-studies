import { EmailRule } from "../../../src/index";

describe("EmailRule", () => {
  test("should accept valid emails", () => {
    const rule = new EmailRule();

    expect(rule.validate("john@doe.com")).toBeNull();
    expect(rule.validate(" john@doe.com ")).toBeNull();
  });

  test("should reject invalid emails", () => {
    const rule = new EmailRule();

    expect(rule.validate("john@doe")).toBe("invalid.email");
    expect(rule.validate("john doe")).toBe("invalid.email");
    expect(rule.validate(123)).toBe("invalid.email");
  });

  test("should ignore empty values to allow optional field", () => {
    const rule = new EmailRule();

    expect(rule.validate("")).toBeNull();
    expect(rule.validate("   ")).toBeNull();
    expect(rule.validate(null)).toBeNull();
    expect(rule.validate(undefined)).toBeNull();
  });
});
