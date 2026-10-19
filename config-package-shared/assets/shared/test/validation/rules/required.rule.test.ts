import { RequiredRule } from "../../../src/index";

describe("RequiredRule", () => {
  test("should reject empty values", () => {
    const rule = new RequiredRule();

    expect(rule.validate("")).toBe("required");
    expect(rule.validate("   ")).toBe("required");
    expect(rule.validate([])).toBe("required");
    expect(rule.validate(null)).toBe("required");
    expect(rule.validate(undefined)).toBe("required");
  });

  test("should accept filled values", () => {
    const rule = new RequiredRule();

    expect(rule.validate("john")).toBeNull();
    expect(rule.validate(false)).toBeNull();
    expect(rule.validate(0)).toBeNull();
    expect(rule.validate(["item"])).toBeNull();
  });
});
