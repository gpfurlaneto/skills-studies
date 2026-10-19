{{helpers}}

const validInput: {{name}}In = {
  // TODO(module-use-case): fill with values that pass {{entity}}.validate().
};

describe("{{name}}", () => {
  test("should create and persist the {{label}}", async () => {
    const { useCase, {{repo}} } = makeSut();

{{#output}}
    const output = await useCase.execute(validInput);
{{/output}}
{{^output}}
    await expect(useCase.execute(validInput)).resolves.toBeUndefined();
{{/output}}

    expect({{repo}}.items).toHaveLength(1);

    const {{entityCamel}} = {{repo}}.items[0]!;

    expect({{entityCamel}}).toBeInstanceOf({{entity}});
    expect({{entityCamel}}).toMatchObject(validInput);
{{#output}}
    expect(output).toEqual({
{{outMapping}}
    });
{{/output}}
  });

  test("should not persist an invalid {{label}}", async () => {
    const { useCase, {{repo}} } = makeSut();

    const messages = await getErrorMessages(
      useCase.execute({
        ...validInput,
        // TODO(module-use-case): override a field with a value rejected by {{entity}}.validate().
      }),
    );

    // TODO(module-use-case): list the exact error codes, e.g. "{{code}}.<field>.<rule>".
    expect(messages).toEqual([]);
    expect({{repo}}.items).toHaveLength(0);
  });

  test("should propagate repository errors", async () => {
    class Failing{{repoInterface}} extends {{repoFake}} {
      override async create(): Promise<never> {
        throw new Error("repository error");
      }
    }

    const { useCase } = makeSut(new Failing{{repoInterface}}());

    await expect(useCase.execute(validInput)).rejects.toThrow("repository error");
  });
});
