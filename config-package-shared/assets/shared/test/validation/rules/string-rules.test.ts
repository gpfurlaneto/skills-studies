import {
  AlphaNumericRule,
  AlphaRule,
  ContainsRule,
  EndsWithRule,
  LowerCaseRule,
  NoWhitespaceRule,
  PersonNameRule,
  RegexRule,
  StartsWithRule,
  TrimRule,
  UpperCaseRule,
} from "../../../src/index";

describe("String rules", () => {
  test("TrimRule should accept strings without outer spaces and ignore empty", () => {
    const rule = new TrimRule();

    expect(rule.validate("text")).toBeNull();
    expect(rule.validate(["abc", "def"])).toBeNull();
    expect(rule.validate(" text ")).toBe("trim");
    expect(rule.validate("")).toBeNull();
    expect(rule.validate(null)).toBeNull();
  });

  test("NoWhitespaceRule should reject any whitespace", () => {
    const rule = new NoWhitespaceRule();

    expect(rule.validate("abcdef")).toBeNull();
    expect(rule.validate("abc def")).toBe("no.whitespace");
    expect(rule.validate(123)).toBe("no.whitespace");
  });

  test("AlphaRule should accept only letters", () => {
    const rule = new AlphaRule();

    expect(rule.validate("abcXYZ")).toBeNull();
    expect(rule.validate("abc1")).toBe("alpha");
  });

  test("PersonNameRule should accept full names with extra spaces and reject invalid formats", () => {
    const rule = new PersonNameRule();

    expect(rule.validate("John Silva")).toBeNull();
    expect(rule.validate("  Mary   Clara  Souza ")).toBeNull();
    expect(rule.validate("Ana Maria")).toBeNull();
    expect(rule.validate("John")).toBe("person.name");
    expect(rule.validate("Jo@o Silva")).toBe("person.name");
    expect(rule.validate("John 123 Silva")).toBe("person.name");
    expect(rule.validate("José D'Ávila")).toBeNull();
    expect(rule.validate("Maria-Clara Souza")).toBeNull();
    expect(rule.validate("John\tSilva")).toBeNull();
    expect(rule.validate("John_Silva")).toBe("person.name");
    expect(rule.validate("John.Silva")).toBe("person.name");
    expect(rule.validate("John- Silva")).toBe("person.name");
    expect(rule.validate("John\nSilva")).toBe("person.name");
    expect(rule.validate("")).toBeNull();
    expect(rule.validate(123)).toBe("person.name");
  });

  test("AlphaNumericRule should accept only letters and numbers", () => {
    const rule = new AlphaNumericRule();

    expect(rule.validate("abc123")).toBeNull();
    expect(rule.validate("abc-123")).toBe("alpha.numeric");
  });

  test("StartsWithRule should validate prefixes", () => {
    const rule = new StartsWithRule("pre");

    expect(rule.validate(["prefix", "prepare"])).toBeNull();
    expect(rule.validate("suffix")).toBe("starts.with");
  });

  test("EndsWithRule should validate suffixes", () => {
    const rule = new EndsWithRule(".txt");

    expect(rule.validate("file.txt")).toBeNull();
    expect(rule.validate("file.csv")).toBe("ends.with");
  });

  test("ContainsRule should validate substring", () => {
    const rule = new ContainsRule("mid");

    expect(rule.validate("prefix-mid-suffix")).toBeNull();
    expect(rule.validate("prefix-suffix")).toBe("contains");
  });

  test("RegexRule should accept string or regexp and reset lastIndex", () => {
    const globalRule = new RegexRule(/foo/g);
    const stringRule = new RegexRule("^\\d+$");

    expect(globalRule.validate("foo")).toBeNull();
    expect(globalRule.validate("foo")).toBeNull();
    expect(stringRule.validate("123")).toBeNull();
    expect(stringRule.validate("abc")).toBe("regex");
  });

  test("UpperCaseRule should accept only uppercase letters", () => {
    const rule = new UpperCaseRule();

    expect(rule.validate("ABC")).toBeNull();
    expect(rule.validate("AB1")).toBe("upper.case");
  });

  test("LowerCaseRule should accept only lowercase letters", () => {
    const rule = new LowerCaseRule();

    expect(rule.validate("abc")).toBeNull();
    expect(rule.validate("Abc")).toBe("lower.case");
  });
});
