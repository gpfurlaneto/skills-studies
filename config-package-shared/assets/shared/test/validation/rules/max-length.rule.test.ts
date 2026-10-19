import { MaxLengthRule } from "../../../src/index";

describe("MaxLengthRule", () => {
  test("should validate maximum string size", () => {
    const rule = new MaxLengthRule(5);

    expect(rule.validate("abc")).toBeNull();
    expect(rule.validate("abcdef")).toBe("max.length");
  });

  test("should validate maximum array size", () => {
    const rule = new MaxLengthRule(2);

    expect(rule.validate(["a", "b"])).toBeNull();
    expect(rule.validate(["a", "b", "c"])).toBe("max.length");
  });

  test("should reject values without length and ignore empty", () => {
    const rule = new MaxLengthRule(5);

    expect(rule.validate(10)).toBe("max.length");
    expect(rule.validate("")).toBeNull();
    expect(rule.validate(undefined)).toBeNull();
  });
});
