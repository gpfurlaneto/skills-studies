
  test("should update an existing {{words}}", async () => {
    const {{camel}} = make{{pascal}}();
    const repository = new {{fakeClass}}([{{camel}}]);
    const updated{{pascal}} = {{camel}}.clone({
      updatedAt: new Date("2024-01-02T10:00:00.000Z"),
    });

    await expect(repository.update(updated{{pascal}})).resolves.toBe(updated{{pascal}});
    expect(repository.items).toEqual([updated{{pascal}}]);
  });

  test("should not update a missing {{words}}", async () => {
    await expect(
      new {{fakeClass}}().update(make{{pascal}}()),
    ).rejects.toThrow(NotFoundError);
  });
