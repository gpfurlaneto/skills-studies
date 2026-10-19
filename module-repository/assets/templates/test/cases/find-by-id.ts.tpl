
  test("should find the {{words}} by id", async () => {
    const {{camel}} = make{{pascal}}();
    const repository = new {{fakeClass}}([{{camel}}]);

    await expect(repository.findById({{camel}}.id)).resolves.toBe({{camel}});
    await expect(repository.findById("missing")).resolves.toBeNull();
  });
