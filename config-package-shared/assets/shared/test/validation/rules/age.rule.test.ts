import { AgeRule } from "../../../src/index";

describe("AgeRule", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-03-31T12:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("should accept age within range", () => {
    const rule = new AgeRule(18, 65);

    expect(rule.validate("2000-03-31")).toBeNull();
    expect(rule.validate("1961-03-31")).toBeNull();
  });

  test("should reject age outside range", () => {
    const rule = new AgeRule(18, 65);

    expect(rule.validate("2010-04-01")).toBe("age.range");
    expect(rule.validate("1940-03-30")).toBe("age.range");
  });

  test("should reject invalid date and ignore empty values", () => {
    const rule = new AgeRule(18, 65);

    expect(rule.validate("invalid-date")).toBe("age.range");
    expect(rule.validate("")).toBeNull();
    expect(rule.validate(null)).toBeNull();
  });

  test("should adjust age when birthday hasn't happened yet in the reference year", () => {
    const rule = new AgeRule(18, 65) as AgeRule & {
      getAgeFromBirthDate(birthDate: Date, referenceDate: Date): number;
    };

    expect(
      rule.getAgeFromBirthDate(
        new Date(2008, 3, 1),
        new Date(2026, 2, 31, 12),
      ),
    ).toBe(17);
  });
});
