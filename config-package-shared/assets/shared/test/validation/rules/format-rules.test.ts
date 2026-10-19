import {
  HexColorRule,
  JsonStringRule,
  SlugRule,
  UuidRule,
} from "../../../src/index";

describe("Format rules", () => {
  test("UuidRule should accept only UUID v4", () => {
    const rule = new UuidRule();

    expect(rule.validate("550e8400-e29b-41d4-a716-446655440000")).toBeNull();
    expect(rule.validate("6ba7b810-9dad-11d1-80b4-00c04fd430c8")).toBe("uuid");
  });

  test("SlugRule should accept only valid slugs", () => {
    const rule = new SlugRule();

    expect(rule.validate("my-text-here")).toBeNull();
    expect(rule.validate("MyTextHere")).toBe("slug");
  });

  test("HexColorRule should validate hexadecimal colors", () => {
    const rule = new HexColorRule();

    expect(rule.validate("#FFF")).toBeNull();
    expect(rule.validate("#ffffff")).toBeNull();
    expect(rule.validate("FFF")).toBe("hex.color");
  });

  test("JsonStringRule should validate parseable JSON", () => {
    const rule = new JsonStringRule();

    expect(rule.validate('{"name":"john"}')).toBeNull();
    expect(rule.validate("[]")).toBeNull();
    expect(rule.validate("{")).toBe("json.string");
    expect(rule.validate("")).toBeNull();
  });
});
