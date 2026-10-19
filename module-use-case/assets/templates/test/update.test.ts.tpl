{{helpers}}

const validInput: Omit<{{name}}In, "id"> = {
  // TODO(module-use-case): fill with values that pass {{entity}}.validate() and differ from validState.
};

describe("{{name}}", () => {
  test("should update and persist the {{label}}", async () => {
    const existing = make{{entity}}();
    const { useCase, {{repo}} } = makeSut(new {{repoFake}}([existing]));

{{#output}}
    const output = await useCase.execute({ id: existing.id, ...validInput });
{{/output}}
{{^output}}
    await expect(
      useCase.execute({ id: existing.id, ...validInput }),
    ).resolves.toBeUndefined();
{{/output}}

    const {{entityCamel}} = (await {{repo}}.findById(existing.id))!;

    expect({{entityCamel}}).toBeInstanceOf({{entity}});
    expect({{entityCamel}}).not.toBe(existing);
    expect({{entityCamel}}).toMatchObject({ id: existing.id, ...validInput });
    expect({{entityCamel}}.createdAt).toEqual(existing.createdAt);
{{#output}}
    expect(output).toEqual({
{{outMapping}}
    });
{{/output}}
  });

  test("should throw NotFoundError when the {{label}} does not exist", async () => {
    const { useCase, {{repo}} } = makeSut();

    const promise = useCase.execute({ id: "missing-id", ...validInput });

    await expect(promise).rejects.toBeInstanceOf(NotFoundError);
    await expect(promise).rejects.toThrow("{{code}}.not.found");
    expect({{repo}}.items).toHaveLength(0);
  });

  test("should not persist an invalid {{label}}", async () => {
    const existing = make{{entity}}();
    const { useCase, {{repo}} } = makeSut(new {{repoFake}}([existing]));

    const messages = await getErrorMessages(
      useCase.execute({
        id: existing.id,
        ...validInput,
        // TODO(module-use-case): override a field with a value rejected by {{entity}}.validate().
      }),
    );

    // TODO(module-use-case): list the exact error codes, e.g. "{{code}}.<field>.<rule>".
    expect(messages).toEqual([]);
    await expect({{repo}}.findById(existing.id)).resolves.toBe(existing);
  });

  test("should propagate repository errors", async () => {
    class Failing{{repoInterface}} extends {{repoFake}} {
      override async update(): Promise<never> {
        throw new Error("repository error");
      }
    }

    const existing = make{{entity}}();
    const { useCase } = makeSut(new Failing{{repoInterface}}([existing]));

    await expect(
      useCase.execute({ id: existing.id, ...validInput }),
    ).rejects.toThrow("repository error");
  });
});
