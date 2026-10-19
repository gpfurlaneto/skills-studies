{{helpers}}

describe("{{name}}", () => {
  test("should return the requested page", async () => {
    const items = [make{{entity}}(), make{{entity}}(), make{{entity}}()];
    const { useCase } = makeSut(new {{repoFake}}(items));
    const {{entityCamel}} = items[2]!;

    await expect(useCase.execute({ page: 2, pageSize: 2 })).resolves.toEqual({
      items: [
        {
{{outMapping}}
        },
      ],
      page: 2,
      pageSize: 2,
      totalItems: 3,
      totalPages: 2,
    });
  });

  test("should return an empty page when there is nothing to list", async () => {
    const { useCase } = makeSut();

    await expect(useCase.execute({ page: 1, pageSize: 10 })).resolves.toEqual({
      items: [],
      page: 1,
      pageSize: 10,
      totalItems: 0,
      totalPages: 0,
    });
  });

  test.each([
    [{ page: 0, pageSize: 10 }, ["page.min.value"]],
    [{ page: 1.5, pageSize: 10 }, ["page.integer"]],
    [{ page: 1, pageSize: 0 }, ["pageSize.min.value"]],
    [{ page: 1, pageSize: 2.5 }, ["pageSize.integer"]],
  ])(
    "should reject the invalid page request %o before querying",
    async (request, expected) => {
      class Spy{{repoInterface}} extends {{repoFake}} {
        findPageCalls = 0;

        override async findPage(...args: Parameters<{{repoFake}}["findPage"]>) {
          this.findPageCalls++;
          return super.findPage(...args);
        }
      }

      const {{repo}} = new Spy{{repoInterface}}();
      const { useCase } = makeSut({{repo}});

      await expect(getErrorMessages(useCase.execute(request))).resolves.toEqual(
        expected,
      );
      expect({{repo}}.findPageCalls).toBe(0);
    },
  );

  test("should propagate repository errors", async () => {
    class Failing{{repoInterface}} extends {{repoFake}} {
      override async findPage(): Promise<never> {
        throw new Error("repository error");
      }
    }

    const { useCase } = makeSut(new Failing{{repoInterface}}());

    await expect(useCase.execute({ page: 1, pageSize: 10 })).rejects.toThrow(
      "repository error",
    );
  });
});
