
  test("should create the {{words}} from its data", async () => {
    const repository = new {{fakeClass}}();

    const {{camel}} = await repository.create(make{{pascal}}State());

    expect({{camel}}).toBeInstanceOf({{pascal}});
    expect(repository.items).toEqual([{{camel}}]);
  });

  test("should not create the {{words}} with a duplicated id", async () => {
    const {{camel}} = make{{pascal}}();
    const repository = new {{fakeClass}}([{{camel}}]);

    await expect(
      repository.create(make{{pascal}}State({ id: {{camel}}.id })),
    ).rejects.toThrow("{{code}}.already.exists");
  });
