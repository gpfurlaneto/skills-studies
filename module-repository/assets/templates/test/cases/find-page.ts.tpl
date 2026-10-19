
  test("should paginate the {{pluralWords}}", async () => {
    const {{plural}} = [make{{pascal}}(), make{{pascal}}(), make{{pascal}}()];
    const repository = new {{fakeClass}}({{plural}});

    await expect(repository.findPage({ page: 2, pageSize: 2 })).resolves.toEqual({
      items: [{{plural}}[2]],
      page: 2,
      pageSize: 2,
      totalItems: 3,
      totalPages: 2,
    });
  });

  test("should sort the {{pluralWords}} by multiple fields", async () => {
    const date = new Date("2024-01-01T10:00:00.000Z");
    const newest = make{{pascal}}({ createdAt: new Date("2024-01-02T10:00:00.000Z") });
    const updatedFirst = make{{pascal}}({ createdAt: date, updatedAt: date });
    const updatedLast = make{{pascal}}({
      createdAt: date,
      updatedAt: new Date("2024-01-03T10:00:00.000Z"),
    });
    const repository = new {{fakeClass}}([updatedLast, newest, updatedFirst]);

    const page = await repository.findPage({
      page: 1,
      pageSize: 10,
      sort: [
        { field: "createdAt", direction: "desc" },
        { field: "updatedAt", direction: "asc" },
      ],
    });

    expect(page.items).toEqual([newest, updatedFirst, updatedLast]);
  });

  test("should sort empty values first in ascending order", async () => {
    const deleted{{pascal}} = make{{pascal}}({
      deletedAt: new Date("2024-01-01T10:00:00.000Z"),
    });
    const active{{pascal}} = make{{pascal}}();
    const repository = new {{fakeClass}}([deleted{{pascal}}, active{{pascal}}]);

    const page = await repository.findPage({
      page: 1,
      pageSize: 10,
      sort: [{ field: "deletedAt", direction: "asc" }],
    });

    expect(page.items).toEqual([active{{pascal}}, deleted{{pascal}}]);
  });
