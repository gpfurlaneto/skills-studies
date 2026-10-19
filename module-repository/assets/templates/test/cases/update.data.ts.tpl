
  test("should update an existing {{words}} from its data", async () => {
    const {{camel}} = make{{pascal}}();
    const repository = new {{fakeClass}}([{{camel}}]);
    const updatedAt = new Date("2024-01-02T10:00:00.000Z");

    const updated{{pascal}} = await repository.update({ id: {{camel}}.id, updatedAt });

    expect(updated{{pascal}}.id).toBe({{camel}}.id);
    expect(updated{{pascal}}.updatedAt).toEqual(updatedAt);
    expect(repository.items).toEqual([updated{{pascal}}]);
  });

  test("should not update a missing {{words}}", async () => {
    await expect(
      new {{fakeClass}}().update({ id: make{{pascal}}().id }),
    ).rejects.toThrow(NotFoundError);
  });
