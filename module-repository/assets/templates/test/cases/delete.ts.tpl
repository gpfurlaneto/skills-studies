
  test("should delete an existing {{words}}", async () => {
    const {{camel}} = make{{pascal}}();
    const repository = new {{fakeClass}}([{{camel}}]);

    await repository.delete({{camel}}.id);

    expect(repository.items).toEqual([]);
    await expect(repository.delete({{camel}}.id)).rejects.toThrow(NotFoundError);
  });
