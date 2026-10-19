import {
  EmailRule,
  MinLengthRule,
  RangeLengthRule,
  RequiredRule,
  ValidationField,
  ValidationException,
  Validator,
} from "../../src/index";

describe("Validator", () => {
  test("should pass without returning anything when there are no errors", () => {
    const fields: ValidationField[] = [
      {
        code: "name",
        value: "John Doe",
        rules: [new RequiredRule()],
      },
      {
        code: "email",
        value: "john@doe.com",
        rules: [new RequiredRule(), new EmailRule()],
      },
    ];

    expect(Validator.validate(fields)).toBeUndefined();
  });

  test.only("should aggregate errors from multiple fields in a single execution", () => {
    const fields: ValidationField[] = [
      {
        code: "id",
        value: "",
        rules: [new RequiredRule()],
      },
      {
        code: "name",
        value: "ab",
        rules: [new RequiredRule(), new RangeLengthRule(3, 10)],
      },
      {
        code: "email",
        value: "email-invalido",
        rules: [new RequiredRule(), new EmailRule()],
      },
      {
        code: "description",
        value: "curta",
        rules: [new MinLengthRule(10)],
      },
    ];

    try {
      Validator.validate(fields);
      fail("expected to throw ValidationException");
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationException);
      expect(
        (error as ValidationException).errors.map((item) => item.message),
      ).toEqual([
        "id.required",
        "name.range.length",
        "email.invalid.email",
        "description.min.length",
      ]);
    }
  });

  test("should accumulate all errors from the same field", () => {
    const fields: ValidationField[] = [
      {
        code: "email",
        value: "abc",
        rules: [new EmailRule(), new MinLengthRule(10)],
      },
    ];

    expect(() => Validator.validate(fields)).toThrow(ValidationException);

    try {
      Validator.validate(fields);
    } catch (error) {
      expect(
        (error as ValidationException).errors.map((item) => item.message),
      ).toEqual(["email.invalid.email", "email.min.length"]);
    }
  });
});
