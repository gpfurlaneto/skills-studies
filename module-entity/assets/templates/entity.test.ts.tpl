import { UuidRule, ValidationException } from "{{sharedPackage}}";
import { {{pascal}}, {{pascal}}State } from "{{srcImport}}";

const validProps: {{pascal}}State = {
{{validProps}}
};

function getErrorMessages(props: {{pascal}}State): string[] {
  const {{camel}} = new {{pascal}}(props);

  try {
    {{camel}}.validate();
  } catch (error) {
    return (error as ValidationException).errors.map((item) => item.message);
  }

  return [];
}

describe("{{pascal}}", () => {
  test("should create a valid {{camel}} with base entity attributes", () => {
    const {{camel}} = new {{pascal}}(validProps);

{{getterAssertions}}
    expect(new UuidRule().validate({{camel}}.id)).toBeNull();
    expect({{camel}}.createdAt).toBeInstanceOf(Date);
    expect({{camel}}.updatedAt.getTime()).toBe({{camel}}.createdAt.getTime());
    expect({{camel}}.deletedAt).toBeNull();
    expect(() => {{camel}}.validate()).not.toThrow();
  });

  test("should not validate the {{camel}} in the constructor", () => {
    const invalidProps = {
      // TODO(module-entity): one invalid value for every field
    } as unknown as {{pascal}}State;

    expect(() => new {{pascal}}(invalidProps)).not.toThrow();
    expect(() => new {{pascal}}(invalidProps).validate()).toThrow(
      ValidationException,
    );
  });

  test("should keep the provided base attributes", () => {
    const id = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
    const createdAt = new Date("2024-01-01T10:00:00.000Z");
    const updatedAt = new Date("2024-01-02T10:00:00.000Z");
    const deletedAt = new Date("2024-01-03T10:00:00.000Z");
    const {{camel}} = new {{pascal}}({
      ...validProps,
      id,
      createdAt,
      updatedAt,
      deletedAt,
    });

    expect({{camel}}.id).toBe(id);
    expect({{camel}}.createdAt.getTime()).toBe(createdAt.getTime());
    expect({{camel}}.updatedAt.getTime()).toBe(updatedAt.getTime());
    expect({{camel}}.deletedAt?.getTime()).toBe(deletedAt.getTime());
  });

  test("should update updatedAt when cloning", () => {
    const updatedAt = new Date("2024-01-02T10:00:00.000Z");
    const {{camel}} = new {{pascal}}({ ...validProps, updatedAt });

    const cloned = {{camel}}.clone({
      // TODO(module-entity): change one field to another valid value
    });

    expect(cloned).toBeInstanceOf({{pascal}});
    expect(cloned.id).toBe({{camel}}.id);
    expect(cloned.createdAt.getTime()).toBe({{camel}}.createdAt.getTime());
    expect(cloned.updatedAt.getTime()).toBeGreaterThan(updatedAt.getTime());
    // TODO(module-entity): assert the changed field and one unchanged field
  });

  test("should validate the clone data only when validate is called", () => {
    const {{camel}} = new {{pascal}}(validProps);

    const cloned = {{camel}}.clone({
      // TODO(module-entity): change one field to an invalid value
    });

    expect(() => cloned.validate()).toThrow(ValidationException);
  });

  test("should report every invalid field at once", () => {
    expect(
      getErrorMessages({
        // TODO(module-entity): every field invalid
      } as unknown as {{pascal}}State),
    ).toEqual([
      // TODO(module-entity): every expected "{{camel}}.<field>.<code>", in validate() order
    ]);
  });

  // TODO(module-entity): one block of tests per field (accepted values, rejected values with the
  // exact error codes, boundaries, empty/optional behaviour). See the examples in the skill.
});
