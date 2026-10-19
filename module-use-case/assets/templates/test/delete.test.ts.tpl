{{helpers}}

describe("{{name}}", () => {
  test("should delete the {{label}}", async () => {
    const {{entityCamel}} = make{{entity}}();
    const { useCase, {{repo}} } = makeSut(new {{repoFake}}([{{entityCamel}}]));

{{#output}}
    await expect(useCase.execute({ id: {{entityCamel}}.id })).resolves.toEqual({
{{outMapping}}
    });
{{/output}}
{{^output}}
    await expect(
      useCase.execute({ id: {{entityCamel}}.id }),
    ).resolves.toBeUndefined();
{{/output}}

    await expect({{repo}}.findById({{entityCamel}}.id)).resolves.toBeNull();
  });

  test("should throw NotFoundError when the {{label}} does not exist", async () => {
    const {{entityCamel}} = make{{entity}}();
    const { useCase, {{repo}} } = makeSut(new {{repoFake}}([{{entityCamel}}]));

    const promise = useCase.execute({ id: "missing-id" });

    await expect(promise).rejects.toBeInstanceOf(NotFoundError);
    await expect(promise).rejects.toThrow("{{code}}.not.found");
    expect({{repo}}.items).toEqual([{{entityCamel}}]);
  });

  test("should propagate repository errors", async () => {
    class Failing{{repoInterface}} extends {{repoFake}} {
      override async delete(): Promise<never> {
        throw new Error("repository error");
      }
    }

    const {{entityCamel}} = make{{entity}}();
    const { useCase } = makeSut(new Failing{{repoInterface}}([{{entityCamel}}]));

    await expect(
      useCase.execute({ id: {{entityCamel}}.id }),
    ).rejects.toThrow("repository error");
  });
});
