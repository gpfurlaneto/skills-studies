{{helpers}}

describe("{{name}}", () => {
  test("should return the {{label}}", async () => {
    const {{entityCamel}} = make{{entity}}();
    const { useCase } = makeSut(new {{repoFake}}([{{entityCamel}}]));

    await expect(useCase.execute({ id: {{entityCamel}}.id })).resolves.toEqual({
{{outMapping}}
    });
  });

  test("should throw NotFoundError when the {{label}} does not exist", async () => {
    const { useCase } = makeSut(new {{repoFake}}([make{{entity}}()]));

    const promise = useCase.execute({ id: "missing-id" });

    await expect(promise).rejects.toBeInstanceOf(NotFoundError);
    await expect(promise).rejects.toThrow("{{code}}.not.found");
  });

  test("should propagate repository errors", async () => {
    class Failing{{repoInterface}} extends {{repoFake}} {
      override async findById(): Promise<never> {
        throw new Error("repository error");
      }
    }

    const { useCase } = makeSut(new Failing{{repoInterface}}());

    await expect(useCase.execute({ id: "any-id" })).rejects.toThrow(
      "repository error",
    );
  });
});
