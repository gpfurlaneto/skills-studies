
  test("should create the {{words}}", async () => {
    const repository = new {{fakeClass}}();
    const {{camel}} = make{{pascal}}();

    await expect(repository.create({{camel}})).resolves.toBe({{camel}});
    expect(repository.items).toEqual([{{camel}}]);
  });

  test("should not create the {{words}} with a duplicated id", async () => {
    const {{camel}} = make{{pascal}}();
    const repository = new {{fakeClass}}([{{camel}}]);

    await expect(repository.create({{camel}})).rejects.toThrow(
      "{{code}}.already.exists",
    );
  });
