import { RangeLengthRule } from "../../../src/index";

describe("RangeLengthRule", () => {
  test("should validate values within range", () => {
    const rule = new RangeLengthRule(3, 5);

    expect(rule.validate("ab")).toBe("range.length");
    expect(rule.validate("abcd")).toBeNull();
    expect(rule.validate("abcdef")).toBe("range.length");
  });

  test("should validate arrays within range", () => {
    const rule = new RangeLengthRule(2, 3);

    expect(rule.validate(["a"])).toBe("range.length");
    expect(rule.validate(["a", "b"])).toBeNull();
    expect(rule.validate(["a", "b", "c", "d"])).toBe("range.length");
  });

  test("should reject values without length and ignore empty", () => {
    const rule = new RangeLengthRule(3, 5);

    expect(rule.validate({})).toBe("range.length");
    expect(rule.validate("")).toBeNull();
    expect(rule.validate(null)).toBeNull();
  });
});
