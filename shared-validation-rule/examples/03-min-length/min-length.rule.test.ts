import { MinLengthRule } from "../../../src/index";

describe("MinLengthRule", () => {
  test("should validate minimum string size", () => {
    const rule = new MinLengthRule(3);

    expect(rule.validate("ab")).toBe("min.length");
    expect(rule.validate("abc")).toBeNull();
  });

  test("should validate minimum array size", () => {
    const rule = new MinLengthRule(2);

    expect(rule.validate(["a"])).toBe("min.length");
    expect(rule.validate(["a", "b"])).toBeNull();
  });

  test("should reject values without length and ignore empty", () => {
    const rule = new MinLengthRule(3);

    expect(rule.validate(10)).toBe("min.length");
    expect(rule.validate("")).toBeNull();
    expect(rule.validate(null)).toBeNull();
  });
});
